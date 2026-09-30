import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { checkImage } from "./admin";

/**
 * Moving the images that still live in the repo into Convex file storage.
 *
 * Driven by scripts/migrate_images_to_convex.mjs, which reads each file from the
 * repo, resizes it, uploads it, and calls `useStoredImages`. Internal: reachable
 * only through `npx convex run`, never from the browser. Safe to re-run; each pass
 * lists only what still points at a repo file.
 */

const table = v.union(v.literal("people"), v.literal("events"), v.literal("eventSeries"), v.literal("projects"));
/** Which reference to a repo file this is. */
const field = v.union(v.literal("image"), v.literal("logo"), v.literal("avatar"), v.literal("avatarUrl"), v.literal("body"));

/** An image in Markdown or HTML that is a site path, not a URL. */
const BODY_IMAGE = /(?:\]\(|src=["'])(\/[^)"'\s]+\.(?:png|jpe?g|gif|webp|svg))/gi;

/** Every image reference that is still a repo path, in every table and status. */
export const pathImages = internalQuery({
  args: {},
  returns: v.array(v.object({ table, id: v.string(), field, path: v.string(), label: v.string() })),
  handler: async (ctx) => {
    const out = [];
    for (const p of await ctx.db.query("people").take(2000)) {
      if (p.image?.kind === "path") out.push({ table: "people" as const, id: p._id, field: "image" as const, path: p.image.path, label: p.name });
    }
    for (const e of await ctx.db.query("events").take(5000)) {
      if (e.image?.kind === "path") out.push({ table: "events" as const, id: e._id, field: "image" as const, path: e.image.path, label: e.title });
    }
    for (const s of await ctx.db.query("eventSeries").take(100)) {
      if (s.logo?.kind === "path") out.push({ table: "eventSeries" as const, id: s._id, field: "logo" as const, path: s.logo.path, label: s.label });
    }
    for (const p of await ctx.db.query("projects").take(500)) {
      if (p.image === undefined && p.avatar) {
        out.push({ table: "projects" as const, id: p._id, field: "avatar" as const, path: `/_projects/${p.slug}/${p.avatar}`, label: p.title });
      } else if (p.image === undefined && p.avatarUrl && p.avatarUrl.startsWith("/")) {
        out.push({ table: "projects" as const, id: p._id, field: "avatarUrl" as const, path: p.avatarUrl, label: p.title });
      }
      for (const path of new Set([...p.body.matchAll(BODY_IMAGE)].map((m) => m[1]))) {
        out.push({ table: "projects" as const, id: p._id, field: "body" as const, path, label: p.title });
      }
    }
    return out;
  },
});

/** Upload URLs for a batch; each is good for one upload, for an hour. */
export const uploadUrls = internalMutation({
  args: { count: v.number() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const urls = [];
    for (let i = 0; i < Math.min(args.count, 500); i++) urls.push(await ctx.storage.generateUploadUrl());
    return urls;
  },
});

/**
 * Point one reference at an uploaded file. For a project description, every
 * occurrence of the repo path becomes `convex-storage:<id>`, which the content
 * export resolves to a file URL (convex/content.ts).
 */
const reference = v.object({ table, id: v.string(), field, path: v.string(), storageId: v.id("_storage") });

export const useStoredImages = internalMutation({
  args: { items: v.array(reference) },
  returns: v.number(),
  handler: async (ctx, { items }) => {
    for (const args of items) await useStoredImage(ctx, args);
    return items.length;
  },
});

const useStoredImage = async (
  ctx: MutationCtx,
  args: { table: "people" | "events" | "eventSeries" | "projects"; id: string; field: string; path: string; storageId: Id<"_storage"> },
) => {
    await checkImage(ctx, args.storageId);
    const image = { kind: "storage" as const, storageId: args.storageId };
    const id = ctx.db.normalizeId(args.table, args.id);
    if (id === null) throw new ConvexError(`No ${args.table} ${args.id}`);

    switch (args.table) {
      case "people":
        await ctx.db.patch("people", id as Id<"people">, { image });
        break;
      case "events":
        await ctx.db.patch("events", id as Id<"events">, { image });
        break;
      case "eventSeries":
        await ctx.db.patch("eventSeries", id as Id<"eventSeries">, { logo: image });
        break;
      case "projects": {
        const project = await ctx.db.get("projects", id as Id<"projects">);
        if (project === null) throw new ConvexError(`No project ${args.id}`);
        if (args.field === "body") {
          await ctx.db.patch("projects", project._id, {
            body: project.body.split(args.path).join(`convex-storage:${args.storageId}`),
          });
        } else {
          // The card image moves to `image`; the two repo forms go away.
          await ctx.db.patch("projects", project._id, { image, avatar: undefined, avatarUrl: undefined });
        }
        break;
      }
    }
};
