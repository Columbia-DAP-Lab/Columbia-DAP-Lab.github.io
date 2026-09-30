import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/**
 * Who is signed in, and what they are allowed to do.
 *
 * Two independent things:
 *
 *   - Identity. Only Columbia accounts sign in at all (see `columbiaEmail`), and
 *     any of them may *submit* an event, a publication or a profile. Submitting is
 *     cheap and reversible; the point of the admin UI is that adding a talk should
 *     not require a pull request.
 *   - Capability. Publishing, editing and rejecting need a grant in the `roles`
 *     table. Grants are per-area, so an event editor need not be an admin.
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

export const requireSubmitter = async (ctx: QueryCtx | MutationCtx): Promise<string> => {
  const email = await currentEmail(ctx);
  if (email === null) throw new ConvexError("Sign in with your Columbia Google account (uni@columbia.edu).");
  return email;
};

export const capabilitiesFor = async (
  ctx: QueryCtx | MutationCtx,
  email: string,
): Promise<Capability[]> => {
  const row = await ctx.db
    .query("roles")
    .withIndex("by_email", (q) => q.eq("email", normalizeEmail(email)))
    .unique();
  return row?.capabilities ?? [];
};

/**
 * Require one capability, or `admin`, which implies the rest.
 *
 * Returns the acting email so callers can record it on the row they write.
 */
export const requireCapability = async (
  ctx: QueryCtx | MutationCtx,
  capability: Capability,
): Promise<string> => {
  const email = await currentEmail(ctx);
  if (email === null) throw new ConvexError("Sign in to continue.");
  const capabilities = await capabilitiesFor(ctx, email);
  if (!capabilities.includes(capability) && !capabilities.includes("admin")) {
    throw new ConvexError(`You do not have permission to manage ${capability}.`);
  }
  return email;
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
    capabilities: v.array(capabilityValidator),
  }),
  handler: async (ctx) => {
    const email = await currentEmail(ctx);
    if (email === null) {
      const signedInAs = await verifiedEmail(ctx);
      return { email: null, refused: signedInAs, capabilities: [] };
    }
    return { email, refused: null, capabilities: await capabilitiesFor(ctx, email) };
  },
});
