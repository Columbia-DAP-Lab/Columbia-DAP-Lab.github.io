import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";

/**
 * Live cursors on the public site: who else is on this page, where their
 * mouse is, and where they click (files/js/presence.js draws them).
 *
 * Unauthenticated on purpose: visitors are anonymous. A tab makes up a random
 * session id; its emoji and color come from that id, here, so nothing a visitor
 * types reaches anyone else. The cost of an open, public mutation is bounded
 * here rather than trusted to the page: positions are clamped, a tab's updates
 * are dropped when they come faster than MIN_INTERVAL_MS, and a page takes
 * at most MAX_PER_PAGE cursors. A cron (sweep) removes rows older than a minute.
 */

/** A tab writes at most this often; the page sends about every 120 ms while the mouse moves. */
const MIN_INTERVAL_MS = 60;
const MAX_PER_PAGE = 40;
/** A cursor not heard from in this long is gone; the page also hides it sooner. */
const STALE_MS = 60_000;

const EMOJI = ["🦊", "🐙", "🦉", "🐢", "🦄", "🐝", "🦋", "🐳", "🦔", "🐸", "🌵", "🍄", "🌻", "🚀", "🛸", "🎈", "🍩", "🧩", "🪐", "🐧"];
/** Readable on white, distinct from one another. */
const COLORS = ["#1d4f91", "#c2410c", "#047857", "#7c3aed", "#be185d", "#0e7490", "#a16207", "#4d7c0f", "#b91c1c", "#4338ca"];

/** A stable small number from the session id, for its emoji and color. */
const hash = (text: string) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
};
export const identityOf = (sessionId: string) => {
  const h = hash(sessionId);
  return { emoji: EMOJI[h % EMOJI.length], color: COLORS[(h >>> 8) % COLORS.length] };
};

const SESSION = /^[a-z0-9]{8,40}$/;
const validPage = (page: string) => page.startsWith("/") && page.length <= 200 && !page.startsWith("/admin");
const clampX = (x: number) => Math.max(-4000, Math.min(4000, Math.round(x)));
const clampY = (y: number) => Math.max(0, Math.min(200_000, Math.round(y)));

const point = { page: v.string(), sessionId: v.string(), x: v.number(), y: v.number() };

/**
 * This tab is here, and (with x and y) where its mouse is. The page calls it as
 * the mouse moves, and every few seconds while open as a heartbeat (without
 * a position when there is no mouse), so still and touch visitors count too.
 * Returns the server's clock, so the page can tell how fresh others are.
 */
export const move = mutation({
  args: {
    page: v.string(),
    sessionId: v.string(),
    x: v.optional(v.number()),
    y: v.optional(v.number()),
    /** Whether the button is held, sent with each move. */
    pressed: v.optional(v.boolean()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const now = Date.now();
    if (!SESSION.test(args.sessionId) || !validPage(args.page)) return now;
    const moved = args.x !== undefined && args.y !== undefined && Number.isFinite(args.x) && Number.isFinite(args.y);
    const existing = await ctx.db
      .query("cursors")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    const fields = {
      page: args.page,
      updatedAt: now,
      ...(moved ? { x: clampX(args.x!), y: clampY(args.y!), movedAt: now, pressed: args.pressed === true } : {}),
    };
    if (existing !== null) {
      // Pressing or letting go is never dropped, or a drag could look stuck.
      const pressChanged = moved && (existing.pressed === true) !== (args.pressed === true);
      if (existing.page === args.page && now - existing.updatedAt < MIN_INTERVAL_MS && !pressChanged) return now;
      // A heartbeat from a new page drops the position from the old one.
      const leftPage = existing.page !== args.page && !moved ? { x: undefined, y: undefined, movedAt: undefined, pressed: undefined } : {};
      await ctx.db.patch("cursors", existing._id, { ...leftPage, ...fields });
      return now;
    }
    const onPage = await ctx.db
      .query("cursors")
      .withIndex("by_page_and_updatedAt", (q) => q.eq("page", args.page).gt("updatedAt", now - STALE_MS))
      .take(MAX_PER_PAGE);
    if (onPage.length >= MAX_PER_PAGE) return now;
    await ctx.db.insert("cursors", { sessionId: args.sessionId, ...fields });
    return now;
  },
});

/** A click, for the others on the page to see pop. */
export const click = mutation({
  args: point,
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!SESSION.test(args.sessionId) || !validPage(args.page) || !Number.isFinite(args.x) || !Number.isFinite(args.y)) {
      return null;
    }
    const now = Date.now();
    // At most a few clicks a second per tab.
    const recent = await ctx.db
      .query("cursorClicks")
      .withIndex("by_page_and_at", (q) => q.eq("page", args.page).gt("at", now - 1000))
      .take(50);
    if (recent.filter((c) => c.sessionId === args.sessionId).length >= 4) return null;
    await ctx.db.insert("cursorClicks", { page: args.page, sessionId: args.sessionId, x: clampX(args.x), y: clampY(args.y), at: now });
    return null;
  },
});

/** The tab is closing or turning live mode off. */
export const leave = mutation({
  args: { sessionId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("cursors")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    if (existing !== null) await ctx.db.delete("cursors", existing._id);
    return null;
  },
});

/**
 * Everyone on a page in the last minute, and the clicks of the last few
 * seconds. The page drops its own cursor and hides ones gone quiet.
 */
export const here = query({
  args: { page: v.string() },
  returns: v.object({
    cursors: v.array(
      v.object({
        sessionId: v.string(),
        emoji: v.string(),
        color: v.string(),
        x: v.optional(v.number()),
        y: v.optional(v.number()),
        movedAt: v.optional(v.number()),
        pressed: v.optional(v.boolean()),
        updatedAt: v.number(),
      }),
    ),
    clicks: v.array(v.object({ id: v.string(), sessionId: v.string(), color: v.string(), x: v.number(), y: v.number(), at: v.number() })),
  }),
  handler: async (ctx, args) => {
    // Newest first, so a page past its cap shows its most active cursors.
    const cursors = await ctx.db
      .query("cursors")
      .withIndex("by_page_and_updatedAt", (q) => q.eq("page", args.page))
      .order("desc")
      .take(MAX_PER_PAGE);
    const clicks = await ctx.db
      .query("cursorClicks")
      .withIndex("by_page_and_at", (q) => q.eq("page", args.page))
      .order("desc")
      .take(20);
    return {
      cursors: cursors.map((c) => ({
        sessionId: c.sessionId,
        ...identityOf(c.sessionId),
        x: c.x,
        y: c.y,
        movedAt: c.movedAt,
        pressed: c.pressed,
        updatedAt: c.updatedAt,
      })),
      clicks: clicks.map((c) => ({ id: c._id, sessionId: c.sessionId, color: identityOf(c.sessionId).color, x: c.x, y: c.y, at: c.at })),
    };
  },
});

/** Remove cursors and clicks older than a minute (crons.ts, every minute). */
export const sweep = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - STALE_MS;
    const oldCursors = await ctx.db
      .query("cursors")
      .withIndex("by_updatedAt", (q) => q.lt("updatedAt", cutoff))
      .take(500);
    for (const row of oldCursors) await ctx.db.delete("cursors", row._id);
    const oldClicks = await ctx.db
      .query("cursorClicks")
      .withIndex("by_at", (q) => q.lt("at", cutoff))
      .take(1000);
    for (const row of oldClicks) await ctx.db.delete("cursorClicks", row._id);
    return null;
  },
});
