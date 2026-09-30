import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { capabilityValidator, requireCapability, requireSubmitter } from "./authz";
import { adjustAuthorCounts, peopleByMatchKey, upsertAuthor } from "./authors";

/**
 * The admin surface: submit content, review it, publish it.
 *
 * Anyone at Columbia may submit; publishing needs a capability (see authz.ts).
 * Every write records a revision and, when it changes what the public site shows,
 * schedules a rebuild.
 */

/** Tables this module manages, and the capability that governs each. */
const GOVERNS = {
  events: "events",
  publications: "publications",
  people: "people",
  news: "events",
} as const;

type ContentTable = keyof typeof GOVERNS;

const contentTableValidator = v.union(
  v.literal("events"),
  v.literal("publications"),
  v.literal("people"),
  v.literal("news"),
);

/**
 * Record what changed, and rebuild if the public site would differ.
 *
 * The rebuild is debounced in deployHook, so publishing several items in a row
 * produces one build rather than one per item.
 */
const record = async (
  ctx: MutationCtx,
  args: {
    table: ContentTable;
    documentId: string;
    action: Doc<"revisions">["action"];
    actor: string;
    snapshot?: unknown;
    affectsSite: boolean;
  },
) => {
  await ctx.db.insert("revisions", {
    table: args.table,
    documentId: args.documentId,
    action: args.action,
    actor: args.actor,
    at: Date.now(),
    snapshot: args.snapshot,
  });
  if (args.affectsSite) await ctx.scheduler.runAfter(0, internal.deployHook.requestRebuild, {});
};

const submissionFields = (submittedBy: string) => ({
  status: "pending" as const,
  submittedBy,
  submittedAt: Date.now(),
});

// --------------------------------------------------------------- submitting

/**
 * Propose an event. Lands as `pending`; an editor publishes it.
 *
 * Speakers arrive already split — the form has a row per speaker, which is the
 * whole reason the migration had to guess at comma-separated `who:` strings and
 * new submissions will not.
 */
export const submitEvent = mutation({
  args: {
    title: v.string(),
    series: v.string(),
    startDate: v.string(),
    endDate: v.optional(v.string()),
    timeLabel: v.optional(v.string()),
    location: v.optional(v.string()),
    link: v.optional(v.string()),
    description: v.optional(v.string()),
    speakers: v.array(
      v.object({
        name: v.string(),
        affiliation: v.optional(v.string()),
        role: v.optional(v.string()),
        url: v.optional(v.string()),
        bio: v.optional(v.string()),
      }),
    ),
  },
  returns: v.id("events"),
  handler: async (ctx, args) => {
    const email = await requireSubmitter(ctx);

    const series = await ctx.db
      .query("eventSeries")
      .withIndex("by_slug", (q) => q.eq("slug", args.series))
      .unique();
    if (series === null) throw new Error(`Unknown series: ${args.series}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.startDate)) throw new Error("Date must be YYYY-MM-DD.");

    const { speakers, ...event } = args;
    const eventId = await ctx.db.insert("events", { ...event, ...submissionFields(email) });
    for (const [position, speaker] of speakers.entries()) {
      await ctx.db.insert("eventSpeakers", { eventId, position, ...speaker });
    }

    // Pending content is invisible to the site, so no rebuild.
    await record(ctx, {
      table: "events",
      documentId: eventId,
      action: "create",
      actor: email,
      affectsSite: false,
    });
    return eventId;
  },
});

/** Propose a publication. Authors arrive as an ordered list, one row each. */
export const submitPublication = mutation({
  args: {
    title: v.string(),
    venue: v.string(),
    pubDate: v.string(),
    authors: v.array(v.string()),
    topics: v.array(v.string()),
    url: v.optional(v.string()),
    slidesUrl: v.optional(v.string()),
    codeUrl: v.optional(v.string()),
    comment: v.optional(v.string()),
  },
  returns: v.id("publications"),
  handler: async (ctx, args) => {
    const email = await requireSubmitter(ctx);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.pubDate)) throw new Error("Date must be YYYY-MM-DD.");

    // The vocabulary is closed: a typo here would create a filter nothing matches.
    for (const slug of args.topics) {
      const topic = await ctx.db
        .query("topics")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();
      if (topic === null) throw new Error(`Unknown topic: ${slug}`);
    }

    const people = await peopleByMatchKey(ctx);

    const { authors, ...publication } = args;
    const publicationId = await ctx.db.insert("publications", {
      ...publication,
      year: Number(args.pubDate.slice(0, 4)),
      awards: [],
      selected: false,
      short: false,
      future: false,
      hidden: false,
      authorCount: authors.length,
      ...submissionFields(email),
    });
    for (const [position, name] of authors.entries()) {
      // publicationCount tracks published papers, so a pending submission links the
      // author without counting the authorship yet; setStatus does that on publish.
      const authorId = await upsertAuthor(ctx, name, people, { countAuthorship: false });
      await ctx.db.insert("publicationAuthors", { publicationId, authorId, position });
    }

    await record(ctx, {
      table: "publications",
      documentId: publicationId,
      action: "create",
      actor: email,
      affectsSite: false,
    });
    return publicationId;
  },
});

// ----------------------------------------------------------------- reviewing

/** Everything awaiting review, for the queue in the admin UI. */
export const pending = query({
  args: { table: contentTableValidator },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    await requireCapability(ctx, GOVERNS[args.table]);
    switch (args.table) {
      case "events":
        return await ctx.db
          .query("events")
          .withIndex("by_status_and_startDate", (q) => q.eq("status", "pending"))
          .take(200);
      case "publications":
        return await ctx.db
          .query("publications")
          .withIndex("by_status_and_pubDate", (q) => q.eq("status", "pending"))
          .take(200);
      case "people":
        return await ctx.db
          .query("people")
          .withIndex("by_status_and_category", (q) => q.eq("status", "pending"))
          .take(200);
      case "news":
        return await ctx.db
          .query("news")
          .withIndex("by_status_and_sortOrder", (q) => q.eq("status", "pending"))
          .take(200);
    }
  },
});

/**
 * Publish, reject, or retire one record.
 *
 * Rejecting keeps the row with a note rather than deleting it, so a submitter can
 * see what happened to their entry and an editor can reconsider.
 */
export const setStatus = mutation({
  args: {
    table: contentTableValidator,
    id: v.string(),
    status: v.union(v.literal("published"), v.literal("rejected"), v.literal("archived")),
    reviewNote: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = await requireCapability(ctx, GOVERNS[args.table]);
    const id = ctx.db.normalizeId(args.table, args.id);
    if (id === null) throw new Error("No such record.");

    const before = await ctx.db.get(args.table, id as Id<ContentTable>);
    if (before === null) throw new Error("No such record.");

    if (args.table === "publications") {
      const wasPublished = before.status === "published";
      const nowPublished = args.status === "published";
      if (wasPublished !== nowPublished) {
        await adjustAuthorCounts(ctx, id as Id<"publications">, nowPublished ? 1 : -1);
      }
    }

    await ctx.db.patch(args.table, id as Id<ContentTable>, {
      status: args.status,
      reviewNote: args.reviewNote,
      ...(args.status === "published" ? { publishedBy: email, publishedAt: Date.now() } : {}),
    });

    await record(ctx, {
      table: args.table,
      documentId: id,
      action: args.status === "published" ? "publish" : "reject",
      actor: email,
      snapshot: await ctx.db.get(args.table, id as Id<ContentTable>),
      // Publishing adds it to the site; un-publishing something that was live
      // removes it. Either way the built pages change.
      affectsSite: args.status === "published" || before.status === "published",
    });
    return null;
  },
});

// --------------------------------------------------------------------- roles

export const listRoles = query({
  args: {},
  returns: v.array(schema.doc("roles")),
  handler: async (ctx) => {
    await requireCapability(ctx, "admin");
    return await ctx.db.query("roles").take(200);
  },
});

/** Grant or replace someone's capabilities. An empty list revokes their access. */
export const setRole = mutation({
  args: { email: v.string(), capabilities: v.array(capabilityValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "admin");
    const email = args.email.trim().toLowerCase();

    const existing = await ctx.db
      .query("roles")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();

    if (args.capabilities.length === 0) {
      if (existing !== null) await ctx.db.delete("roles", existing._id);
    } else if (existing === null) {
      await ctx.db.insert("roles", {
        email,
        capabilities: args.capabilities,
        grantedBy: actor,
        grantedAt: Date.now(),
      });
    } else {
      // Guard against an admin removing their own last admin grant and locking
      // everyone out; bootstrapAdmin is an internal escape hatch, not a UI.
      if (email === actor && !args.capabilities.includes("admin")) {
        throw new Error("You cannot remove your own admin capability.");
      }
      await ctx.db.patch("roles", existing._id, { capabilities: args.capabilities });
    }

    await ctx.db.insert("revisions", {
      table: "roles",
      documentId: email,
      action: args.capabilities.length === 0 ? "delete" : "update",
      actor,
      at: Date.now(),
      snapshot: { email, capabilities: args.capabilities },
    });
    return null;
  },
});

/**
 * Grant the first admin, from the command line:
 *
 *   npx convex run admin:bootstrapAdmin '{"email":"uni@columbia.edu"}'
 *
 * Internal, so it is not reachable from the internet — it is the escape hatch for
 * the chicken-and-egg problem that `setRole` requires an existing admin. Safe to
 * re-run; it upgrades an existing grant rather than duplicating it.
 */
export const bootstrapAdmin = internalMutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const existing = await ctx.db
      .query("roles")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing === null) {
      await ctx.db.insert("roles", {
        email,
        capabilities: ["admin"],
        grantedBy: "bootstrap",
        grantedAt: Date.now(),
      });
    } else if (!existing.capabilities.includes("admin")) {
      await ctx.db.patch("roles", existing._id, {
        capabilities: [...existing.capabilities, "admin"],
      });
    }
    return null;
  },
});
