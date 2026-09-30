#!/usr/bin/env node
/**
 * Dry run of the tag canonicalization in convex/vocabulary.ts against the current
 * _data/*.yml, so the mapping can be reviewed before any data moves.
 *
 * Reports every spelling that gets rewritten, and fails if anything in the data
 * does not resolve to a tag in the vocabulary.
 *
 *   node scripts/tag_report.mjs        (from the repo root; needs ruby for YAML)
 */
import { execFileSync } from "node:child_process";
import { canonicalTopic, canonicalField, TOPICS, FIELDS } from "../convex/vocabulary.ts";

const loadYaml = (path) =>
  JSON.parse(
    execFileSync("ruby", ["-ryaml", "-rjson", "-e", `print JSON.dump(YAML.load_file(ARGV[0]))`, path], {
      encoding: "utf8",
    }),
  );

const report = (name, rows, field, canonicalize) => {
  const rewritten = new Map();
  const unresolved = new Map();
  for (const row of rows) {
    for (const raw of row[field] ?? []) {
      const original = String(raw).trim();
      const { slug, known } = canonicalize(original);
      if (!known) unresolved.set(original, (unresolved.get(original) ?? 0) + 1);
      if (original !== slug) {
        const key = `${original}  ->  ${slug}`;
        rewritten.set(key, (rewritten.get(key) ?? 0) + 1);
      }
    }
  }
  console.log(`### ${name}: ${rewritten.size} spellings rewritten`);
  for (const [key, count] of [...rewritten].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${key}   (${count} use${count === 1 ? "" : "s"})`);
  }
  for (const [raw, count] of unresolved) {
    console.log(`   !! not in the vocabulary: ${JSON.stringify(raw)}   (${count})`);
  }
  console.log();
  return unresolved.size;
};

const unresolved =
  report("publication topics", loadYaml("_data/pubs.yml"), "tags", canonicalTopic) +
  report("people fields", loadYaml("_data/people.yml"), "field", canonicalField);

console.log(`vocabulary: ${TOPICS.length} topics, ${FIELDS.length} people tags`);
if (unresolved > 0) {
  console.error(`\n${unresolved} value(s) do not resolve — add them to convex/vocabulary.ts`);
  process.exit(1);
}
console.log("every value in the data resolves to a canonical tag");
