import { HOUR, RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { isColumbiaAddress, labMemberFor, requireCapability, requireSubmitter } from "./authz";

/**
 * The database half of paste-to-fill (convex/extract.ts), kept apart so that file
 * can hold only an action and move to the Node runtime if the provider needs it.
 */

/**
 * Each read costs real money and takes a little while, and the forms are filled one
 * item at a time, so a person pasting at a normal pace never meets this. It is here
 * so a stuck script or a leaked session cannot run up a bill.
 */
const rateLimiter = new RateLimiter(components.rateLimiter, {
  extractFromText: { kind: "token bucket", rate: 30, period: HOUR, capacity: 10 },
});

const entry = v.object({ slug: v.string(), label: v.string(), description: v.optional(v.string()) });

/**
 * Check that the caller may submit and has reads left, and return the closed
 * vocabularies the model must choose from.
 */
export const begin = internalMutation({
  args: { kind: v.union(v.literal("event"), v.literal("publication"), v.literal("person")) },
  returns: v.object({ series: v.array(entry), topics: v.array(entry), fields: v.array(entry) }),
  handler: async (ctx, args) => {
    // Filling the person form is for whoever may submit one: admins.
    const email = args.kind === "person" ? await requireCapability(ctx, "people") : await requireSubmitter(ctx);
    return await limitedVocabulary(ctx, email);
  },
});

/** Spend one read from this person's allowance, then return the vocabularies. */
const limitedVocabulary = async (ctx: MutationCtx, email: string) => {
  const { ok, retryAfter } = await rateLimiter.limit(ctx, "extractFromText", { key: email });
  if (!ok) {
    const minutes = Math.max(1, Math.ceil(retryAfter / 60_000));
    throw new ConvexError(`Too many pastes in a row. Try again in ${minutes} min, or fill the form by hand.`);
  }

  const [series, topics, fields] = await Promise.all([
    ctx.db.query("eventSeries").take(100),
    ctx.db.query("topics").take(500),
    ctx.db.query("fields").take(500),
  ]);
  return {
    series: series
      .filter((s) => s.active)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({ slug: s.slug, label: s.label, description: s.description })),
    topics: topics.map((t) => ({ slug: t.slug, label: t.label, description: t.description })),
    fields: fields.map((f) => ({ slug: f.slug, label: f.label, description: f.kind })),
  };
};

/**
 * The same gate for a Slack message (convex/slack.ts), which arrives with no
 * sign-in: the sender is whoever Slack says, by the email on their profile.
 *
 * Mirrors accessFor in convex/authz.ts for an email that did not come from
 * ctx.auth: a Columbia address that an admin added, or a current lab member on
 * the People page. Returns a reason instead of throwing, so the bot can reply with it.
 */
export const beginForSlack = internalMutation({
  args: { email: v.string(), name: v.optional(v.string()) },
  returns: v.union(
    v.object({ ok: v.literal(true), vocab: v.object({ series: v.array(entry), topics: v.array(entry), fields: v.array(entry) }) }),
    v.object({ ok: v.literal(false), reason: v.string() }),
  ),
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (!isColumbiaAddress(email)) {
      return {
        ok: false as const,
        reason: `Your Slack profile's email is ${email}. Set it to your @columbia.edu address so I can match you to the lab list.`,
      };
    }
    const role = await ctx.db
      .query("roles")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    const onList = (role?.capabilities.length ?? 0) > 0 || (await labMemberFor(ctx, email, args.name)) !== null;
    if (!onList) {
      return { ok: false as const, reason: `${email} is not on the DAPLab list yet. Ask a lab admin to add you.` };
    }
    try {
      return { ok: true as const, vocab: await limitedVocabulary(ctx, email) };
    } catch (error) {
      if (error instanceof ConvexError) return { ok: false as const, reason: String(error.data) };
      throw error;
    }
  },
});
