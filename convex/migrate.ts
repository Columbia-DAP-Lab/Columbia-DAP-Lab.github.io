import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { TOPICS, FIELDS, slugify } from "./vocabulary";

/**
 * One-time import of _data/*.yml into the content tables.
 *
 * Driven by scripts/import_to_convex.mjs, which reads the YAML, canonicalizes the
 * tags, and calls these in order. Internal, so nothing here is reachable from the
 * internet; the script invokes them through `npx convex run`, which authenticates
 * with the deployment's admin key.
 *
 * Every function is idempotent: `reset` clears the content tables and the importers
 * insert from scratch, so a failed run is re-runnable without leaving halves behind.
 */

const IMPORT_ACTOR = "migration";

/** A person's display name, reduced for matching author and speaker strings. */
const matchKey = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // drop accents: "Sellán" matches "Sellan"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const CONTENT_TABLES = [
  "publicationAuthors",
  "publications",
  "eventSpeakers",
  "events",
  "eventSeries",
  "people",
  "topics",
  "fields",
] as const;

/**
 * Delete every content row. Leaves `roles` and `revisions` alone.
 *
 * Deletes in dependency order and one bounded batch per call, rescheduling itself
 * until empty, so a large table cannot blow the transaction limit.
 */
export const reset = internalMutation({
  args: { confirm: v.literal("delete all content") },
  handler: async (ctx) => {
    let deleted = 0;
    for (const table of CONTENT_TABLES) {
      const rows = await ctx.db.query(table).take(500);
      for (const row of rows) {
        await ctx.db.delete(table, row._id);
        deleted++;
      }
      if (rows.length === 500) {
        // More left in this table; continue in a fresh transaction.
        await ctx.scheduler.runAfter(0, internal.migrate.reset, {
          confirm: "delete all content",
        });
        return { deleted, done: false };
      }
    }
    return { deleted, done: true };
  },
});

/** Seed both vocabularies from convex/vocabulary.ts. */
export const seedVocabulary = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const topic of TOPICS) {
      const existing = await ctx.db
        .query("topics")
        .withIndex("by_slug", (q) => q.eq("slug", topic.slug))
        .unique();
      if (existing) await ctx.db.replace("topics", existing._id, topic);
      else await ctx.db.insert("topics", topic);
    }
    for (const field of FIELDS) {
      const existing = await ctx.db
        .query("fields")
        .withIndex("by_slug", (q) => q.eq("slug", field.slug))
        .unique();
      if (existing) await ctx.db.replace("fields", existing._id, field);
      else await ctx.db.insert("fields", field);
    }
    return { topics: TOPICS.length, fields: FIELDS.length };
  },
});

/** Seed event series from _data/event_types.yml (the "all" pseudo-type is dropped). */
export const seedSeries = internalMutation({
  args: {
    series: v.array(
      v.object({
        slug: v.string(),
        label: v.string(),
        description: v.optional(v.string()),
        logo: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let n = 0;
    for (const [index, s] of args.series.entries()) {
      const row = {
        slug: s.slug,
        label: s.label,
        description: s.description,
        logo: s.logo ? ({ kind: "path" as const, path: s.logo }) : undefined,
        sortOrder: index,
        active: true,
      };
      const existing = await ctx.db
        .query("eventSeries")
        .withIndex("by_slug", (q) => q.eq("slug", s.slug))
        .unique();
      if (existing) await ctx.db.replace("eventSeries", existing._id, row);
      else await ctx.db.insert("eventSeries", row);
      n++;
    }
    return { series: n };
  },
});

const submitted = (publishedAt: number) => ({
  status: "published" as const,
  submittedBy: IMPORT_ACTOR,
  submittedAt: publishedAt,
  publishedBy: IMPORT_ACTOR,
  publishedAt,
});

/**
 * Import people. Run first — publications and events link their authors and
 * speakers to these rows by name.
 *
 * Advisors are resolved in a second pass, since an advisor may appear later in the
 * file than their student.
 */
export const importPeople = internalMutation({
  args: {
    people: v.array(
      v.object({
        name: v.string(),
        category: v.string(),
        homepage: v.optional(v.string()),
        image: v.optional(v.string()),
        bio: v.optional(v.string()),
        fields: v.array(v.string()),
        advisors: v.array(v.string()),
        title: v.optional(v.string()),
        affiliation: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const byName = new Map<string, Id<"people">>();
    const unresolvedAdvisors: Array<{ id: Id<"people">; names: string[] }> = [];

    for (const person of args.people) {
      const category = normalizeCategory(person.category);
      const id = await ctx.db.insert("people", {
        slug: slugify(person.name),
        name: person.name,
        category,
        title: person.title,
        affiliation: person.affiliation,
        homepage: person.homepage,
        image: person.image ? { kind: "path", path: person.image } : undefined,
        bio: person.bio,
        fields: person.fields,
        advisorIds: [],
        externalAdvisors: [],
        hidden: false,
        ...submitted(now),
      });
      byName.set(matchKey(person.name), id);
      if (person.advisors.length > 0) unresolvedAdvisors.push({ id, names: person.advisors });
    }

    let linked = 0;
    let external = 0;
    for (const { id, names } of unresolvedAdvisors) {
      const advisorIds: Id<"people">[] = [];
      const externalAdvisors: string[] = [];
      for (const name of names) {
        const match = byName.get(matchKey(name));
        if (match) {
          advisorIds.push(match);
          linked++;
        } else {
          externalAdvisors.push(name);
          external++;
        }
      }
      await ctx.db.patch("people", id, { advisorIds, externalAdvisors });
    }

    return { people: args.people.length, advisorsLinked: linked, advisorsExternal: external };
  },
});

const normalizeCategory = (raw: string): Doc<"people">["category"] => {
  switch (raw.trim().toLowerCase()) {
    case "faculty":
      return "faculty";
    case "postdoc":
      return "postdoc";
    case "phd":
      return "phd";
    case "staff":
      return "staff";
    case "alum":
    case "alumni":
      return "alum";
    default:
      return "student";
  }
};

/** Look up every person once, for linking authors and speakers by name. */
const peopleByName = async (ctx: MutationCtx) => {
  const rows = await ctx.db.query("people").take(2000);
  return new Map(rows.map((p) => [matchKey(p.name), p._id]));
};

/** Import publications and their ordered authors. Called in batches. */
export const importPublications = internalMutation({
  args: {
    publications: v.array(
      v.object({
        title: v.string(),
        venue: v.string(),
        pubDate: v.string(),
        authors: v.array(v.string()),
        topics: v.array(v.string()),
        url: v.optional(v.string()),
        slidesUrl: v.optional(v.string()),
        codeUrl: v.optional(v.string()),
        websiteUrl: v.optional(v.string()),
        bibtexKey: v.optional(v.string()),
        acceptanceRate: v.optional(v.string()),
        citations: v.optional(v.number()),
        awards: v.array(v.string()),
        selected: v.boolean(),
        short: v.boolean(),
        future: v.boolean(),
        hidden: v.boolean(),
        comment: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const people = await peopleByName(ctx);
    let authorRows = 0;
    let authorsLinked = 0;

    for (const pub of args.publications) {
      const publicationId = await ctx.db.insert("publications", {
        title: pub.title,
        venue: pub.venue,
        pubDate: pub.pubDate,
        year: Number(pub.pubDate.slice(0, 4)),
        url: pub.url,
        slidesUrl: pub.slidesUrl,
        codeUrl: pub.codeUrl,
        websiteUrl: pub.websiteUrl,
        bibtexKey: pub.bibtexKey,
        topics: pub.topics,
        awards: pub.awards,
        acceptanceRate: pub.acceptanceRate,
        citations: pub.citations,
        selected: pub.selected,
        short: pub.short,
        future: pub.future,
        hidden: pub.hidden,
        comment: pub.comment,
        authorCount: pub.authors.length,
        ...submitted(now),
      });

      for (const [position, name] of pub.authors.entries()) {
        const personId = people.get(matchKey(name));
        await ctx.db.insert("publicationAuthors", { publicationId, position, name, personId });
        authorRows++;
        if (personId) authorsLinked++;
      }
    }

    return { publications: args.publications.length, authorRows, authorsLinked };
  },
});

/** Import events and their speakers. Called in batches. */
export const importEvents = internalMutation({
  args: {
    events: v.array(
      v.object({
        title: v.string(),
        series: v.string(),
        startDate: v.string(),
        endDate: v.optional(v.string()),
        timeLabel: v.optional(v.string()),
        location: v.optional(v.string()),
        link: v.optional(v.string()),
        description: v.optional(v.string()),
        image: v.optional(v.string()),
        videoUrl: v.optional(v.string()),
        slidesUrl: v.optional(v.string()),
        speakers: v.array(
          v.object({
            name: v.string(),
            affiliation: v.optional(v.string()),
            role: v.optional(v.string()),
            url: v.optional(v.string()),
            bio: v.optional(v.string()),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const people = await peopleByName(ctx);
    let speakerRows = 0;
    let speakersLinked = 0;

    for (const event of args.events) {
      const eventId = await ctx.db.insert("events", {
        title: event.title,
        series: event.series,
        startDate: event.startDate,
        endDate: event.endDate,
        timeLabel: event.timeLabel,
        location: event.location,
        link: event.link,
        description: event.description,
        image: event.image ? { kind: "path", path: event.image } : undefined,
        videoUrl: event.videoUrl,
        slidesUrl: event.slidesUrl,
        ...submitted(now),
      });

      for (const [position, speaker] of event.speakers.entries()) {
        const personId = people.get(matchKey(speaker.name));
        await ctx.db.insert("eventSpeakers", {
          eventId,
          position,
          name: speaker.name,
          personId,
          affiliation: speaker.affiliation,
          role: speaker.role,
          url: speaker.url,
          bio: speaker.bio,
        });
        speakerRows++;
        if (personId) speakersLinked++;
      }
    }

    return { events: args.events.length, speakerRows, speakersLinked };
  },
});

/** Row counts, for the import script to report and for a quick sanity check. */
export const counts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const out: Record<string, number> = {};
    for (const table of CONTENT_TABLES) {
      out[table] = (await ctx.db.query(table).take(5000)).length;
    }
    return out;
  },
});
