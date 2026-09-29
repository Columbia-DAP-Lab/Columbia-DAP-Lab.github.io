import { v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/**
 * Published content, shaped the way the Jekyll templates read it.
 *
 * These feed the site build: a step in .github/workflows/deploy.yml calls them and
 * writes _data/events.yml, _data/pubs.yml and _data/people.yml into the runner's
 * checkout before `jekyll build`. Nothing is committed.
 *
 * Public and unauthenticated on purpose — they return exactly what the public site
 * already shows. Anything not `published` stays out, and so does `zoomUrl`.
 *
 * Key names here match the YAML, not the table columns (`conf`, `pub_date`,
 * `who`, `wholink`), so the export drops into _data/ unchanged.
 */

/** Generous ceilings: the real data is ~100 papers, ~70 people, ~60 events. */
const LIMIT = 2000;

const omitUndefined = <T extends Record<string, unknown>>(row: T): Partial<T> =>
  Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined)) as Partial<T>;

const imagePath = (image: Doc<"events">["image"], ctx: QueryCtx) =>
  image === undefined ? undefined : image.kind === "path" ? image.path : ctx.storage.getUrl(image.storageId);

/** Series slug -> the label _includes/event-entry.html prints and slugifies. */
const seriesLabels = async (ctx: QueryCtx) => {
  const rows = await ctx.db.query("eventSeries").take(100);
  return new Map(rows.map((s) => [s.slug, s.label]));
};

/** Field slug -> the label _includes/people-grid.html prints and colors by. */
const fieldLabels = async (ctx: QueryCtx) => {
  const rows = await ctx.db.query("fields").take(500);
  return new Map(rows.map((f) => [f.slug, f.label]));
};

/** The enum, back to the capitalization _includes/people-grid.html filters on. */
const CATEGORY_LABELS: Record<Doc<"people">["category"], string> = {
  faculty: "Faculty",
  postdoc: "Postdoc",
  phd: "PhD",
  student: "Student",
  staff: "Staff",
  alum: "Alum",
};

export const events = query({
  args: {},
  handler: async (ctx) => {
    const labels = await seriesLabels(ctx);
    const rows = await ctx.db
      .query("events")
      .withIndex("by_status_and_startDate", (q) => q.eq("status", "published"))
      .order("desc")
      .take(LIMIT);

    const out = [];
    for (const event of rows) {
      const speakers = await ctx.db
        .query("eventSpeakers")
        .withIndex("by_eventId_and_position", (q) => q.eq("eventId", event._id))
        .take(50);

      // `who` is the printed speaker list: "Leon Song, Together.AI".
      const who = speakers
        .map((s) => (s.affiliation ? `${s.name}, ${s.affiliation}` : s.name))
        .join(", ");
      // The templates render a single speaker link and a single bio.
      const wholink = speakers.find((s) => s.url)?.url;
      const bio = speakers.map((s) => s.bio).filter(Boolean).join("\n\n") || undefined;

      out.push(
        omitUndefined({
          title: event.title,
          tag: labels.get(event.series) ?? event.series,
          date: event.startDate,
          end_date: event.endDate,
          time: event.timeLabel,
          where: event.location,
          who: who || undefined,
          wholink,
          role: speakers.find((s) => s.role)?.role,
          link: event.link,
          description: event.description,
          bio,
          image: await imagePath(event.image, ctx),
          video: event.videoUrl,
          slides: event.slidesUrl,
        }),
      );
    }
    return out;
  },
});

export const publications = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("publications")
      .withIndex("by_status_and_pubDate", (q) => q.eq("status", "published"))
      .order("desc")
      .take(LIMIT);

    const out = [];
    for (const pub of rows) {
      const authors = await ctx.db
        .query("publicationAuthors")
        .withIndex("by_publicationId_and_position", (q) => q.eq("publicationId", pub._id))
        .take(200);

      out.push(
        omitUndefined({
          title: pub.title,
          authors: authors.map((a) => a.name).join(", "),
          conf: pub.venue,
          pub_date: pub.pubDate,
          url: pub.url,
          tags: pub.topics,
          slides: pub.slidesUrl,
          code: pub.codeUrl,
          website: pub.websiteUrl,
          key: pub.bibtexKey,
          rate: pub.acceptanceRate,
          citations: pub.citations,
          awards: pub.awards.length > 0 ? pub.awards.join("; ") : undefined,
          comment: pub.comment,
          selected: pub.selected || undefined,
          short: pub.short || undefined,
          future: pub.future || undefined,
          hide: pub.hidden || undefined,
        }),
      );
    }
    return out;
  },
});

export const people = query({
  args: {},
  handler: async (ctx) => {
    const labels = await fieldLabels(ctx);
    const rows = await ctx.db
      .query("people")
      .withIndex("by_status_and_category", (q) => q.eq("status", "published"))
      .take(LIMIT);

    const names = new Map(rows.map((p) => [p._id, p.name]));
    const out = [];
    for (const person of rows) {
      if (person.hidden) continue;
      const advisors = [
        ...person.advisorIds.map((id) => names.get(id)).filter((n): n is string => n !== undefined),
        ...person.externalAdvisors,
      ];
      out.push(
        omitUndefined({
          name: person.name,
          homepage: person.homepage,
          image: await imagePath(person.image, ctx),
          bio: person.bio,
          category: CATEGORY_LABELS[person.category],
          field:
            person.fields.length > 0
              ? person.fields.map((slug) => labels.get(slug) ?? slug)
              : undefined,
          advisor: advisors.length > 0 ? advisors : undefined,
        }),
      );
    }
    return out;
  },
});

export const news = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("news")
      .withIndex("by_status_and_sortOrder", (q) => q.eq("status", "published"))
      .take(LIMIT);
    return rows.map((item) =>
      omitUndefined({
        title: item.title,
        content: item.content,
        details: item.details,
        featured: item.featured,
        date: item.date,
      }),
    );
  },
});

/** The filter buttons and series blurbs on /events. */
export const eventSeries = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("eventSeries").take(100);
    return rows
      .filter((s) => s.active)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) =>
        omitUndefined({
          slug: s.slug,
          label: s.label,
          description: s.description,
          logo: s.logo?.kind === "path" ? s.logo.path : undefined,
        }),
      );
  },
});

/** The publication filter vocabulary, for the admin form's tag picker. */
export const topics = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("topics").take(500);
    return rows.sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99) || a.slug.localeCompare(b.slug));
  },
});

/** The people badge vocabulary, with its colors. */
export const fields = query({
  args: { kind: v.optional(v.union(v.literal("research"), v.literal("department"), v.literal("role"))) },
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("fields").take(500);
    return rows
      .filter((f) => args.kind === undefined || f.kind === args.kind)
      .sort((a, b) => a.slug.localeCompare(b.slug));
  },
});
