import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * DAPLab content schema.
 *
 * Records, not YAML blobs. Three normalizations do most of the work:
 *
 *   1. Authors and speakers are rows, not comma-separated strings, so a person
 *      links to their papers and talks and so author position is queryable.
 *   2. Tags are a real vocabulary table, so `sys` / `system` / `systems` can be
 *      collapsed to one canonical slug with the others kept as aliases.
 *   3. Speaker bios live on the speaker, not on the event that mentions them.
 *
 * Field names track the YAML the Jekyll templates read (see _data/*.yml) wherever
 * there is no reason to diverge, so the export that feeds the site build stays a
 * rename rather than a transformation.
 */

/** Moderation state. Anyone with a Columbia account may submit; editors publish. */
const status = v.union(
  v.literal("pending"),
  v.literal("published"),
  v.literal("rejected"),
  v.literal("archived"),
);

/**
 * Submission bookkeeping, shared by every content table.
 * Emails are stored lowercased; they are the join key to `roles`.
 */
const submission = {
  status,
  submittedBy: v.string(),
  submittedAt: v.number(),
  publishedBy: v.optional(v.string()),
  publishedAt: v.optional(v.number()),
  /** Set by an editor when rejecting, shown back to the submitter. */
  reviewNote: v.optional(v.string()),
};

/**
 * An image is either uploaded here (Convex file storage) or a path to a file that
 * still lives in the repo under /files/images/. Migrated records use `path`;
 * anything submitted through the admin UI uses `storageId`.
 */
const image = v.union(
  v.object({ kind: v.literal("storage"), storageId: v.id("_storage") }),
  v.object({ kind: v.literal("path"), path: v.string() }),
);

export default defineSchema({
  /**
   * Controlled vocabulary for research areas and publication topics.
   *
   * Replaces the implicit vocabularies in _data/field_colors.yml and the free-form
   * `tags:` lists in _data/pubs.yml, which have drifted into near-duplicates
   * (sys/system/systems, sec/security, agent/agents, bench/benchmark). An alias row
   * sets `aliasOf` and carries no display metadata of its own; resolve through it
   * before rendering or filtering.
   */
  tags: defineTable({
    slug: v.string(),
    label: v.string(),
    kind: v.union(
      v.literal("research"), // people.researchAreas — the badges on the people grid
      v.literal("topic"), // publications.topics — the filters on /publications
    ),
    /** Badge class from _data/field_colors.yml, e.g. "badge-dark-blue". */
    color: v.optional(v.string()),
    description: v.optional(v.string()),
    /** Set on an alias row; points at the canonical tag. Aliases are never shown. */
    aliasOf: v.optional(v.id("tags")),
    sortOrder: v.optional(v.number()),
  })
    .index("by_slug", ["slug"])
    .index("by_kind_and_sortOrder", ["kind", "sortOrder"]),

  /**
   * Lab members and affiliates. One row per person, referenced by publications and
   * events rather than repeated as a string.
   */
  people: defineTable({
    /** Stable url-safe identity, e.g. "eugene-wu". Never reuse one. */
    slug: v.string(),
    name: v.string(),
    /** "Wu, Eugene" — set only when it differs from a naive split of `name`. */
    sortName: v.optional(v.string()),
    category: v.union(
      v.literal("faculty"),
      v.literal("postdoc"),
      v.literal("phd"),
      v.literal("student"),
      v.literal("staff"),
      v.literal("alum"),
    ),
    /** Free-text role, e.g. "PhD Student", "Co-Director". */
    title: v.optional(v.string()),
    /** Home department or institution when it is not Columbia CS. */
    affiliation: v.optional(v.string()),
    homepage: v.optional(v.string()),
    /** Kept for contact and for matching a Google login to a profile. */
    email: v.optional(v.string()),
    image: v.optional(image),
    bio: v.optional(v.string()),
    /**
     * Slugs into `tags` (kind: "research"). Bounded and small, so an array rather
     * than a join table; write the canonical slug, never an alias.
     */
    researchAreas: v.array(v.string()),
    /** Advisors who have their own profile. */
    advisorIds: v.array(v.id("people")),
    /** Advisors who do not — kept as plain names rather than fabricating profiles. */
    externalAdvisors: v.array(v.string()),
    /** Hide from the site without deleting the row the papers point at. */
    hidden: v.boolean(),
    /** Manual override within a category; ties fall back to name order. */
    sortOrder: v.optional(v.number()),
    ...submission,
  })
    .index("by_slug", ["slug"])
    .index("by_category_and_sortOrder", ["category", "sortOrder"])
    .index("by_status_and_category", ["status", "category"])
    .index("by_email", ["email"])
    .searchIndex("search_name", { searchField: "name" }),

  /**
   * Papers, preprints, and whitepapers. Authors are in `publicationAuthors`.
   */
  publications: defineTable({
    title: v.string(),
    /** Venue as printed, e.g. "SIGMOD 2016", "arXiv". Matches pubs.yml `conf`. */
    venue: v.string(),
    /** Full date; pubs.yml renders year and month but sorts on the whole thing. */
    pubDate: v.string(), // YYYY-MM-DD
    /** Denormalized from pubDate for cheap year filtering and grouping. */
    year: v.number(),
    url: v.optional(v.string()),
    slidesUrl: v.optional(v.string()),
    codeUrl: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    doi: v.optional(v.string()),
    /** Bare id, e.g. "2401.12345" — the dedupe key when importing from arXiv. */
    arxivId: v.optional(v.string()),
    bibtexKey: v.optional(v.string()),
    /** Canonical slugs into `tags` (kind: "topic"). */
    topics: v.array(v.string()),
    /** e.g. "Best Paper", "Distinguished Artifact". */
    awards: v.array(v.string()),
    acceptanceRate: v.optional(v.string()),
    citations: v.optional(v.number()),
    /** Feature on the front page. */
    selected: v.boolean(),
    /** Short paper / workshop paper — rendered more compactly. */
    short: v.boolean(),
    /** Accepted but not yet presented. */
    future: v.boolean(),
    hidden: v.boolean(),
    comment: v.optional(v.string()),
    /**
     * Denormalized count of `publicationAuthors` rows. Lets a query rank lab
     * authorship strength — first or last author on a 4-author paper is a lab
     * paper; one name among 90 on a consortium paper is not — without reading
     * every author row. Maintain it in the same mutation as any author write.
     */
    authorCount: v.number(),
    ...submission,
  })
    .index("by_status_and_pubDate", ["status", "pubDate"])
    .index("by_year", ["year"])
    .index("by_arxivId", ["arxivId"])
    .index("by_doi", ["doi"])
    .index("by_bibtexKey", ["bibtexKey"])
    .searchIndex("search_title", { searchField: "title" }),

  /**
   * Ordered authorship. One row per author per paper.
   *
   * `position` is 0-based in printed order, so first/last authorship — the signal
   * that separates a lab paper from a paper a lab member's name appears on — is a
   * comparison against `publications.authorCount`, not a string search.
   *
   * `personId` is set only for authors with a profile; everyone else is a name.
   */
  publicationAuthors: defineTable({
    publicationId: v.id("publications"),
    position: v.number(),
    /** Name as printed on the paper, which may differ from `people.name`. */
    name: v.string(),
    personId: v.optional(v.id("people")),
  })
    .index("by_publicationId_and_position", ["publicationId", "position"])
    .index("by_personId_and_publicationId", ["personId", "publicationId"]),

  /**
   * Event series: the filter buttons and series blurbs on /events.
   * Replaces _data/event_types.yml.
   */
  eventSeries: defineTable({
    /** Matches the CSS class suffix and ?type= value, e.g. "ai-in-the-public-interest". */
    slug: v.string(),
    label: v.string(),
    /** Markdown blurb shown above the list when the series is selected. */
    description: v.optional(v.string()),
    logo: v.optional(image),
    sortOrder: v.number(),
    /** Retired series stay for their past events but leave the filter bar. */
    active: v.boolean(),
  }).index("by_slug", ["slug"]),

  /**
   * Talks, workshops, courses, and socials. Speakers are in `eventSpeakers`.
   *
   * This absorbs _data/startups.yml, which is the same shape under the
   * Entrepreneurship series — its `role` field lands on the speaker row.
   */
  events: defineTable({
    title: v.string(),
    /** Slug into `eventSeries`. */
    series: v.string(),
    startDate: v.string(), // YYYY-MM-DD
    /** Set for multi-week things like courses; otherwise absent. */
    endDate: v.optional(v.string()),
    /**
     * Time as displayed, e.g. "3PM-4PM", "10:10AM - 12:00PM F". Free text because
     * the current data is, and because recurring courses encode the weekday here.
     */
    timeLabel: v.optional(v.string()),
    /** 24-hour "15:00", parsed from timeLabel when possible, for calendar export. */
    startTime: v.optional(v.string()),
    endTime: v.optional(v.string()),
    location: v.optional(v.string()),
    locationUrl: v.optional(v.string()),
    /** External page for the event itself, e.g. a registration link. */
    link: v.optional(v.string()),
    description: v.optional(v.string()),
    image: v.optional(image),
    videoUrl: v.optional(v.string()),
    slidesUrl: v.optional(v.string()),
    /**
     * Never rendered publicly. A Zoom link belongs behind a sign-in, not in a
     * static page — see docs/admin-service-design.md.
     */
    zoomUrl: v.optional(v.string()),
    ...submission,
  })
    .index("by_status_and_startDate", ["status", "startDate"])
    .index("by_series_and_startDate", ["series", "startDate"])
    .searchIndex("search_title", { searchField: "title" }),

  /**
   * Who is speaking at an event. One row per speaker.
   *
   * The bio lives here rather than on the event: it describes the person, and the
   * current YAML repeats the same bio on every event that person appears at. When
   * `personId` is set, prefer that profile's bio and treat this one as an override.
   */
  eventSpeakers: defineTable({
    eventId: v.id("events"),
    position: v.number(),
    name: v.string(),
    personId: v.optional(v.id("people")),
    /** "Together.AI" — today this is glued onto the `who` string. */
    affiliation: v.optional(v.string()),
    /** "VP of Research" — the `role` field in startups.yml. */
    role: v.optional(v.string()),
    /** Speaker's own page; today `wholink`, and only ever one per event. */
    url: v.optional(v.string()),
    bio: v.optional(v.string()),
  })
    .index("by_eventId_and_position", ["eventId", "position"])
    .index("by_personId", ["personId"]),

  /**
   * Who may publish. Capability-based, so an event editor need not be an admin and
   * an outside collaborator can hold one grant without a profile.
   *
   * Everyone with a verified @columbia.edu identity may submit; these grants are
   * only about publishing, editing, and rejecting.
   */
  roles: defineTable({
    email: v.string(), // lowercased
    capabilities: v.array(
      v.union(
        v.literal("events"),
        v.literal("publications"),
        v.literal("people"),
        v.literal("admin"), // may edit this table
      ),
    ),
    grantedBy: v.string(),
    grantedAt: v.number(),
  }).index("by_email", ["email"]),

  /**
   * Append-only audit log.
   *
   * Content used to live in git, where `git log` answered "who changed this, and
   * when". Moving it into a database costs that, so record it explicitly: one row
   * per create, update, publish, reject, or delete, holding the document as it
   * looked afterward.
   */
  revisions: defineTable({
    table: v.union(
      v.literal("events"),
      v.literal("publications"),
      v.literal("people"),
      v.literal("eventSeries"),
      v.literal("tags"),
      v.literal("roles"),
    ),
    documentId: v.string(),
    action: v.union(
      v.literal("create"),
      v.literal("update"),
      v.literal("publish"),
      v.literal("reject"),
      v.literal("delete"),
    ),
    actor: v.string(), // email, or "slack:<user id>", or "migration"
    at: v.number(),
    /** The document after the change; absent on delete. */
    snapshot: v.optional(v.any()),
  })
    .index("by_table_and_documentId", ["table", "documentId"])
    .index("by_at", ["at"]),
});
