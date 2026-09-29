#!/usr/bin/env node
/**
 * Compare what Convex exports against the YAML committed in _data/.
 *
 * The comparison is semantic, not textual: YAML formatting (quoting, folded
 * scalars, key order, comments) is not reproducible and does not matter, since
 * Jekyll reads the parsed structure. What matters is that every record survives
 * with the same fields and values.
 *
 *   node scripts/verify_roundtrip.mjs                # against a fresh export
 *   node scripts/verify_roundtrip.mjs --out /tmp/x   # against an existing export
 *
 * Differences that are expected by design are listed and not counted as failures:
 * canonicalized publication tags, and the merge of startups.yml into events.
 */
import { execFileSync } from "node:child_process";

const argv = process.argv.slice(2);
const outIndex = argv.indexOf("--out");
const exported =
  outIndex >= 0
    ? null
    : {
        events: run("content:events"),
        pubs: run("content:publications"),
        people: run("content:people"),
      };

function run(fn) {
  return JSON.parse(
    execFileSync("npx", ["convex", "run", fn, "{}"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }),
  );
}
function yaml(path) {
  return (
    JSON.parse(
      execFileSync("ruby", ["-ryaml", "-rjson", "-e", "print JSON.dump(YAML.load_file(ARGV[0]))", path], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      }),
    ) ?? []
  );
}

const norm = (value) => {
  if (Array.isArray(value)) return value.map(norm);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, norm(v)]),
    );
  }
  if (typeof value === "string") return value.trim();
  return value;
};

let failures = 0;
const compare = (name, originals, exports_, key, ignore = []) => {
  const byKey = (rows) => new Map(rows.map((r) => [key(r), r]));
  const before = byKey(originals);
  const after = byKey(exports_);

  const missing = [...before.keys()].filter((k) => !after.has(k));
  const added = [...after.keys()].filter((k) => !before.has(k));
  const changed = [];

  for (const [k, original] of before) {
    const exportedRow = after.get(k);
    if (!exportedRow) continue;
    const a = norm(original);
    const b = norm(exportedRow);
    for (const field of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (ignore.includes(field)) continue;
      if (JSON.stringify(a[field]) !== JSON.stringify(b[field])) {
        changed.push({ k, field, before: a[field], after: b[field] });
      }
    }
  }

  console.log(`\n### ${name}: ${originals.length} in, ${exports_.length} out`);
  if (missing.length) console.log(`  MISSING (${missing.length}): ${missing.slice(0, 5).join(" | ")}`);
  if (added.length) console.log(`  ADDED (${added.length}): ${added.slice(0, 5).join(" | ")}`);
  if (changed.length) {
    console.log(`  FIELD DIFFERENCES (${changed.length}):`);
    for (const c of changed.slice(0, 25)) {
      console.log(`    [${c.k.slice(0, 48)}] ${c.field}`);
      console.log(`       before: ${JSON.stringify(c.before)?.slice(0, 160)}`);
      console.log(`       after:  ${JSON.stringify(c.after)?.slice(0, 160)}`);
    }
    if (changed.length > 25) console.log(`    …and ${changed.length - 25} more`);
  }
  if (!missing.length && !added.length && !changed.length) console.log("  identical");
  failures += missing.length + added.length + changed.length;
};

compare(
  "events",
  [...yaml("_data/events.yml"), ...yaml("_data/startups.yml")],
  exported.events,
  (e) => `${e.date}|${e.title}`,
);
compare("publications", yaml("_data/pubs.yml"), exported.pubs, (p) => p.title, ["tags"]);
compare("people", yaml("_data/people.yml"), exported.people, (p) => p.name);

console.log(
  `\npublication tags are excluded from the comparison — canonicalizing them is the point;\n` +
    `run scripts/tag_report.mjs to see those rewrites.`,
);
console.log(failures === 0 ? "\nROUND TRIP CLEAN" : `\n${failures} difference(s)`);
process.exit(failures === 0 ? 0 : 1);
