import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { applyStatus, GOVERNS } from "./admin";
import { grantedCapabilities } from "./authz";
import { applyProfileDecision } from "./profiles";
import { ADMIN_URL, escape, readableDate, slackApi } from "./slack";

/**
 * Review from Slack: when a submission is waiting, everyone who may review it
 * gets a DM with Approve, Reject and Open in admin. Whoever decides first, here
 * or on the admin page, settles it, and every reviewer's DM is updated to say so.
 *
 * Reviewers are found by email: an added role that may review that kind of
 * submission (admin:GOVERNS), matched to a Slack account with users.lookupByEmail.
 * A click is checked the same way, against the clicker's Slack email, so a
 * forwarded DM gives nobody new powers.
 *
 * Slack app setup, beyond what convex/slack.ts needs: the im:write scope, and
 * Interactivity on, with the request URL https://<deployment>.convex.site/slack/interactions.
 */

const tableValidator = v.union(
  v.literal("events"),
  v.literal("publications"),
  v.literal("people"),
  v.literal("news"),
  v.literal("profileEdits"),
);
type ReviewTable = "events" | "publications" | "people" | "news" | "profileEdits";

const NOUN: Record<ReviewTable, string> = {
  events: "event",
  publications: "paper",
  people: "person",
  news: "news item",
  profileEdits: "profile update",
};

/** The capability that reviews this kind of submission. */
const governing = (table: ReviewTable) => (table === "profileEdits" ? "people" : GOVERNS[table]);

const summaryValidator = v.object({
  status: v.string(),
  title: v.string(),
  lines: v.array(v.string()),
  submittedBy: v.string(),
  decidedBy: v.optional(v.string()),
  reviewNote: v.optional(v.string()),
  reviewers: v.array(v.string()),
});

const joinNames = (names: string[]) => names.filter(Boolean).join(", ");

/** What a reviewer needs to decide, in a few lines, and who those reviewers are. */
const summarize = async (ctx: QueryCtx, table: ReviewTable, rawId: string) => {
  const id = ctx.db.normalizeId(table, rawId);
  if (id === null) return null;
  let title: string;
  let lines: string[] = [];
  let status: string;
  let submittedBy: string;
  let decidedBy: string | undefined;
  let reviewNote: string | undefined;

  if (table === "events") {
    const row = await ctx.db.get("events", id as Id<"events">);
    if (row === null) return null;
    const speakers = await ctx.db
      .query("eventSpeakers")
      .withIndex("by_eventId_and_position", (q) => q.eq("eventId", row._id))
      .take(10);
    title = row.title;
    lines = [
      [readableDate(row.startDate), row.timeLabel, row.location, row.series].filter(Boolean).join(" · "),
      joinNames(speakers.map((s) => (s.affiliation ? `${s.name} (${s.affiliation})` : s.name))),
    ];
    ({ status, submittedBy, publishedBy: decidedBy, reviewNote } = row);
  } else if (table === "publications") {
    const row = await ctx.db.get("publications", id as Id<"publications">);
    if (row === null) return null;
    const links = await ctx.db
      .query("publicationAuthors")
      .withIndex("by_publicationId_and_position", (q) => q.eq("publicationId", row._id))
      .take(12);
    const names = [];
    for (const link of links) names.push((await ctx.db.get("authors", link.authorId))?.name ?? "");
    title = row.title;
    lines = [joinNames(names) + (row.authorCount > links.length ? ", …" : ""), `${row.venue}, ${row.pubDate}`];
    ({ status, submittedBy, publishedBy: decidedBy, reviewNote } = row);
  } else if (table === "people") {
    const row = await ctx.db.get("people", id as Id<"people">);
    if (row === null) return null;
    title = row.name;
    lines = [[row.title, row.category, row.affiliation].filter(Boolean).join(" · "), row.homepage ?? ""];
    if (row.submittedBy === row.email) lines.push("Added themselves to the lab.");
    ({ status, submittedBy, publishedBy: decidedBy, reviewNote } = row);
  } else if (table === "news") {
    const row = await ctx.db.get("news", id as Id<"news">);
    if (row === null) return null;
    title = row.title;
    lines = [row.date ? readableDate(row.date) : "", row.content.length > 280 ? `${row.content.slice(0, 280)}…` : row.content];
    ({ status, submittedBy, publishedBy: decidedBy, reviewNote } = row);
  } else {
    const row = await ctx.db.get("profileEdits", id as Id<"profileEdits">);
    if (row === null) return null;
    const person = await ctx.db.get("people", row.personId);
    title = person?.name ?? "A profile";
    lines = [
      Object.entries(row.changes)
        .map(([key, value]) => (key === "image" ? "new photo" : key === "fields" ? "badges" : `${key}: ${value ?? "(cleared)"}`))
        .join("\n"),
    ];
    status = row.status;
    submittedBy = row.submittedBy;
    decidedBy = row.reviewedBy;
    reviewNote = row.reviewNote;
  }

  const roles = await ctx.db.query("roles").take(500);
  const need = governing(table);
  const reviewers = [];
  // Submitters who can review are included: an admin's own submission waits too.
  for (const role of roles) {
    const caps = await grantedCapabilities(ctx, role.email);
    if (caps.includes("admin") || caps.includes(need)) reviewers.push(role.email);
  }
  return { status, title, lines: lines.filter(Boolean), submittedBy, decidedBy, reviewNote, reviewers };
};

export const describe = internalQuery({
  args: { table: tableValidator, id: v.string() },
  returns: v.union(v.null(), summaryValidator),
  handler: async (ctx, args) => await summarize(ctx, args.table, args.id),
});

type Summary = {
  status: string;
  title: string;
  lines: string[];
  submittedBy: string;
  decidedBy?: string;
  reviewNote?: string;
  reviewers: string[];
};

/** The DM: what is waiting and the buttons, or, once decided, what happened. */
const blocks = (table: ReviewTable, id: string, s: Summary) => {
  const heading = `*New ${NOUN[table]} to review*\n*${escape(s.title)}*`;
  const details = [...s.lines.map(escape), `_Submitted by ${escape(s.submittedBy)}_`].join("\n");
  if (s.status !== "pending") {
    const verb = s.status === "published" ? ":white_check_mark: Published" : s.status === "rejected" ? ":x: Rejected" : `Marked ${s.status}`;
    const by = s.decidedBy ? ` by ${escape(s.decidedBy)}` : "";
    const note = s.reviewNote ? `\n> ${escape(s.reviewNote)}` : "";
    return [{ type: "section", text: { type: "mrkdwn", text: `${verb}${by}: *${escape(s.title)}*${note}` } }];
  }
  const value = JSON.stringify({ table, id });
  return [
    { type: "section", text: { type: "mrkdwn", text: `${heading}\n${details}` } },
    {
      type: "actions",
      elements: [
        { type: "button", style: "primary", action_id: "review_approve", text: { type: "plain_text", text: "Approve" }, value },
        { type: "button", style: "danger", action_id: "review_reject", text: { type: "plain_text", text: "Reject…" }, value },
        { type: "button", action_id: "review_open", text: { type: "plain_text", text: "Open in admin" }, url: ADMIN_URL },
      ],
    },
  ];
};

const fallbackText = (table: ReviewTable, s: Summary) =>
  s.status === "pending" ? `New ${NOUN[table]} to review: ${s.title}` : `${s.title}: ${s.status}`;

export const saveMessage = internalMutation({
  args: { table: v.string(), docId: v.string(), channel: v.string(), ts: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("slackReviewMessages", args);
    return null;
  },
});

export const messagesFor = internalQuery({
  args: { table: v.string(), docId: v.string() },
  returns: v.array(v.object({ _id: v.id("slackReviewMessages"), channel: v.string(), ts: v.string() })),
  handler: async (ctx, args) =>
    (
      await ctx.db
        .query("slackReviewMessages")
        .withIndex("by_table_and_docId", (q) => q.eq("table", args.table).eq("docId", args.docId))
        .take(50)
    ).map(({ _id, channel, ts }) => ({ _id, channel, ts })),
});

export const forgetMessages = internalMutation({
  args: { ids: v.array(v.id("slackReviewMessages")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const id of args.ids) await ctx.db.delete("slackReviewMessages", id);
    return null;
  },
});

/** DM each reviewer about a new submission. Quietly does nothing without a bot token. */
export const announce = internalAction({
  args: { table: tableValidator, id: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const token = env.SLACK_BOT_TOKEN?.trim();
    if (!token) return null;
    const summary: Summary | null = await ctx.runQuery(internal.slackReview.describe, args);
    if (summary === null || summary.status !== "pending") return null;

    for (const email of summary.reviewers) {
      try {
        const found = (await slackApi(token, "users.lookupByEmail", { email })) as { user?: { id?: string } };
        const user = found.user?.id;
        if (!user) continue;
        const dm = (await slackApi(token, "conversations.open", { users: user })) as { channel?: { id?: string } };
        const channel = dm.channel?.id;
        if (!channel) continue;
        const sent = await slackApi(token, "chat.postMessage", {
          channel,
          text: fallbackText(args.table, summary),
          blocks: JSON.stringify(blocks(args.table, args.id, summary)),
          unfurl_links: "false",
        });
        await ctx.runMutation(internal.slackReview.saveMessage, {
          table: args.table,
          docId: args.id,
          channel,
          ts: String(sent.ts),
        });
      } catch (error) {
        // users_not_found means that reviewer is not in the Slack workspace.
        const reason = error instanceof Error ? error.message : String(error);
        if (!reason.includes("users_not_found")) console.warn("Could not DM a reviewer", { email, reason });
      }
    }
    return null;
  },
});

/** Redraw every reviewer's DM about a submission; once it is decided, stop tracking them. */
export const refresh = internalAction({
  args: { table: v.string(), id: v.string(), decidedBy: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const token = env.SLACK_BOT_TOKEN?.trim();
    if (!token) return null;
    const messages: { _id: Id<"slackReviewMessages">; channel: string; ts: string }[] = await ctx.runQuery(
      internal.slackReview.messagesFor,
      { table: args.table, docId: args.id },
    );
    if (messages.length === 0) return null;
    const table = args.table as ReviewTable;
    const summary: Summary | null = await ctx.runQuery(internal.slackReview.describe, { table, id: args.id });
    const shown: Summary = summary
      ? { ...summary, decidedBy: args.decidedBy ?? summary.decidedBy }
      : { status: "removed", title: "A submission", lines: [], submittedBy: "", reviewers: [] };
    for (const m of messages) {
      try {
        await slackApi(token, "chat.update", {
          channel: m.channel,
          ts: m.ts,
          text: fallbackText(table, shown),
          blocks: JSON.stringify(blocks(table, args.id, shown)),
        });
      } catch (error) {
        console.warn("Could not update a review DM", error instanceof Error ? error.message : error);
      }
    }
    if (shown.status !== "pending") {
      await ctx.runMutation(internal.slackReview.forgetMessages, { ids: messages.map((m) => m._id) });
    }
    return null;
  },
});

/**
 * Apply a reviewer's decision from Slack, checked against their Slack email.
 * Returns what to tell them when it cannot be applied.
 */
export const applyDecision = internalMutation({
  args: {
    email: v.string(),
    table: tableValidator,
    id: v.string(),
    decision: v.union(v.literal("published"), v.literal("rejected")),
    reviewNote: v.optional(v.string()),
  },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const caps = await grantedCapabilities(ctx, email);
    if (!caps.includes("admin") && !caps.includes(governing(args.table))) {
      return `${email} cannot review submissions. Ask a lab admin.`;
    }
    const summary = await summarize(ctx, args.table, args.id);
    if (summary === null) return "That submission no longer exists.";
    if (summary.status !== "pending") {
      return `That ${NOUN[args.table]} was already ${summary.status}${summary.decidedBy ? ` by ${summary.decidedBy}` : ""}.`;
    }
    try {
      if (args.table === "profileEdits") {
        const id = ctx.db.normalizeId("profileEdits", args.id);
        if (id === null) return "That submission no longer exists.";
        await applyProfileDecision(ctx, email, id, args.decision, args.reviewNote);
      } else {
        await applyStatus(ctx, email, args.table, args.id, args.decision, args.reviewNote);
      }
    } catch (error) {
      if (error instanceof ConvexError) return String(error.data);
      throw error;
    }
    return null;
  },
});

/** A click (or a rejection note) from Slack, done after the HTTP reply. */
export const decide = internalAction({
  args: {
    slackUser: v.string(),
    table: tableValidator,
    id: v.string(),
    decision: v.union(v.literal("published"), v.literal("rejected")),
    reviewNote: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const token = env.SLACK_BOT_TOKEN?.trim();
    if (!token) return null;
    const tell = async (text: string) => {
      const dm = (await slackApi(token, "conversations.open", { users: args.slackUser })) as { channel?: { id?: string } };
      if (dm.channel?.id) await slackApi(token, "chat.postMessage", { channel: dm.channel.id, text });
    };
    const info = (await slackApi(token, "users.info", { user: args.slackUser })) as { user?: { profile?: { email?: string } } };
    const email = info.user?.profile?.email;
    if (!email) return (await tell("I can't see an email on your Slack profile, so I can't check that you may review.")) ?? null;
    const problem: string | null = await ctx.runMutation(internal.slackReview.applyDecision, {
      email,
      table: args.table,
      id: args.id,
      decision: args.decision,
      reviewNote: args.reviewNote,
    });
    if (problem !== null) await tell(problem);
    return null;
  },
});

/** The Reject… dialog, opened from the button's trigger. */
export const rejectDialog = (triggerId: string, value: string) => ({
  trigger_id: triggerId,
  view: JSON.stringify({
    type: "modal",
    callback_id: "review_reject",
    private_metadata: value,
    title: { type: "plain_text", text: "Reject" },
    submit: { type: "plain_text", text: "Reject" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "note",
        optional: true,
        label: { type: "plain_text", text: "Note to the submitter" },
        element: { type: "plain_text_input", action_id: "note", multiline: true },
      },
    ],
  }),
});
