import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { checkImage, record } from "./admin";
import { peopleByMatchKey, upsertAuthor } from "./authors";
import { requireCapability } from "./authz";

/**
 * Projects and software on the Projects page, managed from the admin page.
 *
 * Admins only, like adding people. A new project is a draft (status "pending")
 * that the site does not show until it is published; editing a published project
 * changes the live page at the next build. The slug is the project's URL and the
 * folder its repo images live in, so it is fixed once the project is published.
 */

/** Link kinds the project templates know; `paper` is stored but not shown as a button. */
const LINK_KINDS = ["github", "website", "paper", "blog", "demo", "pypi", "leaderboard"] as const;
const linkKind = v.union(...LINK_KINDS.map((k) => v.literal(k)));

const kind = v.union(v.literal("project"), v.literal("benchmark"), v.literal("software"));

const fields = {
  slug: v.string(),
  title: v.string(),
  subtitle: v.string(),
  date: v.string(),
  kinds: v.array(kind),
  tags: v.array(v.string()),
  body: v.string(),
  links: v.array(v.object({ kind: linkKind, url: v.string() })),
  /** In order; a trailing * marks equal contribution, as on papers. */
  authors: v.array(v.object({ name: v.string(), url: v.optional(v.string()) })),
  publications: v.array(
    v.object({ title: v.string(), venue: v.string(), url: v.optional(v.string()), year: v.optional(v.number()) }),
  ),
};

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Where the card image comes from, for the form's preview. */
const previewUrl = async (ctx: QueryCtx, project: Doc<"projects">): Promise<string | null> => {
  if (project.image?.kind === "storage") return await ctx.storage.getUrl(project.image.storageId);
  if (project.image?.kind === "path") return project.image.path;
  if (project.avatarUrl) return project.avatarUrl;
  if (project.avatar) return `/_projects/${project.slug}/${project.avatar}`;
  return null;
};

/** Every project, drafts included, for the Projects tab's list. */
export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("projects"),
      slug: v.string(),
      title: v.string(),
      date: v.string(),
      status: v.string(),
      kinds: v.array(kind),
    }),
  ),
  handler: async (ctx) => {
    await requireCapability(ctx, "admin");
    const rows = await ctx.db.query("projects").take(500);
    return rows
      .map((p) => ({ _id: p._id, slug: p.slug, title: p.title, date: p.date, status: p.status, kinds: p.kinds }))
      .sort((a, b) => b.date.localeCompare(a.date));
  },
});

/** One project with its authors and papers, to fill the edit form. */
export const get = query({
  args: { id: v.id("projects") },
  returns: v.union(
    v.null(),
    v.object({
      ...fields,
      _id: v.id("projects"),
      status: v.string(),
      imageUrl: v.union(v.string(), v.null()),
      hasUploadedImage: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireCapability(ctx, "admin");
    const project = await ctx.db.get("projects", args.id);
    if (project === null) return null;
    const authorRows = await ctx.db
      .query("projectAuthors")
      .withIndex("by_projectId_and_position", (q) => q.eq("projectId", project._id))
      .take(100);
    const authors = [];
    for (const row of authorRows) {
      const author = await ctx.db.get("authors", row.authorId);
      if (author === null) continue;
      authors.push({ name: row.equalContribution ? `${author.name}*` : author.name, url: row.url });
    }
    const papers = await ctx.db
      .query("projectPublications")
      .withIndex("by_projectId_and_position", (q) => q.eq("projectId", project._id))
      .take(100);
    return {
      _id: project._id,
      status: project.status,
      slug: project.slug,
      title: project.title,
      subtitle: project.subtitle,
      date: project.date,
      kinds: project.kinds,
      tags: project.tags,
      body: project.body,
      links: project.links.filter((l): l is { kind: (typeof LINK_KINDS)[number]; url: string } =>
        (LINK_KINDS as readonly string[]).includes(l.kind),
      ),
      authors,
      publications: papers.map((p) => ({ title: p.title, venue: p.venue, url: p.url, year: p.year })),
      imageUrl: await previewUrl(ctx, project),
      hasUploadedImage: project.image?.kind === "storage",
    };
  },
});

const clean = (s: string | undefined) => s?.trim() || undefined;

/** Replace a project's author and paper rows with the form's, in order. */
const writeRows = async (
  ctx: MutationCtx,
  projectId: Id<"projects">,
  authors: { name: string; url?: string }[],
  publications: { title: string; venue: string; url?: string; year?: number }[],
) => {
  for (const row of await ctx.db
    .query("projectAuthors")
    .withIndex("by_projectId_and_position", (q) => q.eq("projectId", projectId))
    .take(200)) {
    await ctx.db.delete("projectAuthors", row._id);
  }
  for (const row of await ctx.db
    .query("projectPublications")
    .withIndex("by_projectId_and_position", (q) => q.eq("projectId", projectId))
    .take(200)) {
    await ctx.db.delete("projectPublications", row._id);
  }

  const people = await peopleByMatchKey(ctx);
  let position = 0;
  for (const author of authors) {
    const printed = author.name.trim();
    if (!printed) continue;
    const equalContribution = printed.endsWith("*");
    // Projects do not count toward an author's publication count.
    const authorId = await upsertAuthor(ctx, printed.replace(/\*+\s*$/, "").trim(), people, { countAuthorship: false });
    await ctx.db.insert("projectAuthors", {
      projectId,
      authorId,
      position: position++,
      url: clean(author.url),
      equalContribution: equalContribution ? true : undefined,
    });
  }
  position = 0;
  for (const paper of publications) {
    if (!paper.title.trim()) continue;
    await ctx.db.insert("projectPublications", {
      projectId,
      position: position++,
      title: paper.title.trim(),
      venue: paper.venue.trim(),
      url: clean(paper.url),
      year: paper.year,
    });
  }
};

/**
 * Create a project (as a draft) or update one. Returns its id.
 *
 * `image` sets a new uploaded card image; `removeImage` clears an uploaded one,
 * which brings back the repo image if the project had one.
 */
export const save = mutation({
  args: {
    ...fields,
    id: v.optional(v.id("projects")),
    image: v.optional(v.id("_storage")),
    removeImage: v.optional(v.boolean()),
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "admin");
    const slug = args.slug.trim().toLowerCase();
    const title = args.title.trim();
    if (!title) throw new ConvexError("A project needs a title.");
    if (!SLUG.test(slug)) {
      throw new ConvexError("The short name must be lowercase letters, numbers and single hyphens, e.g. my-project.");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new ConvexError("Date must be YYYY-MM-DD.");
    if (args.kinds.length === 0) throw new ConvexError("Pick at least one of project, benchmark or software.");
    for (const link of args.links) {
      if (!/^https?:\/\//.test(link.url.trim())) throw new ConvexError(`The ${link.kind} link must start with https://`);
    }
    if (args.image !== undefined) await checkImage(ctx, args.image);

    const clash = await ctx.db
      .query("projects")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (clash !== null && clash._id !== args.id) {
      throw new ConvexError(`Another project already uses the short name "${slug}".`);
    }

    const existing = args.id === undefined ? null : await ctx.db.get("projects", args.id);
    if (args.id !== undefined && existing === null) throw new ConvexError("That project no longer exists.");
    if (existing !== null && existing.status === "published" && existing.slug !== slug) {
      // The slug is the live URL and the folder its repo images are in.
      throw new ConvexError("A published project's short name cannot change; it is the page's address.");
    }

    const content = {
      slug,
      title,
      subtitle: args.subtitle.trim(),
      date: args.date,
      kinds: [...new Set(args.kinds)],
      tags: args.tags.map((t) => t.trim()).filter(Boolean),
      body: args.body,
      links: args.links.map((l) => ({ kind: l.kind, url: l.url.trim() })),
    };
    const image =
      args.image !== undefined
        ? { image: { kind: "storage" as const, storageId: args.image } }
        : args.removeImage
          ? { image: undefined }
          : {};

    let projectId: Id<"projects">;
    if (existing === null) {
      projectId = await ctx.db.insert("projects", {
        ...content,
        ...image,
        status: "pending",
        submittedBy: actor,
        submittedAt: Date.now(),
      });
    } else {
      projectId = existing._id;
      await ctx.db.patch("projects", projectId, { ...content, ...image });
    }
    await writeRows(ctx, projectId, args.authors, args.publications);

    await record(ctx, {
      table: "projects",
      documentId: projectId,
      action: existing === null ? "create" : "update",
      actor,
      // A draft is not on the site; an edit to a published project is.
      affectsSite: existing?.status === "published",
    });
    return projectId;
  },
});

/** Publish a draft, or take a project off the site (back to a draft). */
export const setStatus = mutation({
  args: { id: v.id("projects"), published: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireCapability(ctx, "admin");
    const project = await ctx.db.get("projects", args.id);
    if (project === null) throw new ConvexError("That project no longer exists.");
    const status = args.published ? "published" : "pending";
    if (project.status === status) return null;
    await ctx.db.patch("projects", project._id, {
      status,
      ...(args.published ? { publishedBy: actor, publishedAt: Date.now() } : {}),
    });
    await record(ctx, {
      table: "projects",
      documentId: project._id,
      action: args.published ? "publish" : "update",
      actor,
      affectsSite: true,
    });
    return null;
  },
});
