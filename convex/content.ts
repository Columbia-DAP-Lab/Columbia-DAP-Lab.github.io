import { v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

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

/**
 * Return validators, one per exported file.
 *
 * Every field is optional because `omitUndefined` drops empties — the YAML has
 * never carried `who:` on an event with no speaker, and writing one out as null
 * would change what the templates see. These are the contract the site build reads,
 * so a field renamed here fails at the boundary instead of silently blanking a page.
 */
const eventShape = v.object({
  title: v.optional(v.string()),
  tag: v.optional(v.string()),
  date: v.optional(v.string()),
  end_date: v.optional(v.string()),
  time: v.optional(v.string()),
  where: v.optional(v.string()),
  who: v.optional(v.string()),
  wholink: v.optional(v.string()),
  role: v.optional(v.string()),
  link: v.optional(v.string()),
  description: v.optional(v.string()),
  bio: v.optional(v.string()),
  image: v.optional(v.string()),
  video: v.optional(v.string()),
  slides: v.optional(v.string()),
});

const publicationShape = v.object({
  title: v.optional(v.string()),
  authors: v.optional(v.string()),
  conf: v.optional(v.string()),
  pub_date: v.optional(v.string()),
  url: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  slides: v.optional(v.string()),
  code: v.optional(v.string()),
  website: v.optional(v.string()),
  key: v.optional(v.string()),
  rate: v.optional(v.string()),
  citations: v.optional(v.number()),
  awards: v.optional(v.string()),
  comment: v.optional(v.string()),
  selected: v.optional(v.boolean()),
  short: v.optional(v.boolean()),
  future: v.optional(v.boolean()),
  hide: v.optional(v.boolean()),
});

const personShape = v.object({
  name: v.optional(v.string()),
  homepage: v.optional(v.string()),
  image: v.optional(v.string()),
  bio: v.optional(v.string()),
  category: v.optional(v.string()),
  field: v.optional(v.array(v.string())),
  advisor: v.optional(v.array(v.string())),
});

const newsShape = v.object({
  title: v.optional(v.string()),
  content: v.optional(v.string()),
  details: v.optional(v.string()),
  featured: v.optional(v.boolean()),
  date: v.optional(v.string()),
});

const seriesShape = v.object({
  slug: v.optional(v.string()),
  label: v.optional(v.string()),
  description: v.optional(v.string()),
  logo: v.optional(v.string()),
});

const omitUndefined = <T extends Record<string, unknown>>(row: T): Partial<T> =>
  Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined)) as Partial<T>;

/**
 * An author as printed on one paper: the canonical name, plus the asterisk when
 * they contributed equally. The marker belongs to the authorship, not the name.
 */
const printedName = (
  authorship: Doc<"publicationAuthors">,
  names: Map<Id<"authors">, string>,
): string | undefined => {
  const name = names.get(authorship.authorId);
  if (name === undefined) return undefined;
  return authorship.equalContribution ? `${name}*` : name;
};

/**
 * Either a path to a file still in the repo, or a URL for one uploaded here.
 *
 * `getUrl` returns null when the stored file is gone; that becomes undefined so
 * `omitUndefined` drops the key, rather than writing `image:` with a null value
 * that the templates would read as present.
 */
const imagePath = async (
  image: Doc<"events">["image"],
  ctx: QueryCtx,
): Promise<string | undefined> => {
  if (image === undefined) return undefined;
  if (image.kind === "path") return image.path;
  return (await ctx.storage.getUrl(image.storageId)) ?? undefined;
};

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
  returns: v.array(eventShape),
  handler: async (ctx) => {
    const labels = await seriesLabels(ctx);
    // Newest first, ties broken by id: a total order that depends only on the data,
    // so the same rows always export in the same sequence.
    const rows = (
      await ctx.db
        .query("events")
        .withIndex("by_status_and_startDate", (q) => q.eq("status", "published"))
        .order("desc")
        .take(LIMIT)
    ).sort((a, b) => b.startDate.localeCompare(a.startDate) || a._id.localeCompare(b._id));

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
  returns: v.array(publicationShape),
  handler: async (ctx) => {
    // As with events: newest first, ties by id.
    const rows = (
      await ctx.db
        .query("publications")
        .withIndex("by_status_and_pubDate", (q) => q.eq("status", "published"))
        .order("desc")
        .take(LIMIT)
    ).sort((a, b) => b.pubDate.localeCompare(a.pubDate) || a._id.localeCompare(b._id));

    // Author names live in `authors` now, so read them once for the whole export
    // rather than re-reading the same row for every paper a person appears on.
    const names = new Map((await ctx.db.query("authors").take(5000)).map((a) => [a._id, a.name]));

    const out = [];
    for (const pub of rows) {
      const authorships = await ctx.db
        .query("publicationAuthors")
        .withIndex("by_publicationId_and_position", (q) => q.eq("publicationId", pub._id))
        .take(200);

      out.push(
        omitUndefined({
          title: pub.title,
          authors: authorships
            .map((a) => printedName(a, names))
            .filter((name): name is string => name !== undefined)
            .join(", "),
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
  returns: v.array(personShape),
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

/**
 * One person's publications, newest first — what a profile page is for.
 *
 * Reads backwards through `publicationAuthors.by_authorId`, which is why authorship
 * is a row per person rather than a name repeated on every paper. `position` and
 * the paper's `authorCount` come back too, so a page can tell a first-author paper
 * from one with ninety names on it.
 *
 * A person with no `authors` row has simply never been an author here; that is an
 * empty list, not an error.
 */
export const publicationsByPerson = query({
  args: { slug: v.string() },
  returns: v.array(
    v.object({
      publication: publicationShape,
      position: v.number(),
      authorCount: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const person = await ctx.db
      .query("people")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!person) return [];

    const authors = await ctx.db
      .query("authors")
      .withIndex("by_personId", (q) => q.eq("personId", person._id))
      .take(10);

    const names = new Map((await ctx.db.query("authors").take(5000)).map((a) => [a._id, a.name]));
    const out = [];

    for (const author of authors) {
      const authorships = await ctx.db
        .query("publicationAuthors")
        .withIndex("by_authorId", (q) => q.eq("authorId", author._id))
        .take(500);

      for (const authorship of authorships) {
        const pub = await ctx.db.get("publications", authorship.publicationId);
        if (!pub || pub.status !== "published" || pub.hidden) continue;

        const coauthors = await ctx.db
          .query("publicationAuthors")
          .withIndex("by_publicationId_and_position", (q) => q.eq("publicationId", pub._id))
          .take(200);

        out.push({
          publication: omitUndefined({
            title: pub.title,
            authors: coauthors
              .map((a) => printedName(a, names))
              .filter((name): name is string => name !== undefined)
              .join(", "),
            conf: pub.venue,
            pub_date: pub.pubDate,
            url: pub.url,
            tags: pub.topics,
            awards: pub.awards.length > 0 ? pub.awards.join("; ") : undefined,
            selected: pub.selected || undefined,
          }),
          position: authorship.position,
          authorCount: pub.authorCount,
        });
      }
    }

    return out.sort(
      (a, b) =>
        (b.publication.pub_date ?? "").localeCompare(a.publication.pub_date ?? "") ||
        (a.publication.title ?? "").localeCompare(b.publication.title ?? ""),
    );
  },
});

export const news = query({
  args: {},
  returns: v.array(newsShape),
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

/**
 * The filter buttons and series blurbs on /events, in _data/event_types.yml order.
 *
 * "all" is prepended rather than stored: it is not a series, it is the filter bar's
 * reset button, and an admin form offering "All" as a series would be a bug.
 */
export const eventSeries = query({
  args: {},
  returns: v.array(seriesShape),
  handler: async (ctx) => {
    const rows = await ctx.db.query("eventSeries").take(100);
    const series = rows
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
    return [{ slug: "all", label: "All" }, ...series];
  },
});

/**
 * Badge label -> CSS class, the shape _includes/people-grid.html looks up as
 * `field_colors[tag]`, with the fallback it reaches for when a badge has no color.
 */
export const fieldColors = query({
  args: {},
  returns: v.record(v.string(), v.string()),
  handler: async (ctx) => {
    const rows = await ctx.db.query("fields").take(500);
    const colors: Record<string, string> = {};
    for (const field of rows) {
      if (field.color) colors[field.label] = field.color;
    }
    colors.Default = "badge-default";
    return colors;
  },
});

/** The publication filter vocabulary, for the admin form's tag picker. */
export const topics = query({
  args: {},
  returns: v.array(schema.doc("topics")),
  handler: async (ctx) => {
    const rows = await ctx.db.query("topics").take(500);
    return rows.sort((a, b) => (a.sortOrder ?? 99) - (b.sortOrder ?? 99) || a.slug.localeCompare(b.slug));
  },
});

/** The people badge vocabulary, with its colors. */
export const fields = query({
  args: { kind: v.optional(v.union(v.literal("research"), v.literal("department"), v.literal("role"))) },
  returns: v.array(schema.doc("fields")),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("fields").take(500);
    return rows
      .filter((f) => args.kind === undefined || f.kind === args.kind)
      .sort((a, b) => a.slug.localeCompare(b.slug));
  },
});
