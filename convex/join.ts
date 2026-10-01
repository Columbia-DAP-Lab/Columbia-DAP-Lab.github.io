import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { checkPerson, personSubmission, record } from "./admin";
import { accessFor, currentEmail } from "./authz";

/**
 * Adding yourself to the lab.
 *
 * A Columbia account that is not on the list (see accessFor in convex/authz.ts)
 * may propose its own People-page profile. It lands as pending, with the
 * account's email on it, in the same People queue an admin reviews; once it is
 * published, accessFor matches the account to it by that email and the person
 * signs in as a lab member from then on.
 *
 * Faculty and alumni are added by an admin, so those groups are not offered.
 */

// The form's fields, less what is not the person's to set: their email is the
// signed-in account's, and badges are an admin's call.
const { email: _email, category: _category, fields: _fields, ...rest } = personSubmission;
const selfSubmission = {
  ...rest,
  category: v.union(v.literal("phd"), v.literal("student"), v.literal("postdoc"), v.literal("staff")),
};

/** The account's own most recent request, so the page can say where it stands. */
export const myRequest = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      name: v.string(),
      status: v.union(v.literal("pending"), v.literal("published"), v.literal("rejected"), v.literal("archived")),
      submittedAt: v.optional(v.number()),
      reviewNote: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const email = await currentEmail(ctx);
    if (email === null) return null;
    const rows = await ctx.db
      .query("people")
      .withIndex("by_email", (q) => q.eq("email", email))
      .take(20);
    const mine = rows
      .filter((p) => p.submittedBy === email)
      .sort((a, b) => (b.submittedAt ?? 0) - (a.submittedAt ?? 0))[0];
    if (mine === undefined) return null;
    return { name: mine.name, status: mine.status, submittedAt: mine.submittedAt, reviewNote: mine.reviewNote };
  },
});

export const submit = mutation({
  args: selfSubmission,
  returns: v.id("people"),
  handler: async (ctx, args) => {
    const email = await currentEmail(ctx);
    if (email === null) throw new ConvexError("Sign in with your Columbia Google account (uni@columbia.edu).");
    const access = await accessFor(ctx);
    if (access !== null && access.capabilities.length > 0) {
      throw new ConvexError("You are already on the DAPLab list. Reload the page to sign in.");
    }

    // One request at a time, and none for an account that already has a profile.
    const existing = await ctx.db
      .query("people")
      .withIndex("by_email", (q) => q.eq("email", email))
      .take(20);
    if (existing.some((p) => p.status === "pending")) {
      throw new ConvexError("Your profile is already waiting for review.");
    }
    if (existing.some((p) => p.status === "published")) {
      throw new ConvexError("You already have a profile. Ask a lab admin if you cannot sign in.");
    }

    const { name, slug, advisorIds, externalAdvisors } = await checkPerson(ctx, { ...args, email, fields: [] });

    const personId: Id<"people"> = await ctx.db.insert("people", {
      name,
      slug,
      category: args.category,
      title: args.title,
      affiliation: args.affiliation,
      homepage: args.homepage,
      email,
      bio: args.bio,
      fields: [],
      advisorIds,
      externalAdvisors,
      image: args.image === undefined ? undefined : { kind: "storage", storageId: args.image },
      hidden: false,
      status: "pending",
      submittedBy: email,
      submittedAt: Date.now(),
    });
    await record(ctx, { table: "people", documentId: personId, action: "create", actor: email, affectsSite: false });
    return personId;
  },
});
