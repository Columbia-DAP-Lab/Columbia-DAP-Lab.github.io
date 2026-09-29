#!/usr/bin/env node
/**
 * Write _data/*.yml from Convex.
 *
 * This is what the site build will do: fetch the published content and lay it down
 * where the Jekyll templates expect it. Run against a directory to inspect the
 * output; run with --write to overwrite _data/ in place.
 *
 *   node scripts/export_from_convex.mjs --out /tmp/exported
 *   node scripts/export_from_convex.mjs --write
 *   node scripts/export_from_convex.mjs --write --prod
 *
 * Events come back as one file: _data/startups.yml is folded into events, so it is
 * emitted empty and can be deleted once the build reads from here.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};

const PROD = flag("--prod");
const outDir = flag("--write") ? "_data" : value("--out", "_data_exported");

const query = (fn) =>
  JSON.parse(
    execFileSync("npx", ["convex", "run", fn, "{}", ...(PROD ? ["--prod"] : [])], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }),
  );

/** Ruby writes the YAML: it ships with Jekyll and matches how the site reads it. */
const toYaml = (rows, header) =>
  execFileSync("ruby", ["-ryaml", "-rjson", "-e", `print(JSON.parse(STDIN.read).to_yaml)`], {
    input: JSON.stringify(rows),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).replace(/^---\n/, header);

const GENERATED = (source) =>
  `# Generated from Convex by scripts/export_from_convex.mjs — DO NOT EDIT.\n` +
  `# Edit at /admin, or in the Convex dashboard. Source of truth: the ${source} table.\n`;

mkdirSync(outDir, { recursive: true });

for (const [file, fn, table] of [
  ["events.yml", "content:events", "events"],
  ["pubs.yml", "content:publications", "publications"],
  ["people.yml", "content:people", "people"],
]) {
  const rows = query(fn);
  writeFileSync(join(outDir, file), toYaml(rows, GENERATED(table)));
  console.log(`${outDir}/${file}  ${rows.length} records`);
}
