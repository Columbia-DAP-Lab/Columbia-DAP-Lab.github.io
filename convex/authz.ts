import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { matchKey } from "./authors";

/**
 * Who is signed in, and what they are allowed to do.
 *
 * Two independent things:
 *
 *   - Identity. Only Columbia accounts sign in at all (see `columbiaEmail`).
 *   - Access. Of those, only people on the lab's list get in (see `accessFor`):
 *     anyone an admin has added in the `roles` table, and current lab members on
 *     the People page, recognized by name. Members submit events and
 *     publications, which land as pending; admins review and publish them, add
 *     people, and manage the list.
 *
 * Identity always comes from ctx.auth, never from an argument: a caller-supplied
 * email would let anyone claim to be anyone.
 *
 * Refusals here and in admin.ts are ConvexErrors, not Errors: a production
 * deployment redacts a plain Error's message to "Server Error", and these messages
 * are meant for the person filling in the form.
 */

export type Capability = Doc<"roles">["capabilities"][number];

export const capabilityValidator = v.union(
  /** On the list: may submit events and publications. */
  v.literal("member"),
  v.literal("events"),
  v.literal("publications"),
  v.literal("people"),
  v.literal("admin"),
);

/** Emails are the join key to `roles`, so they are compared lowercased. */
const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Columbia's Google Workspace (LionMail): the `hd` claim on its ID tokens. */
const COLUMBIA_DOMAIN = "columbia.edu";

/** The verified email on the token, whoever it belongs to, or null. */
const verifiedEmail = async (ctx: QueryCtx | MutationCtx): Promise<string | null> => {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;
  // Google will issue a token for an unverified address, and an unverified
  // columbia.edu claim is not a Columbia identity.
  if (identity.emailVerified !== true) return null;
  return typeof identity.email === "string" ? normalizeEmail(identity.email) : null;
};

/**
 * The signed-in user's email if it is a Columbia account, or null.
 *
 * Two checks, because either alone can be faked. The address must be
 * @columbia.edu, and the token's `hd` (hosted domain) claim must be columbia.edu:
 * Google sets `hd` only for accounts managed by that Workspace, whereas anyone can
 * create a personal Google account on an existing columbia.edu address. Checked
 * here, on the server; the `hd` hint in the browser only filters the account
 * chooser.
 */
const columbiaEmail = async (ctx: QueryCtx | MutationCtx): Promise<string | null> => {
  const email = await verifiedEmail(ctx);
  if (email === null || !email.endsWith(`@${COLUMBIA_DOMAIN}`)) return null;
  const identity = await ctx.auth.getUserIdentity();
  return identity?.hd === COLUMBIA_DOMAIN ? email : null;
};

/** Every function reads the caller through this, so a non-Columbia account is simply signed out. */
export const currentEmail = columbiaEmail;

/** A grant is only reachable by someone who can sign in, so only Columbia addresses may hold one. */
export const isColumbiaAddress = (email: string) => normalizeEmail(email).endsWith(`@${COLUMBIA_DOMAIN}`);

/** People-page groups whose members may sign in without being added by hand. */
const CURRENT_MEMBERS = new Set<Doc<"people">["category"]>(["faculty", "postdoc", "phd", "student", "staff"]);

const isCurrentMember = (person: Doc<"people">) =>
  person.status === "published" && !person.hidden && CURRENT_MEMBERS.has(person.category);

/**
 * A name reduced for matching, plus its first and last words, so the directory's
 * "Haonan Peter Wang" and the Google account's "Haonan Wang" are the same person.
 */
const nameKeys = (name: string): string[] => {
  const key = matchKey(name);
  const words = key.split(" ");
  return words.length > 2 ? [key, `${words[0]} ${words[words.length - 1]}`] : [key];
};

/**
 * The current lab member this Columbia account belongs to, if any.
 *
 * By email when the profile records one; otherwise by the name on the Google
 * account, which comes from Columbia's directory. None of the migrated profiles
 * has an email, so the name is what lets the People page stand in for an
 * invitation list. Two people with the same name would both match — the most
 * either can do is submit something pending for an admin to review.
 */
export const labMemberFor = async (
  ctx: QueryCtx | MutationCtx,
  email: string,
  name: string | undefined,
): Promise<Doc<"people"> | null> => {
  const byEmail = await ctx.db
    .query("people")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
  if (byEmail !== null && isCurrentMember(byEmail)) return byEmail;
  if (!name) return null;

  const wanted = new Set(nameKeys(name));
  const published = await ctx.db
    .query("people")
    .withIndex("by_status_and_category", (q) => q.eq("status", "published"))
    .take(2000);
  return published.find((p) => isCurrentMember(p) && nameKeys(p.name).some((k) => wanted.has(k))) ?? null;
};

type Access = {
  email: string;
  capabilities: Capability[];
  /** How they got in: added by an admin, or matched to the People page. */
  via: "added" | "people" | null;
  /** The profile they were matched to, when `via` is "people". */
  person: string | null;
  /**
   * True while previewing as a member: `capabilities` is then just `member`,
   * though the account holds more.
   */
  viewingAsMember: boolean;
};

/**
 * What an email may do, for a caller identified some other way than ctx.auth
 * (the Slack review buttons): its added role, honoring a preview as a member.
 */
export const grantedCapabilities = async (ctx: QueryCtx | MutationCtx, email: string): Promise<Capability[]> => {
  const row = await roleFor(ctx, email);
  if (row === null) return [];
  return row.viewingAsMember === true && beyondMember(row.capabilities) ? ["member"] : row.capabilities;
};

/** Whether a grant holds anything beyond `member`, so there is something to preview without. */
const beyondMember = (capabilities: Capability[]) => capabilities.some((c) => c !== "member");

/**
 * The People-page profile that belongs to the signed-in account, whoever let
 * them in: an admin added by email has a profile too. Null if none matches.
 */
export const profileFor = async (ctx: QueryCtx | MutationCtx): Promise<Doc<"people"> | null> => {
  const email = await currentEmail(ctx);
  if (email === null) return null;
  const identity = await ctx.auth.getUserIdentity();
  return await labMemberFor(ctx, email, typeof identity?.name === "string" ? identity.name : undefined);
};

/**
 * Whether a signed-in Columbia account is on the list, and with what capabilities.
 * Null when nobody, or nobody from Columbia, is signed in.
 */
export const accessFor = async (ctx: QueryCtx | MutationCtx): Promise<Access | null> => {
  const email = await currentEmail(ctx);
  if (email === null) return null;
  const row = await roleFor(ctx, email);
  const granted = row?.capabilities ?? [];
  if (granted.length > 0) {
    const viewingAsMember = row?.viewingAsMember === true && beyondMember(granted);
    return {
      email,
      capabilities: viewingAsMember ? ["member"] : granted,
      via: "added",
      person: null,
      viewingAsMember,
    };
  }

  const identity = await ctx.auth.getUserIdentity();
  const name = typeof identity?.name === "string" ? identity.name : undefined;
  const person = await labMemberFor(ctx, email, name);
  if (person !== null) {
    return { email, capabilities: ["member"], via: "people", person: person.name, viewingAsMember: false };
  }
  return { email, capabilities: [], via: null, person: null, viewingAsMember: false };
};

const NOT_ON_LIST = "Your account is not on the DAPLab list yet. Ask a lab admin to add you.";

/** Anyone on the list may submit; what they submit is pending until an admin publishes it. */
export const requireSubmitter = async (ctx: QueryCtx | MutationCtx): Promise<string> => {
  const access = await accessFor(ctx);
  if (access === null) throw new ConvexError("Sign in with your Columbia Google account (uni@columbia.edu).");
  if (access.capabilities.length === 0) throw new ConvexError(NOT_ON_LIST);
  return access.email;
};

const roleFor = async (ctx: QueryCtx | MutationCtx, email: string): Promise<Doc<"roles"> | null> =>
  await ctx.db
    .query("roles")
    .withIndex("by_email", (q) => q.eq("email", normalizeEmail(email)))
    .unique();


/**
 * Require one capability, or `admin`, which implies the rest.
 *
 * Returns the acting email so callers can record it on the row they write.
 */
export const requireCapability = async (
  ctx: QueryCtx | MutationCtx,
  capability: Capability,
): Promise<string> => {
  const access = await accessFor(ctx);
  if (access === null) throw new ConvexError("Sign in to continue.");
  if (!access.capabilities.includes(capability) && !access.capabilities.includes("admin")) {
    throw new ConvexError(access.capabilities.length === 0 ? NOT_ON_LIST : "Only lab admins can do that.");
  }
  return access.email;
};

/**
 * What the signed-in user can do, for the admin UI to decide what to show.
 *
 * Hiding a button is a convenience, not a control: every mutation re-checks.
 */
export const me = query({
  args: {},
  returns: v.object({
    email: v.union(v.string(), v.null()),
    /**
     * Set when a Google account signed in but is not a Columbia one, so the page
     * can say so and sign it out rather than just showing the sign-in button.
     */
    refused: v.union(v.string(), v.null()),
    /** Set when a Columbia account signed in but is not on the list. */
    notOnList: v.union(v.string(), v.null()),
    capabilities: v.array(capabilityValidator),
    via: v.union(v.literal("added"), v.literal("people"), v.null()),
    person: v.union(v.string(), v.null()),
    /** Name on the People-page profile this account may edit, if any. */
    profile: v.union(v.string(), v.null()),
    /** The name on the Google account, to start the add-yourself form with. */
    name: v.union(v.string(), v.null()),
    /** Previewing as a member; `capabilities` is then just `member`. */
    viewingAsMember: v.boolean(),
  }),
  handler: async (ctx) => {
    const access = await accessFor(ctx);
    const identity = await ctx.auth.getUserIdentity();
    const name = typeof identity?.name === "string" ? identity.name : null;
    if (access === null) {
      return {
        email: null,
        refused: await verifiedEmail(ctx),
        notOnList: null,
        capabilities: [],
        via: null,
        person: null,
        profile: null,
        viewingAsMember: false,
        name,
      };
    }
    if (access.capabilities.length === 0) {
      return {
        email: null,
        refused: null,
        notOnList: access.email,
        capabilities: [],
        via: null,
        person: null,
        profile: null,
        viewingAsMember: false,
        name,
      };
    }
    const profile = await profileFor(ctx);
    return { ...access, refused: null, notOnList: null, profile: profile?.name ?? null, name };
  },
});

/**
 * Preview the admin page as a lab member sees it, or stop.
 *
 * Checked against the account's real grant, not accessFor, which reports only
 * `member` while a preview is on; otherwise there would be no way back.
 */
export const setViewingAsMember = mutation({
  args: { on: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = await currentEmail(ctx);
    if (email === null) throw new ConvexError("Sign in to continue.");
    const row = await roleFor(ctx, email);
    if (row === null || !beyondMember(row.capabilities)) {
      throw new ConvexError("You already see the page as a member does.");
    }
    await ctx.db.patch("roles", row._id, { viewingAsMember: args.on || undefined });
    return null;
  },
});
