import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { TOPICS, FIELDS, slugify } from "./vocabulary";
import { matchKey, peopleByMatchKey, upsertAuthor } from "./authors";

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


const CONTENT_TABLES = [
  "projectPublications",
  "projectAuthors",
  "projects",
  "news",
  "publicationAuthors",
  "authors",
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


/** How many non-ASCII characters a spelling carries, used to pick between variants. */

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
    const people = await peopleByMatchKey(ctx);
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

      for (const [position, printed] of pub.authors.entries()) {
        // A trailing asterisk marks equal contribution on this paper, not a
        // different person, so it moves to the authorship row.
        const equalContribution = printed.trim().endsWith("*");
        const name = printed.replace(/\*+\s*$/, "").trim();

        const authorId = await upsertAuthor(ctx, name, people);
        await ctx.db.insert("publicationAuthors", {
          publicationId,
          authorId,
          position,
          equalContribution: equalContribution ? true : undefined,
        });
        authorRows++;
        if (people.has(matchKey(name))) authorsLinked++;
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
    const people = await peopleByMatchKey(ctx);
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

/**
 * Import news items. Small and hand-ordered, so the rows are passed in verbatim
 * and `sortOrder` is their position in _data/news.yml.
 */
export const importNews = internalMutation({
  args: {
    news: v.array(
      v.object({
        title: v.string(),
        content: v.string(),
        details: v.optional(v.string()),
        featured: v.boolean(),
        date: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const [sortOrder, item] of args.news.entries()) {
      await ctx.db.insert("news", { ...item, sortOrder, ...submitted(now) });
    }
    return { news: args.news.length };
  },
});

/**
 * Import the _projects/ collection.
 *
 * Authors go through the same `authors` table as publications, without counting
 * the authorship: publicationCount means papers, and a project is not one.
 *
 * A listed paper is linked to `publications` when its title matches one, so the
 * link is a fact rather than a guess; unmatched entries keep their literal fields,
 * which is all the page renders anyway.
 */
export const importProjects = internalMutation({
  args: {
    projects: v.array(
      v.object({
        slug: v.string(),
        title: v.string(),
        subtitle: v.string(),
        date: v.string(),
        body: v.string(),
        kinds: v.array(
          v.union(v.literal("project"), v.literal("benchmark"), v.literal("software")),
        ),
        tags: v.array(v.string()),
        avatar: v.optional(v.string()),
        avatarUrl: v.optional(v.string()),
        links: v.array(v.object({ kind: v.string(), url: v.string() })),
        authors: v.array(
          v.object({
            name: v.string(),
            url: v.optional(v.string()),
            equalContribution: v.optional(v.boolean()),
          }),
        ),
        publications: v.array(
          v.object({
            title: v.string(),
            venue: v.string(),
            url: v.optional(v.string()),
            year: v.optional(v.number()),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const people = await peopleByMatchKey(ctx);
    const published = await ctx.db.query("publications").take(2000);
    const byTitle = new Map(published.map((p) => [p.title.trim().toLowerCase(), p._id]));

    let authorRows = 0;
    let paperRows = 0;
    let papersLinked = 0;

    for (const project of args.projects) {
      const { authors, publications, ...fields } = project;
      const projectId = await ctx.db.insert("projects", { ...fields, ...submitted(now) });

      for (const [position, author] of authors.entries()) {
        const authorId = await upsertAuthor(ctx, author.name, people, { countAuthorship: false });
        await ctx.db.insert("projectAuthors", {
          projectId,
          authorId,
          position,
          url: author.url,
          equalContribution: author.equalContribution,
        });
        authorRows++;
      }

      for (const [position, paper] of publications.entries()) {
        const publicationId = byTitle.get(paper.title.trim().toLowerCase());
        await ctx.db.insert("projectPublications", { projectId, position, ...paper, publicationId });
        paperRows++;
        if (publicationId) papersLinked++;
      }
    }

    return { projects: args.projects.length, authorRows, paperRows, papersLinked };
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
