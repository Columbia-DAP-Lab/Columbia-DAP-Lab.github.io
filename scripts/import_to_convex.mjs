#!/usr/bin/env node
/**
 * One-time import of _data/*.yml into Convex.
 *
 * Reads the YAML, canonicalizes tags against convex/vocabulary.ts, splits the
 * comma-separated author and speaker strings into rows, and calls the internal
 * mutations in convex/migrate.ts through `npx convex run`.
 *
 *   node scripts/import_to_convex.mjs            # dry run: prints what it would send
 *   node scripts/import_to_convex.mjs --write    # actually import (clears first)
 *   node scripts/import_to_convex.mjs --write --prod
 *
 * Idempotent: --write clears the content tables first, so re-running is safe.
 */
import { execFileSync } from "node:child_process";
import { canonicalTopic, canonicalField } from "../convex/vocabulary.ts";

const WRITE = process.argv.includes("--write");
const PROD = process.argv.includes("--prod");

const yaml = (path) =>
  JSON.parse(
    execFileSync("ruby", ["-ryaml", "-rjson", "-e", "print JSON.dump(YAML.load_file(ARGV[0]))", path], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }),
  ) ?? [];

const run = (fn, args) => {
  if (!WRITE) return null;
  const out = execFileSync(
    "npx",
    ["convex", "run", fn, JSON.stringify(args), ...(PROD ? ["--prod"] : [])],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return out.trim();
};

const chunk = (rows, size) =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size));

const clean = (value) => (typeof value === "string" ? value.trim() || undefined : value ?? undefined);
const bool = (value) => value === true;

/** Split "Alice, Bob, Carol" into names, leaving "Jr." style suffixes alone. */
const splitNames = (raw) =>
  String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * `who:` mixes two different things behind the same comma: a list of speakers
 * ("Henry Yuen, Shuze Chen, Tianyi Peng") and one speaker with an affiliation
 * ("Leon Song, Together.AI"). No heuristic separates them reliably — Traversal,
 * Baseten, Anthropic and August all read as personal names.
 *
 * There are twenty such strings in the data, so they are enumerated. A migration
 * over a known, finite set should be auditable rather than clever, and anything
 * not listed here stops the import instead of being split wrongly.
 */
const AFFILIATED = new Set([
  "Aaron Vontell, Anthropic",
  "Amit Agrawal, Structured Template Labs",
  "Anish Agrawal, Traversal",
  "Anish Das Sarma, Reinforce Labs",
  "Ivan Burazin, Daytona",
  "Leon Song, Together.AI",
  "Neil Daswani, Firebolt Ventures",
  "Parag Agrawal, Parallel.ai",
  "Ramin Hasani, Liquid AI",
  "Sidharth Shanker, Baseten",
  "Thomas Bueler-Faudree, August",
  "Tom Effland, Noetica",
  "Vivian Zhang, WarehouseRobot.ai",
  "Xiaofeng Wang, LinkedIn",
]);

const MULTI_SPEAKER = new Set([
  "Baishakhi Ray, Eugene Wu, Abhik Roychoudhury, Maja Vukovic",
  "Gregory Benton, Alison Bartsch, Michael O'Brien, Lindsey Poisson",
  "Henry Yuen, Shuze Chen, Tianyi Peng",
  "Saurabh Jha, Yu Deng, Daby Sow, Ruchi Mahindru",
  "Stefano Soatto, Alessandro Achille",
  'Xuhai "Orson" Xu, Eugene Wu',
]);

const parseSpeakers = (who, { url, role, bio }) => {
  const raw = String(who ?? "").trim();
  if (!raw) return [];

  let speakers;
  if (!raw.includes(",")) {
    speakers = [{ name: raw }];
  } else if (AFFILIATED.has(raw)) {
    const [name, ...rest] = splitNames(raw);
    speakers = [{ name, affiliation: rest.join(", ") }];
  } else if (MULTI_SPEAKER.has(raw)) {
    speakers = splitNames(raw).map((name) => ({ name }));
  } else {
    throw new Error(
      `unrecognized speaker string: ${JSON.stringify(raw)}\n` +
        `Add it to AFFILIATED or MULTI_SPEAKER in scripts/import_to_convex.mjs.`,
    );
  }

  // wholink, role and bio are single-valued in the YAML and describe the lead
  // speaker, which is who the templates render them against. A combined bio for a
  // panel stays whole on the first speaker; the export joins speaker bios back.
  if (url) speakers[0].url = url;
  if (role) speakers[0].role = role;
  if (bio) speakers[0].bio = bio;
  return speakers;
};

// ---------------------------------------------------------------- people

const peopleRows = yaml("_data/people.yml").map((p) => {
  const fields = (p.field ?? []).map((f) => canonicalField(String(f)).slug);
  return {
    name: String(p.name).trim(),
    category: String(p.category ?? "student"),
    homepage: clean(p.homepage),
    image: clean(p.image),
    bio: clean(p.bio),
    fields,
    advisors: (p.advisor ?? []).map((a) => String(a).trim()),
  };
});

// ---------------------------------------------------------- publications

const pubRows = yaml("_data/pubs.yml").map((p) => ({
  title: String(p.title).trim(),
  venue: String(p.conf ?? "").trim(),
  pubDate: String(p.pub_date ?? "").trim(),
  authors: splitNames(p.authors),
  topics: [...new Set((p.tags ?? []).map((t) => canonicalTopic(String(t)).slug))],
  url: clean(p.url),
  slidesUrl: clean(p.slides),
  codeUrl: clean(p.code),
  websiteUrl: clean(p.website),
  bibtexKey: clean(p.key),
  acceptanceRate: clean(p.rate) === undefined ? undefined : String(p.rate),
  citations: typeof p.citations === "number" ? p.citations : undefined,
  // A single "; "-separated string in the YAML; one award per element here.
  awards: p.awards
    ? (Array.isArray(p.awards) ? p.awards.map(String) : String(p.awards).split(/;\s*/))
        .map((a) => a.trim())
        .filter(Boolean)
    : [],
  selected: bool(p.selected),
  short: bool(p.short),
  future: bool(p.future),
  hidden: bool(p.hide),
  comment: clean(p.comment ?? p.comments),
}));

// --------------------------------------------------------------- events

const seriesRows = yaml("_data/event_types.yml")
  .filter((t) => t.slug !== "all")
  .map((t) => ({
    slug: String(t.slug),
    label: String(t.label),
    description: clean(t.description),
    logo: clean(t.logo),
  }));

const slugifyTag = (tag) =>
  String(tag).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// _data/startups.yml is gone: its talks are events tagged Entrepreneurship, and
// _data/events.yml now holds them. Re-running this against the generated export is
// expected — the import and the export are inverses, which is what makes re-running
// safe after a schema change.
const eventRows = yaml("_data/events.yml").map((e) => ({
  title: String(e.title).trim(),
  series: slugifyTag(e.tag),
  startDate: String(e.date).trim(),
  endDate: clean(e.end_date),
  timeLabel: clean(e.time),
  location: clean(e.where),
  link: clean(e.link),
  description: clean(e.description),
  image: clean(e.image),
  videoUrl: clean(e.video),
  slidesUrl: clean(e.slides),
  speakers: parseSpeakers(e.who, { url: clean(e.wholink), role: clean(e.role), bio: clean(e.bio) }),
}));

// ----------------------------------------------------------------- news

/**
 * Small and hand-ordered, so this passes the rows through unchanged. It exists
 * only because `reset` clears the news table too — without it, re-running this
 * script would quietly drop the news.
 */
const newsRows = yaml("_data/news.yml").map((n) => ({
  title: String(n.title).trim(),
  content: String(n.content ?? "").trim(),
  details: clean(n.details),
  featured: bool(n.featured),
  date: n.date ? String(n.date) : undefined,
}));

// ------------------------------------------------------------- projects

/**
 * _projects/<slug>/<slug>.md — front matter plus a Markdown body.
 *
 * Ruby splits the file, since it is already the YAML parser here and Jekyll reads
 * these with the same one.
 */
const projectRows = JSON.parse(
  execFileSync(
    "ruby",
    [
      "-ryaml",
      "-rjson",
      "-e",
      `
      out = Dir.glob("_projects/*/*.md").sort.map do |path|
        text = File.read(path, encoding: "UTF-8")
        _, front, body = text.split(/^---\s*$/, 3)
        data = YAML.load(front) || {}
        { "slug" => File.basename(File.dirname(path)), "front" => data, "body" => body.to_s.strip }
      end
      print JSON.dump(out)
      `,
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  ),
).map(({ slug, front, body }) => ({
  slug,
  title: String(front.title ?? "").trim(),
  subtitle: String(front.subtitle ?? "").trim(),
  date: String(front.date ?? "").slice(0, 10),
  body,
  // Three overlapping booleans become a list. No default: an absent is_project
  // means something (see the export), so an empty list has to survive the trip.
  kinds: [
    ...(front.is_project ? ["project"] : []),
    ...(front.is_benchmark ? ["benchmark"] : []),
    ...(front.is_software ? ["software"] : []),
  ],
  tags: (front.tags ?? []).map(String),
  // Kept apart: avatar is a filename beside the Markdown, avatar_url a site path.
  avatar: clean(front.avatar),
  avatarUrl: clean(front.avatar_url),
  links: Object.entries(front.links ?? {}).map(([kind, url]) => ({ kind, url: String(url) })),
  authors: (front.authors ?? []).map((a) => {
    // "Weiliang Zhao*" is equal contribution, not part of the name — keeping it in
    // the name would make it a different author from "Weiliang Zhao".
    const printed = String(a.name).trim();
    const equalContribution = printed.endsWith("*") || undefined;
    return { name: printed.replace(/\*+$/, "").trim(), url: clean(a.url), equalContribution };
  }),
  publications: (front.publications ?? []).map((p) => ({
    title: String(p.title).trim(),
    venue: String(p.venue ?? "").trim(),
    url: clean(p.url),
    year: typeof p.year === "number" ? p.year : undefined,
  })),
}));

// ----------------------------------------------------------------- run

const unknownSeries = [...new Set(eventRows.map((e) => e.series))].filter(
  (s) => !seriesRows.some((r) => r.slug === s),
);

console.log(`people        ${peopleRows.length}`);
console.log(`publications  ${pubRows.length}  (${pubRows.reduce((n, p) => n + p.authors.length, 0)} author rows)`);
console.log(`events        ${eventRows.length}  (${eventRows.reduce((n, e) => n + e.speakers.length, 0)} speaker rows)`);
console.log(`series        ${seriesRows.length}`);
console.log(`news          ${newsRows.length}`);
console.log(`projects      ${projectRows.length}  (${projectRows.reduce((n, p) => n + p.authors.length, 0)} author rows, ${projectRows.reduce((n, p) => n + p.publications.length, 0)} paper rows)`);
if (unknownSeries.length > 0) {
  console.error(`\nevents reference series not in event_types.yml: ${unknownSeries.join(", ")}`);
  process.exit(1);
}

if (!WRITE) {
  console.log("\ndry run — pass --write to import. Sample speaker parses:");
  for (const e of eventRows.filter((e) => e.speakers.length > 0).slice(0, 6)) {
    console.log(`   ${JSON.stringify(e.speakers)}`);
  }
  process.exit(0);
}

console.log("\nclearing…");
let guard = 0;
while (guard++ < 20) {
  const out = run("migrate:reset", { confirm: "delete all content" });
  if (out?.includes('"done": true') || out?.includes("done: true")) break;
}
console.log("seeding vocabulary…", run("migrate:seedVocabulary", {}));
console.log("seeding series…", run("migrate:seedSeries", { series: seriesRows }));
console.log("importing people…", run("migrate:importPeople", { people: peopleRows }));
for (const batch of chunk(pubRows, 20)) {
  console.log("importing publications…", run("migrate:importPublications", { publications: batch }));
}
for (const batch of chunk(eventRows, 20)) {
  console.log("importing events…", run("migrate:importEvents", { events: batch }));
}
console.log("importing news…", run("migrate:importNews", { news: newsRows }));
for (const batch of chunk(projectRows, 10)) {
  console.log("importing projects…", run("migrate:importProjects", { projects: batch }));
}
console.log("\ncounts:", run("migrate:counts", {}));
