import { v } from "convex/values";
import { query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/**
 * Who is signed in, and what they are allowed to do.
 *
 * Two independent things:
 *
 *   - Identity. Anyone with a verified @columbia.edu Google account may *submit*
 *     an event or a publication. Submitting is cheap and reversible; the point of
 *     the admin UI is that adding a talk should not require a pull request.
 *   - Capability. Publishing, editing and rejecting need a grant in the `roles`
 *     table. Grants are per-area, so an event editor need not be an admin, and a
 *     collaborator with no profile can hold one.
 *
 * Identity always comes from ctx.auth, never from an argument: a caller-supplied
 * email would let anyone claim to be anyone.
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

/**
 * The signed-in user's email, or null.
 *
 * `emailVerified` matters: Google will happily issue a token for an unverified
 * address, and an unverified columbia.edu claim is not a Columbia identity.
 */
export const currentEmail = async (ctx: QueryCtx | MutationCtx): Promise<string | null> => {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;
  if (identity.emailVerified === false) return null;
  return typeof identity.email === "string" ? normalizeEmail(identity.email) : null;
};

/** Anyone at Columbia may submit. Checked server-side; the `hd` claim in the browser proves nothing. */
export const isColumbia = (email: string) => email.endsWith("@columbia.edu");

export const requireSubmitter = async (ctx: QueryCtx | MutationCtx): Promise<string> => {
  const email = await currentEmail(ctx);
  if (email === null) throw new Error("Sign in with your Columbia Google account to submit.");
  // An outside collaborator with a grant can submit too, even without a UNI.
  if (!isColumbia(email) && (await capabilitiesFor(ctx, email)).length === 0) {
    throw new Error("Submissions are open to Columbia accounts.");
  }
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
  if (email === null) throw new Error("Sign in to continue.");
  const capabilities = await capabilitiesFor(ctx, email);
  if (!capabilities.includes(capability) && !capabilities.includes("admin")) {
    throw new Error(`You do not have permission to manage ${capability}.`);
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
    canSubmit: v.boolean(),
    capabilities: v.array(capabilityValidator),
  }),
  handler: async (ctx) => {
    const email = await currentEmail(ctx);
    if (email === null) return { email: null, canSubmit: false, capabilities: [] };
    const capabilities = await capabilitiesFor(ctx, email);
    return { email, canSubmit: isColumbia(email) || capabilities.length > 0, capabilities };
  },
});
