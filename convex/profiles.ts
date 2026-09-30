import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { checkImage, record } from "./admin";
import { accessFor, profileFor, requireCapability, requireSubmitter } from "./authz";

/**
 * People editing their own People-page profile.
 *
 * A member's edit is a proposal: it lands in `profileEdits` and the published
 * profile changes only when an admin approves it. Sign-in can match a profile by
 * name (convex/authz.ts), and a wrong match must not be able to rewrite someone
 * else's page. An admin's edit to their own profile applies at once.
 *
 * Name and group are not editable here; those are an admin's to change.
 */

/** The fields a person may change about themselves, as the form sends them. */
const editable = {
  title: v.optional(v.string()),
  affiliation: v.optional(v.string()),
  homepage: v.optional(v.string()),
  bio: v.optional(v.string()),
  fields: v.array(v.string()),
  /** A new photo, from admin:generateUploadUrl. Absent keeps the current one. */
  image: v.optional(v.id("_storage")),
};

type Changes = Doc<"profileEdits">["changes"];
const TEXT_FIELDS = ["title", "affiliation", "homepage", "bio"] as const;

const imageUrl = async (ctx: QueryCtx, image: Doc<"people">["image"]) =>
  image?.kind === "storage" ? await ctx.storage.getUrl(image.storageId) : image?.path ?? null;

/** Apply approved changes to the profile; null clears a field. */
const apply = async (ctx: MutationCtx, person: Doc<"people">, changes: Changes, actor: string) => {
  const patch: Partial<Doc<"people">> = {};
  for (const key of TEXT_FIELDS) {
    if (key in changes) patch[key] = changes[key] ?? undefined;
  }
  if (changes.fields !== undefined) patch.fields = changes.fields;
  if (changes.image !== undefined) patch.image = { kind: "storage", storageId: changes.image };
  await ctx.db.patch("people", person._id, patch);
  await record(ctx, {
    table: "people",
    documentId: person._id,
    action: "update",
    actor,
    snapshot: changes,
    // Only a published profile is on the site.
    affectsSite: person.status === "published",
  });
};

/** The signed-in person's profile, for the Edit profile form, with any edit awaiting review. */
export const myProfile = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      name: v.string(),
      category: v.string(),
      title: v.optional(v.string()),
      affiliation: v.optional(v.string()),
      homepage: v.optional(v.string()),
      bio: v.optional(v.string()),
      fields: v.array(v.string()),
      imageUrl: v.union(v.string(), v.null()),
      pendingSince: v.union(v.number(), v.null()),
      appliesImmediately: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const access = await accessFor(ctx);
    if (access === null || access.capabilities.length === 0) return null;
    const person = await profileFor(ctx);
    if (person === null) return null;
    const pending = await ctx.db
      .query("profileEdits")
      .withIndex("by_personId_and_status", (q) => q.eq("personId", person._id).eq("status", "pending"))
      .first();
    return {
      name: person.name,
      category: person.category,
      title: person.title,
      affiliation: person.affiliation,
      homepage: person.homepage,
      bio: person.bio,
      fields: person.fields,
      imageUrl: await imageUrl(ctx, person.image),
      pendingSince: pending?.submittedAt ?? null,
      appliesImmediately: access.capabilities.includes("admin"),
    };
  },
});

/**
 * Propose changes to your own profile, or make them if you are an admin.
 *
 * Only fields that differ from the profile are kept. A second proposal before
 * the first is reviewed replaces it rather than queueing behind it.
 */
export const submitProfileEdit = mutation({
  args: editable,
  returns: v.object({ applied: v.boolean() }),
  handler: async (ctx, args) => {
    const email = await requireSubmitter(ctx);
    const person = await profileFor(ctx);
    if (person === null) throw new ConvexError("No People-page profile is linked to your account.");

    const changes: Changes = {};
    for (const key of TEXT_FIELDS) {
      const next = args[key]?.trim() || null;
      if (next !== (person[key] ?? null)) changes[key] = next;
    }
    for (const slug of args.fields) {
      const field = await ctx.db
        .query("fields")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();
      if (field === null) throw new ConvexError(`Unknown badge: ${slug}`);
    }
    if (args.fields.join() !== person.fields.join()) changes.fields = args.fields;
    if (args.image !== undefined) {
      await checkImage(ctx, args.image);
      changes.image = args.image;
    }
    if (Object.keys(changes).length === 0) throw new ConvexError("Nothing changed.");

    const access = await accessFor(ctx);
    if (access?.capabilities.includes("admin")) {
      await apply(ctx, person, changes, email);
      return { applied: true };
    }

    const existing = await ctx.db
      .query("profileEdits")
      .withIndex("by_personId_and_status", (q) => q.eq("personId", person._id).eq("status", "pending"))
      .first();
    const edit = { changes, submittedBy: email, submittedAt: Date.now() };
    if (existing !== null) await ctx.db.patch("profileEdits", existing._id, edit);
    else await ctx.db.insert("profileEdits", { personId: person._id, status: "pending", ...edit });
    return { applied: false };
  },
});

/** Profile edits awaiting review, each with the current values beside the proposed ones. */
export const pendingEdits = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("profileEdits"),
      name: v.string(),
      submittedBy: v.string(),
      submittedAt: v.number(),
      rows: v.array(v.object({ field: v.string(), before: v.string(), after: v.string() })),
      imageUrl: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    await requireCapability(ctx, "people");
    const edits = await ctx.db
      .query("profileEdits")
      .withIndex("by_status_and_submittedAt", (q) => q.eq("status", "pending"))
      .take(100);
    const out = [];
    for (const edit of edits) {
      const person = await ctx.db.get("people", edit.personId);
      if (person === null) continue;
      const rows = [];
      for (const key of TEXT_FIELDS) {
        if (key in edit.changes) rows.push({ field: key, before: person[key] ?? "", after: edit.changes[key] ?? "" });
      }
      if (edit.changes.fields !== undefined) {
        rows.push({ field: "badges", before: person.fields.join(", "), after: edit.changes.fields.join(", ") });
      }
      out.push({
        _id: edit._id,
        name: person.name,
        submittedBy: edit.submittedBy,
        submittedAt: edit.submittedAt,
        rows,
        imageUrl: edit.changes.image ? await ctx.storage.getUrl(edit.changes.image) : null,
      });
    }
    return out;
  },
});

/** Approve or reject a proposed profile edit. */
export const reviewEdit = mutation({
  args: {
    id: v.id("profileEdits"),
    decision: v.union(v.literal("published"), v.literal("rejected")),
    reviewNote: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = await requireCapability(ctx, "people");
    const edit = await ctx.db.get("profileEdits", args.id);
    if (edit === null || edit.status !== "pending") throw new ConvexError("That edit is no longer waiting for review.");
    if (args.decision === "published") {
      const person = await ctx.db.get("people", edit.personId);
      if (person === null) throw new ConvexError("That profile no longer exists.");
      await apply(ctx, person, edit.changes, email);
    }
    await ctx.db.patch("profileEdits", edit._id, {
      status: args.decision,
      reviewedBy: email,
      reviewedAt: Date.now(),
      reviewNote: args.reviewNote,
    });
    return null;
  },
});

/** The signed-in person's own profile edits, for My submissions. */
export const myEdits = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("profileEdits"),
      status: v.string(),
      submittedAt: v.number(),
      reviewNote: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const access = await accessFor(ctx);
    if (access === null) return [];
    const edits = await ctx.db
      .query("profileEdits")
      .withIndex("by_submittedBy_and_submittedAt", (q) => q.eq("submittedBy", access.email))
      .order("desc")
      .take(10);
    return edits.map((e) => ({ _id: e._id, status: e.status, submittedAt: e.submittedAt, reviewNote: e.reviewNote }));
  },
});

