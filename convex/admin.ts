import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { capabilityValidator, currentEmail, requireCapability, requireSubmitter } from "./authz";
import { adjustAuthorCounts, matchKey, peopleByMatchKey, upsertAuthor } from "./authors";
import { slugify } from "./vocabulary";

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

/** Largest event image accepted. The site shows it as a thumbnail. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * A one-time URL the browser POSTs an image to; the response carries the storageId
 * that `submitEvent` then takes. Gated like submitting, so storage is not an open
 * upload bucket.
 */
export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireSubmitter(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Check an uploaded file before an event points at it. */
const checkImage = async (ctx: MutationCtx, storageId: Id<"_storage">) => {
  const file = await ctx.db.system.get("_storage", storageId);
  if (file === null) throw new ConvexError("The uploaded image is missing; upload it again.");
  if (!file.contentType?.startsWith("image/")) throw new ConvexError("The upload is not an image.");
  if (file.size > MAX_IMAGE_BYTES) throw new ConvexError("Images must be under 5 MB.");
};

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
    /** From generateUploadUrl. */
    image: v.optional(v.id("_storage")),
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
    if (series === null) throw new ConvexError(`Unknown series: ${args.series}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.startDate)) throw new ConvexError("Date must be YYYY-MM-DD.");

    if (args.image !== undefined) await checkImage(ctx, args.image);

    const { speakers, image, ...event } = args;
    const eventId = await ctx.db.insert("events", {
      ...event,
      image: image === undefined ? undefined : { kind: "storage", storageId: image },
      ...submissionFields(email),
    });
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.pubDate)) throw new ConvexError("Date must be YYYY-MM-DD.");

    // The vocabulary is closed: a typo here would create a filter nothing matches.
    for (const slug of args.topics) {
      const topic = await ctx.db
        .query("topics")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();
      if (topic === null) throw new ConvexError(`Unknown topic: ${slug}`);
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
    for (const [position, printed] of authors.entries()) {
      // "Weiliang Zhao*" is equal contribution on this paper, not a different
      // person — the same split the migration makes, so the two paths agree.
      const equalContribution = printed.trim().endsWith("*");
      const name = printed.replace(/\*+\s*$/, "").trim();
      // publicationCount tracks published papers, so a pending submission links the
      // author without counting the authorship yet; setStatus does that on publish.
      const authorId = await upsertAuthor(ctx, name, people, { countAuthorship: false });
      await ctx.db.insert("publicationAuthors", {
        publicationId,
        authorId,
        position,
        equalContribution: equalContribution ? true : undefined,
      });
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

/**
 * Propose a profile for the People page.
 *
 * Advisors arrive as printed names and are resolved here the way authors are: a
 * name that matches someone in the directory links to their profile, anything else
 * is kept as an external advisor rather than fabricating a profile for them.
 */
export const submitPerson = mutation({
  args: {
    name: v.string(),
    category: schema.tables.people.validator.fields.category,
    title: v.optional(v.string()),
    affiliation: v.optional(v.string()),
    homepage: v.optional(v.string()),
    email: v.optional(v.string()),
    bio: v.optional(v.string()),
    /** Slugs into `fields`. */
    fields: v.array(v.string()),
    advisors: v.array(v.string()),
    /** From generateUploadUrl. */
    image: v.optional(v.id("_storage")),
  },
  returns: v.id("people"),
  handler: async (ctx, args) => {
    const submitter = await requireSubmitter(ctx);
    const name = args.name.trim();
    if (!name) throw new ConvexError("A profile needs a name.");

    // The slug is the profile's identity; a second row for the same name would
    // split the person the way a misspelled author splits an author.
    const slug = slugify(name);
    const existing = await ctx.db
      .query("people")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (existing !== null) {
      throw new ConvexError(
        existing.status === "pending"
          ? `${name} already has a profile waiting for review.`
          : `${name} already has a profile. Ask an editor to update it.`,
      );
    }

    for (const field of args.fields) {
      const row = await ctx.db
        .query("fields")
        .withIndex("by_slug", (q) => q.eq("slug", field))
        .unique();
      if (row === null) throw new ConvexError(`Unknown research area: ${field}`);
    }
    if (args.image !== undefined) await checkImage(ctx, args.image);

    const people = await peopleByMatchKey(ctx);
    const advisorIds: Id<"people">[] = [];
    const externalAdvisors: string[] = [];
    for (const printed of args.advisors) {
      const advisor = printed.trim();
      if (!advisor) continue;
      const id = people.get(matchKey(advisor));
      if (id !== undefined) advisorIds.push(id);
      else externalAdvisors.push(advisor);
    }

    const { advisors, image, email, ...person } = args;
    const personId = await ctx.db.insert("people", {
      ...person,
      name,
      slug,
      email: email?.trim().toLowerCase() || undefined,
      image: image === undefined ? undefined : { kind: "storage", storageId: image },
      advisorIds,
      externalAdvisors,
      hidden: false,
      ...submissionFields(submitter),
    });

    await record(ctx, {
      table: "people",
      documentId: personId,
      action: "create",
      actor: submitter,
      affectsSite: false,
    });
    return personId;
  },
});

// ----------------------------------------------------------------- reviewing

/**
 * An event or publication with what a reviewer needs to judge it: its speakers or
 * authors, which live in their own tables, and a viewable URL for an uploaded image.
 */
const withSpeakers = async (ctx: QueryCtx, event: Doc<"events">) => ({
  ...event,
  speakers: await ctx.db
    .query("eventSpeakers")
    .withIndex("by_eventId_and_position", (q) => q.eq("eventId", event._id))
    .take(50),
  imageUrl:
    event.image?.kind === "storage"
      ? await ctx.storage.getUrl(event.image.storageId)
      : event.image?.path ?? null,
});

const withAuthors = async (ctx: QueryCtx, publication: Doc<"publications">) => {
  const rows = await ctx.db
    .query("publicationAuthors")
    .withIndex("by_publicationId_and_position", (q) => q.eq("publicationId", publication._id))
    .take(500);
  const authors = [];
  for (const row of rows) {
    const author = await ctx.db.get("authors", row.authorId);
    if (author !== null) authors.push(row.equalContribution ? `${author.name}*` : author.name);
  }
  return { ...publication, authors };
};

const withAdvisors = async (ctx: QueryCtx, person: Doc<"people">) => {
  const advisors = [];
  for (const id of person.advisorIds) {
    const advisor = await ctx.db.get("people", id);
    if (advisor !== null) advisors.push(advisor.name);
  }
  return {
    ...person,
    advisors: [...advisors, ...person.externalAdvisors],
    imageUrl:
      person.image?.kind === "storage"
        ? await ctx.storage.getUrl(person.image.storageId)
        : person.image?.path ?? null,
  };
};

/** Everything awaiting review, for the queue in the admin UI. */
export const pending = query({
  args: { table: contentTableValidator },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    await requireCapability(ctx, GOVERNS[args.table]);
    switch (args.table) {
      case "events": {
        const rows = await ctx.db
          .query("events")
          .withIndex("by_status_and_startDate", (q) => q.eq("status", "pending"))
          .take(200);
        return await Promise.all(rows.map((row) => withSpeakers(ctx, row)));
      }
      case "publications": {
        const rows = await ctx.db
          .query("publications")
          .withIndex("by_status_and_pubDate", (q) => q.eq("status", "pending"))
          .take(200);
        return await Promise.all(rows.map((row) => withAuthors(ctx, row)));
      }
      case "people": {
        const rows = await ctx.db
          .query("people")
          .withIndex("by_status_and_category", (q) => q.eq("status", "pending"))
          .take(200);
        return await Promise.all(rows.map((row) => withAdvisors(ctx, row)));
      }
      case "news":
        return await ctx.db
          .query("news")
          .withIndex("by_status_and_sortOrder", (q) => q.eq("status", "pending"))
          .take(200);
    }
  },
});

/**
 * The signed-in user's own recent submissions, with their status and any review
 * note, so a submitter can see what happened to an entry without asking.
 */
export const mySubmissions = query({
  args: {},
  returns: v.object({
    events: v.array(v.any()),
    publications: v.array(v.any()),
    people: v.array(v.any()),
  }),
  handler: async (ctx) => {
    const email = await currentEmail(ctx);
    if (email === null) return { events: [], publications: [], people: [] };
    const [events, publications, people] = await Promise.all([
      ctx.db
        .query("events")
        .withIndex("by_submittedBy_and_submittedAt", (q) => q.eq("submittedBy", email))
        .order("desc")
        .take(25),
      ctx.db
        .query("publications")
        .withIndex("by_submittedBy_and_submittedAt", (q) => q.eq("submittedBy", email))
        .order("desc")
        .take(25),
      ctx.db
        .query("people")
        .withIndex("by_submittedBy_and_submittedAt", (q) => q.eq("submittedBy", email))
        .order("desc")
        .take(25),
    ]);
    // A person's `title` is their role ("PhD Student"); what the list shows is the name.
    const summary = (title: string, row: Doc<"events"> | Doc<"publications"> | Doc<"people">) => ({
      _id: row._id,
      title,
      status: row.status,
      submittedAt: row.submittedAt,
      reviewNote: row.reviewNote,
    });
    return {
      events: events.map((row) => summary(row.title, row)),
      publications: publications.map((row) => summary(row.title, row)),
      people: people.map((row) => summary(row.name, row)),
    };
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
    if (id === null) throw new ConvexError("No such record.");

    const before = await ctx.db.get(args.table, id as Id<ContentTable>);
    if (before === null) throw new ConvexError("No such record.");

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
        throw new ConvexError("You cannot remove your own admin capability.");
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
