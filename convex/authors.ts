import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Author identity, shared by the migration and the admin forms.
 *
 * Extracted so both paths resolve a printed name the same way — two
 * implementations of "is this the same person" would eventually disagree and split
 * an author in two.
 */

/** A printed name reduced for matching: accents dropped, punctuation collapsed. */
export const matchKey = (name: string): string =>
  name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // "Sellán" matches "Sellan"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** How many non-ASCII characters a spelling carries; more means better accented. */
const diacritics = (name: string) => name.replace(/[\x00-\x7F]/g, "").length;

/** Every person, keyed for matching, so authorship can link to a profile. */
export const peopleByMatchKey = async (
  ctx: QueryCtx | MutationCtx,
): Promise<Map<string, Id<"people">>> => {
  const rows = await ctx.db.query("people").take(2000);
  return new Map(rows.map((p) => [matchKey(p.name), p._id]));
};

/**
 * Find or create the author row for a printed name.
 *
 * The lookup goes through the index rather than a map built once, so an author
 * seen in an earlier batch is found rather than duplicated.
 *
 * Where two papers spell the same person differently, the accented spelling wins:
 * the data has both "Franjo Ivancic" and "Franjo Ivančić", and first-seen-wins
 * would pick by publication order rather than by which is right.
 *
 * `countAuthorship` is false for a pending submission: `publicationCount` counts
 * published papers, so it moves when the paper is published, not when it is
 * proposed.
 */
export const upsertAuthor = async (
  ctx: MutationCtx,
  name: string,
  people: Map<string, Id<"people">>,
  { countAuthorship = true }: { countAuthorship?: boolean } = {},
): Promise<Id<"authors">> => {
  const printed = name.trim();
  const key = matchKey(printed);
  const existing = await ctx.db
    .query("authors")
    .withIndex("by_matchKey", (q) => q.eq("matchKey", key))
    .unique();

  if (existing) {
    await ctx.db.patch("authors", existing._id, {
      publicationCount: existing.publicationCount + (countAuthorship ? 1 : 0),
      // A profile added after this author was first seen still gets linked.
      personId: existing.personId ?? people.get(key),
      name: diacritics(printed) > diacritics(existing.name) ? printed : existing.name,
    });
    return existing._id;
  }

  return await ctx.db.insert("authors", {
    name: printed,
    matchKey: key,
    personId: people.get(key),
    publicationCount: countAuthorship ? 1 : 0,
  });
};

/** Move every author's paper count by one, as a publication is published or pulled. */
export const adjustAuthorCounts = async (
  ctx: MutationCtx,
  publicationId: Id<"publications">,
  delta: 1 | -1,
): Promise<void> => {
  const rows = await ctx.db
    .query("publicationAuthors")
    .withIndex("by_publicationId_and_position", (q) => q.eq("publicationId", publicationId))
    .take(500);
  for (const row of rows) {
    const author = await ctx.db.get("authors", row.authorId);
    if (author === null) continue;
    await ctx.db.patch("authors", author._id, {
      publicationCount: Math.max(0, author.publicationCount + delta),
    });
  }
};
