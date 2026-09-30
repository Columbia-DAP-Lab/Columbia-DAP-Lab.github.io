#!/usr/bin/env node
/**
 * One-time move of the site's content images from the repo into Convex storage.
 *
 * People photos, event images, series logos, project card images and images inside
 * project descriptions were files in the repo (files/images/…, _projects/<slug>/…)
 * that Convex records pointed at by path. This uploads each one, resized, and points
 * the record at the stored file (convex/imageMigration.ts). The site build then
 * copies stored images into the site, so visitors still load them from GitHub
 * Pages, not from Convex (_plugins/convex_content.rb).
 *
 *   node scripts/migrate_images_to_convex.mjs                # dry run against dev
 *   node scripts/migrate_images_to_convex.mjs --write        # migrate dev
 *   node scripts/migrate_images_to_convex.mjs --write --prod # migrate production
 *
 * The dry run resizes everything into a temporary folder and reports sizes; it
 * writes nothing to Convex. Re-running --write only picks up what is still a repo
 * path. Needs macOS (resizing uses the built-in `sips`) and a checkout that still
 * has the image files.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const argv = process.argv.slice(2);
const write = argv.includes("--write");
const target = argv.includes("--prod") ? ["--prod"] : [];
const where = target.length ? "production" : "dev";

/** Longest side, in pixels. Photos on the People page render at 120px; 480 covers 4x. */
const MAX_SIDE = { people: 480, events: 1600, eventSeries: 800, projects: 1600 };
/** An opaque PNG larger than this after resizing is re-encoded as JPEG. */
const PNG_TO_JPEG_BYTES = 400_000;
/** File extensions for the content types sips can resize. */
const RESIZABLE = { "image/jpeg": ".jpg", "image/png": ".png" };

const convex = (fn, args) =>
  JSON.parse(
    execFileSync("npx", ["convex", "run", ...target, fn, JSON.stringify(args)], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );

const sips = (...args) => execFileSync("sips", args, { encoding: "utf8" });
const dims = (file) => {
  const out = sips("-g", "pixelWidth", "-g", "pixelHeight", "-g", "hasAlpha", file);
  const num = (key) => Number(out.match(new RegExp(`${key}: (\\d+)`))?.[1] ?? 0);
  return { width: num("pixelWidth"), height: num("pixelHeight"), alpha: /hasAlpha: yes/.test(out) };
};

/**
 * What a file really is. Several are named for another format (JPEGs saved as
 * .png, a WebP as .png), so the extension is not trusted.
 */
const typeOf = (file) => execFileSync("file", ["--brief", "--mime-type", file], { encoding: "utf8" }).trim();

/**
 * The file to upload and its content type: a resized copy in `dir` for JPEG and
 * PNG, the original for anything else (AVIF, WebP, GIF, SVG) or when resizing
 * would not make it smaller.
 */
const prepare = (source, table, dir) => {
  const type = typeOf(source);
  if (!type.startsWith("image/")) throw new Error(`${source} is not an image (${type})`);
  if (!(type in RESIZABLE)) return { file: source, type };

  const { width, height, alpha } = dims(source);
  const max = MAX_SIDE[table];
  const stem = `${path.basename(source, path.extname(source))}-${Math.random().toString(36).slice(2, 8)}`;
  let out = path.join(dir, stem + RESIZABLE[type]);
  let outType = type;
  if (Math.max(width, height) > max) sips("-Z", String(max), source, "--out", out);
  else fs.copyFileSync(source, out);
  if (type === "image/jpeg" && fs.statSync(out).size > 200_000) sips("-s", "formatOptions", "82", out, "--out", out);
  if (type === "image/png" && !alpha && fs.statSync(out).size > PNG_TO_JPEG_BYTES) {
    const jpg = path.join(dir, `${stem}.jpg`);
    sips("-s", "format", "jpeg", "-s", "formatOptions", "82", out, "--out", jpg);
    out = jpg;
    outType = "image/jpeg";
  }
  return fs.statSync(out).size < fs.statSync(source).size ? { file: out, type: outType } : { file: source, type };
};

const refs = convex("imageMigration:pathImages", {});
console.log(`${refs.length} images on ${where} still point at repo files.`);
if (refs.length === 0) process.exit(0);

const missing = refs.filter((r) => !fs.existsSync("." + r.path));
if (missing.length) {
  console.error("Missing from this checkout:", missing.map((r) => r.path));
  process.exit(1);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "daplab-images-"));
const files = new Map(); // repo path -> prepared file (one upload per path)
let before = 0;
let after = 0;
for (const ref of refs) {
  if (files.has(ref.path)) continue;
  const source = "." + ref.path;
  const prepared = prepare(source, ref.table, tmp);
  files.set(ref.path, prepared);
  before += fs.statSync(source).size;
  after += fs.statSync(prepared.file).size;
}
const mb = (n) => `${(n / 1e6).toFixed(1)} MB`;
console.log(`${files.size} files: ${mb(before)} in the repo, ${mb(after)} after resizing.`);

if (!write) {
  console.log("Dry run: nothing written to Convex. Resized copies are in", tmp);
  process.exit(0);
}

const urls = convex("imageMigration:uploadUrls", { count: files.size });
const stored = new Map(); // repo path -> storageId
let i = 0;
for (const [repoPath, { file, type }] of files) {
  const response = await fetch(urls[i++], { method: "POST", headers: { "content-type": type }, body: fs.readFileSync(file) });
  if (!response.ok) throw new Error(`upload of ${repoPath} failed: ${response.status} ${await response.text()}`);
  stored.set(repoPath, (await response.json()).storageId);
  process.stdout.write(".");
}
console.log(`\nUploaded ${stored.size} files to ${where}.`);

const items = refs.map((r) => ({ table: r.table, id: r.id, field: r.field, path: r.path, storageId: stored.get(r.path) }));
for (let start = 0; start < items.length; start += 25) {
  convex("imageMigration:useStoredImages", { items: items.slice(start, start + 25) });
}
const left = convex("imageMigration:pathImages", {});
console.log(`Pointed ${items.length} references at stored files. Still pointing at repo files: ${left.length}.`);
fs.rmSync(tmp, { recursive: true, force: true });
