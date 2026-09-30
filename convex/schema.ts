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
   * Publication topics: the `tags:` lists in _data/pubs.yml and the filter buttons
   * on /publications. Slugs are unique.
   *
   * Kept separate from `fields` because the same slug means different things on
   * either side — `ai` is "Agent Intelligence" on a paper and "AI" as somebody's
   * research area, and `security`, `rl`, `hci` and `robotics` collide the same way.
   * One table would have to pick a winner.
   *
   * Every slug stored anywhere is canonical: the drifted spellings in the current
   * data (system/systems, sec, benchmark, and the tags containing spaces) are
   * collapsed once during the import — see convex/vocabulary.ts — so nothing has to
   * resolve an alias at read time.
   */
  topics: defineTable({
    slug: v.string(),
    label: v.string(),
    description: v.optional(v.string()),
    /** Set for the handful that appear as filter buttons; absent otherwise. */
    sortOrder: v.optional(v.number()),
  }).index("by_slug", ["slug"]),

  /**
   * The badges on the people grid: the `field:` lists in _data/people.yml, with the
   * colors from _data/field_colors.yml. Slugs are unique.
   *
   * `kind` records what a badge actually is. field_colors.yml already grouped them
   * this way in comments — research areas, "Academic groups" (CS, IEOR), and
   * "Administrative and advisory" (Advisory Board, co-director) — but the site
   * renders all three in one row, so they stay one vocabulary.
   */
  fields: defineTable({
    slug: v.string(),
    label: v.string(),
    kind: v.union(
      v.literal("research"), // e.g. Systems, Causal inference
      v.literal("department"), // e.g. CS, IEOR, DBMI
      v.literal("role"), // e.g. Advisory Board, Co-Director
    ),
    /** Badge class from _data/field_colors.yml, e.g. "badge-dark-blue". */
    color: v.optional(v.string()),
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
     * Ordered canonical slugs into `fields`, rendered as the badge row on the
     * people grid. Mixed kinds, because today's row mixes them: a person shows
     * research areas alongside their department and any advisory role. Bounded and
     * small, so an array rather than a join table.
     */
    fields: v.array(v.string()),
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
    /**
     * Wherever the paper lives — an arXiv page, a publisher's site, a PDF. This is
     * the link the title carries on /publications.
     *
     * It is also the only identifier the paper needs. A DOI or an arXiv id would be
     * a second spelling of the same fact, and the URL is what the page actually
     * uses; both were declared here and neither was ever populated.
     *
     * Optional: two of the current papers have no link yet.
     */
    url: v.optional(v.string()),
    slidesUrl: v.optional(v.string()),
    codeUrl: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    bibtexKey: v.optional(v.string()),
    /** Canonical slugs into `topics`. */
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
    .index("by_submittedBy_and_submittedAt", ["submittedBy", "submittedAt"])
    .index("by_url", ["url"])
    .index("by_bibtexKey", ["bibtexKey"])
    .searchIndex("search_title", { searchField: "title" }),

  /**
   * Every person who has authored something, once. 419 rows for 645 authorships.
   *
   * Most authors are not lab members — coauthors elsewhere, students who have since
   * left — so they cannot all live in `people`, which is the site's directory and
   * carries photos, advisors and research areas. An author who *is* in the directory
   * sets `personId`, and that link is what lets a profile page list their papers.
   *
   * Identity is `matchKey`: the name lowercased with accents and punctuation
   * stripped. That merges "Silvia Sellán" with "Silvia Sellan" and little else —
   * initials ("E. Wu") stay separate, and two different people who share a name
   * would merge. Neither case occurs in the current data; both are worth knowing.
   */
  authors: defineTable({
    /** Name as first seen in print; what the site renders. */
    name: v.string(),
    /** Normalized identity, unique across the table. */
    matchKey: v.string(),
    /** Set when this author is also in the directory. */
    personId: v.optional(v.id("people")),
    /**
     * Denormalized count of `publicationAuthors` rows, so a listing can show or
     * rank by paper count without reading every join row. Maintained in the same
     * mutation as any authorship write.
     */
    publicationCount: v.number(),
  })
    .index("by_matchKey", ["matchKey"])
    .index("by_personId", ["personId"])
    .searchIndex("search_name", { searchField: "name" }),

  /**
   * Ordered authorship: which authors a paper has, and in what order.
   *
   * One row per author per paper, holding the two ids and the position — the name
   * lives once, in `authors`. `position` is 0-based in printed order, so first or
   * last authorship — the signal separating a lab paper from a paper a lab member's
   * name appears on — is a comparison against `publications.authorCount`.
   *
   * Read forwards (`by_publicationId_and_position`) for a paper's author list, and
   * backwards (`by_authorId`) for everything one person has written.
   */
  publicationAuthors: defineTable({
    publicationId: v.id("publications"),
    authorId: v.id("authors"),
    position: v.number(),
    /**
     * The asterisk in "Haonan Wang*" — equal contribution on this paper.
     *
     * It belongs here rather than in the name: it says something about one paper,
     * not about the person, and keeping it in the name would make "Haonan Wang*"
     * and "Haonan Wang" two different authors.
     */
    equalContribution: v.optional(v.boolean()),
  })
    .index("by_publicationId_and_position", ["publicationId", "position"])
    .index("by_authorId", ["authorId"]),

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
    .index("by_submittedBy_and_submittedAt", ["submittedBy", "submittedAt"])
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
   * Homepage and /news items.
   *
   * `sortOrder` preserves file order, which is not date order: index.html filters
   * `where: featured, true` and renders the list as written, so the homepage
   * ordering is a hand-made editorial choice. /news sorts by date itself.
   */
  news: defineTable({
    /** Markdown, rendered inline — often a single link. */
    title: v.string(),
    /** Markdown summary, shown on the homepage and as the /news fallback. */
    content: v.string(),
    /** Longer Markdown shown on /news in place of `content`. */
    details: v.optional(v.string()),
    featured: v.boolean(),
    date: v.optional(v.string()), // YYYY-MM-DD
    sortOrder: v.number(),
    ...submission,
  })
    .index("by_status_and_sortOrder", ["status", "sortOrder"])
    .index("by_status_and_date", ["status", "date"]),

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
   * Projects, benchmarks and software — the _projects/ collection.
   *
   * Unlike everything else here, these are not _data rows: each is a Markdown
   * document with front matter that Jekyll renders into its own page at
   * /projects/<slug>/. So `body` carries the Markdown, and the build writes the
   * file back out rather than a YAML list.
   *
   * The images stay in the repo at _projects/<slug>/, because `avatar` is a
   * filename relative to that directory and the collection copies it verbatim.
   */
  projects: defineTable({
    /** Directory name and permalink, e.g. "aconic". Never reuse one. */
    slug: v.string(),
    title: v.string(),
    subtitle: v.string(),
    date: v.string(), // YYYY-MM-DD
    /** Everything after the front matter, as written. */
    body: v.string(),
    /**
     * Three booleans in the front matter — is_project, is_benchmark,
     * is_software — which are not exclusive: the same work is often a benchmark
     * and software. A list says that plainly and leaves room for a fourth.
     */
    kinds: v.array(
      v.union(v.literal("project"), v.literal("benchmark"), v.literal("software")),
    ),
    /** Free-form display chips ("Workflow", "LLM Safety"), not a controlled vocabulary. */
    tags: v.array(v.string()),
    /**
     * Two different things in the front matter, and the templates render them
     * differently: `avatar` is a filename beside the Markdown, served from
     * /_projects/<slug>/; `avatarUrl` is a site-absolute path run through
     * relative_url. Collapsing them produces /_projects/<slug>//files/....
     */
    avatar: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    /**
     * The `links:` map, ordered and typed. Kinds in use: github, blog, website,
     * paper, demo, pypi, leaderboard — a string rather than a union so a new kind
     * does not need a schema change.
     */
    links: v.array(v.object({ kind: v.string(), url: v.string() })),
    ...submission,
  })
    .index("by_slug", ["slug"])
    .index("by_status_and_date", ["status", "date"])
    .searchIndex("search_title", { searchField: "title" }),

  /**
   * Who is credited on a project, in order.
   *
   * Shares the `authors` table with publications, so a name resolves to the same
   * author row either way, and `url` overrides that author's link for this project.
   */
  projectAuthors: defineTable({
    projectId: v.id("projects"),
    authorId: v.id("authors"),
    position: v.number(),
    url: v.optional(v.string()),
    /** The asterisk in "Weiliang Zhao*", as on publicationAuthors. */
    equalContribution: v.optional(v.boolean()),
  })
    .index("by_projectId_and_position", ["projectId", "position"])
    .index("by_authorId", ["authorId"]),

  /**
   * Papers listed on a project page.
   *
   * The front matter repeats title, venue, url and year even for papers that are
   * also in `publications`, so those fields are kept and `publicationId` links the
   * record when one matches. The link is what makes "which projects cite this
   * paper" answerable; the literal fields are what the page renders.
   */
  projectPublications: defineTable({
    projectId: v.id("projects"),
    position: v.number(),
    title: v.string(),
    venue: v.string(),
    url: v.optional(v.string()),
    year: v.optional(v.number()),
    publicationId: v.optional(v.id("publications")),
  })
    .index("by_projectId_and_position", ["projectId", "position"])
    .index("by_publicationId", ["publicationId"]),

  /**
   * The last time a content change asked for a site rebuild.
   *
   * One row. It exists so a scheduled send can tell whether another publish
   * happened while it waited, which is what debounces a burst of publishing into a
   * single build. See convex/deployHook.ts.
   */
  rebuildRequests: defineTable({
    requestedAt: v.number(),
  }),

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
      v.literal("news"),
      v.literal("projects"),
      v.literal("topics"),
      v.literal("fields"),
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
