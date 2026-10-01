import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction, internalMutation } from "./_generated/server";
import { eventSubmission, insertEvent, insertNews, insertPublication, newsSubmission, publicationSubmission } from "./admin";
import { MAX_TEXT, requestEventsAndPublications, toDrafts, todayInNewYork } from "./extract";
import { generateStructured, isConfigured } from "./llm";

/**
 * The Slack bot: mention @DAPLab in a message about a talk or a paper, and it
 * lands in the review queue.
 *
 * Slack POSTs each mention to /slack/events (convex/http.ts), which checks the
 * signature and hands the message to `handleMention` here. That looks up the
 * sender's email on their Slack profile, holds them to the same list as the admin
 * page (extractSupport:beginForSlack), reads the message with the same model and
 * prompts as paste-to-fill, and submits what it finds through the same inserts
 * as the forms, so everything is pending until an admin publishes it. Mentioning
 * the bot in a thread reply reads the whole thread, so "@DAPLab make this a news
 * item" under a discussion works; the mention itself is passed as the request,
 * which picks what to add (events, papers or news).
 *
 * Slack app setup (api.slack.com/apps):
 *   - Bot token scopes: app_mentions:read, chat:write, users:read,
 *     users:read.email, channels:history, groups:history (the last two only to
 *     read the thread a mention is in).
 *   - Event Subscriptions: request URL https://<deployment>.convex.site/slack/events,
 *     bot event app_mention.
 *   - Then SLACK_SIGNING_SECRET and SLACK_BOT_TOKEN (convex/convex.config.ts).
 */

const ADMIN_URL = "https://daplab.cs.columbia.edu/admin/";

/** Slack signs requests this long ago at most; older ones may be replays. */
const MAX_AGE_SECONDS = 5 * 60;

// ------------------------------------------------------------- receiving

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Compare without stopping at the first difference, so timing says nothing about the secret. */
const sameString = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/**
 * Slack's request signature: v0=HMAC-SHA256(secret, "v0:<timestamp>:<raw body>").
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
export const verifySlackRequest = async (headers: Headers, body: string, secret: string) => {
  const timestamp = headers.get("x-slack-request-timestamp");
  const signature = headers.get("x-slack-signature");
  // Logged without the secret or signature, so a refused request says why.
  if (!timestamp || !signature) {
    console.warn("Slack request refused: no signature headers");
    return false;
  }
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > MAX_AGE_SECONDS) {
    console.warn("Slack request refused: timestamp too old", { timestamp });
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`v0:${timestamp}:${body}`));
  const ok = sameString(`v0=${hex(mac)}`, signature);
  if (!ok) {
    console.warn("Slack request refused: signature mismatch; is SLACK_SIGNING_SECRET this app's Signing Secret?", {
      secretLength: secret.length,
    });
  }
  return ok;
};

const mention = {
  channel: v.string(),
  ts: v.string(),
  threadTs: v.optional(v.string()),
  user: v.string(),
  text: v.string(),
  /** The bot's own user id, to strip "@DAPLab" from the text. */
  botUserId: v.optional(v.string()),
};

/**
 * Take a mention once. Slack wants an answer within 3 seconds and the model takes
 * longer, so the work is scheduled; a retry of an event already taken is dropped.
 */
export const receive = internalMutation({
  args: { eventId: v.string(), ...mention },
  returns: v.null(),
  handler: async (ctx, { eventId, ...message }) => {
    const seen = await ctx.db
      .query("slackEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .unique();
    if (seen !== null) return null;
    await ctx.db.insert("slackEvents", { eventId, receivedAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.slack.handleMention, message);
    return null;
  },
});

// ------------------------------------------------------------- Slack Web API

type SlackResponse = { ok: boolean; error?: string; [key: string]: unknown };

/** One Web API call. Form-encoded, which every method accepts (read methods refuse JSON). */
const slackApi = async (token: string, method: string, params: Record<string, string | undefined>) => {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) body.set(key, value);
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await response.json()) as SlackResponse;
  if (!json.ok) throw new Error(`Slack ${method} failed: ${json.error ?? response.status}`);
  return json;
};

type SlackUser = { real_name?: string; profile?: { email?: string; real_name?: string; display_name?: string } };

/** Slack's markup for what we send: only &, < and > are special. */
const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Slack's message markup as plain text for the model: links as "label (url)",
 * people and channels by name, the bot's own mention dropped.
 */
const toPlainText = async (text: string, botUserId: string | undefined, nameOf: (id: string) => Promise<string>) => {
  const ids = [...new Set([...text.matchAll(/<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/g)].map((m) => m[1]))].filter(
    (id) => id !== botUserId,
  );
  const names = new Map<string, string>();
  for (const id of ids.slice(0, 20)) names.set(id, await nameOf(id));

  return text
    .replace(/<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/g, (_, id: string) => (id === botUserId ? "" : `@${names.get(id) ?? "someone"}`))
    .replace(/<#[A-Z0-9]+\|([^>]*)>/g, "#$1")
    .replace(/<![^>]*>/g, "")
    .replace(/<(mailto:)?([^|>]+)\|([^>]+)>/g, (_, mailto: string | undefined, url: string, label: string) =>
      mailto || label === url ? label : `${label} (${url})`,
    )
    .replace(/<([^>]+)>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
};

// ------------------------------------------------------------- submitting

/** Called by handleMention only, for a sender beginForSlack has checked. */
export const submitEvent = internalMutation({
  args: { email: v.string(), event: v.object(eventSubmission) },
  returns: v.id("events"),
  handler: async (ctx, { email, event }) => await insertEvent(ctx, email, event),
});

export const submitPublication = internalMutation({
  args: { email: v.string(), publication: v.object(publicationSubmission) },
  returns: v.id("publications"),
  handler: async (ctx, { email, publication }) => await insertPublication(ctx, email, publication),
});

export const submitNews = internalMutation({
  args: { email: v.string(), news: v.object(newsSubmission) },
  returns: v.id("news"),
  handler: async (ctx, { email, news }) => await insertNews(ctx, email, news),
});

/** Most of a thread worth reading; longer ones are cut from the start. */
const MAX_THREAD_MESSAGES = 50;

type Draft = Record<string, unknown>;
type Vocabulary = { slug: string; label: string; description?: string }[];
/** extractSupport:beginForSlack's answer, spelled out: handleMention refers to itself through `internal`. */
type Gate =
  | { ok: true; vocab: { series: Vocabulary; topics: Vocabulary; fields: Vocabulary } }
  | { ok: false; reason: string };
const str = (value: unknown) => (typeof value === "string" ? value : undefined);
const strings = (value: unknown) => (Array.isArray(value) ? value.filter((s): s is string => typeof s === "string") : []);

/** "Fri, Oct 3, 2026" from "2026-10-03". */
const readableDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(
    new Date(`${iso}T00:00:00Z`),
  );

/** A draft as submitEvent's arguments, or what is missing. */
const asEvent = (draft: Draft) => {
  const title = str(draft.title);
  const series = str(draft.series);
  const startDate = str(draft.startDate);
  const missing = [!title && "a title", !startDate && "a date", !series && "a series"].filter(Boolean);
  if (!title || !series || !startDate) return { ok: false as const, missing: missing.join(" and ") };
  const speakers = (Array.isArray(draft.speakers) ? (draft.speakers as Draft[]) : [])
    .filter((s) => str(s.name))
    .map((s) => ({
      name: str(s.name)!,
      affiliation: str(s.affiliation),
      role: str(s.role),
      url: str(s.url),
      bio: str(s.bio),
    }));
  return {
    ok: true as const,
    event: {
      title,
      series,
      startDate,
      endDate: str(draft.endDate),
      timeLabel: str(draft.timeLabel),
      location: str(draft.location),
      link: str(draft.link),
      description: str(draft.description),
      speakers,
    },
  };
};

/** A draft as submitNews's arguments, or what is missing. */
const asNews = (draft: Draft) => {
  const title = str(draft.title);
  const content = str(draft.content);
  if (!title || !content) return { ok: false as const, missing: [!title && "a title", !content && "a summary"].filter(Boolean).join(" and ") };
  // Featured, so it can reach the homepage; the reviewer can change that.
  return { ok: true as const, news: { title, content, details: str(draft.details), date: str(draft.date), featured: true } };
};

/** A draft as submitPublication's arguments, or what is missing. */
const asPublication = (draft: Draft) => {
  const title = str(draft.title);
  const venue = str(draft.venue);
  const pubDate = str(draft.pubDate);
  const authors = strings(draft.authors);
  const missing = [!title && "a title", authors.length === 0 && "authors", !venue && "a venue", !pubDate && "a date"].filter(
    Boolean,
  );
  if (!title || !venue || !pubDate || authors.length === 0) return { ok: false as const, missing: missing.join(", ") };
  return {
    ok: true as const,
    publication: {
      title,
      venue,
      pubDate,
      authors,
      topics: strings(draft.topics),
      url: str(draft.url),
      slidesUrl: str(draft.slidesUrl),
      codeUrl: str(draft.codeUrl),
      comment: str(draft.comment),
    },
  };
};

const check = (warnings: string[]) => (warnings.length > 0 ? `\n      _Check: ${escape(warnings.join("; "))}_` : "");

// ------------------------------------------------------------- the bot

export const handleMention = internalAction({
  args: mention,
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const token = env.SLACK_BOT_TOKEN?.trim();
    if (!token) {
      console.error("A Slack mention arrived, but SLACK_BOT_TOKEN is not set");
      return null;
    }
    const call = (method: string, params: Record<string, string | undefined>) => slackApi(token, method, params);

    // Reply in the thread: the mention's own, or a new one under the mention.
    const thread = args.threadTs ?? args.ts;
    const placeholder = await call("chat.postMessage", {
      channel: args.channel,
      thread_ts: thread,
      text: "Reading this…",
    });
    const say = async (text: string) => {
      await call("chat.update", { channel: args.channel, ts: String(placeholder.ts), text });
      return null;
    };

    try {
      const { user } = (await call("users.info", { user: args.user })) as SlackResponse & { user: SlackUser };
      const email = user.profile?.email;
      if (!email) {
        return await say("I can't see an email on your Slack profile. Add your @columbia.edu address to it and try again.");
      }

      const gate: Gate = await ctx.runMutation(internal.extractSupport.beginForSlack, {
        email,
        name: user.real_name ?? user.profile?.real_name,
      });
      if (!gate.ok) return await say(escape(gate.reason));

      const nameOf = async (id: string) => {
        try {
          const { user: other } = (await call("users.info", { user: id })) as SlackResponse & { user: SlackUser };
          return other.real_name ?? other.profile?.display_name ?? "someone";
        } catch {
          return "someone";
        }
      };

      // The mention says what to add; the thread (or the message itself, when it
      // is not in one) is what to read. People's names label the messages.
      const request = await toPlainText(args.text, args.botUserId, nameOf);
      let thread = request;
      if (args.threadTs && args.threadTs !== args.ts) {
        const replies = await call("conversations.replies", {
          channel: args.channel,
          ts: args.threadTs,
          limit: String(MAX_THREAD_MESSAGES),
          inclusive: "true",
        });
        const messages = (replies.messages as { text?: string; user?: string; bot_id?: string; ts?: string }[] | undefined) ?? [];
        const lines: string[] = [];
        // Up to the mention, and not the bot's own replies.
        for (const m of messages) {
          if (m.bot_id || !m.text || (m.ts && Number(m.ts) > Number(args.ts))) continue;
          const who = m.user ? await nameOf(m.user) : "someone";
          lines.push(`${who}: ${await toPlainText(m.text, args.botUserId, nameOf)}`);
        }
        thread = lines.join("\n\n");
      }
      let text = request || thread ? `<request>\n${request}\n</request>\n<thread>\n${thread}\n</thread>` : "";
      if (text.length > MAX_TEXT) text = text.slice(0, 200) + text.slice(-(MAX_TEXT - 200));

      if (!thread.trim()) {
        return await say(
          "Mention me in a message with a talk announcement, a paper's details or some news, or in a reply to one, and I'll add it for review.",
        );
      }
      if (!isConfigured()) return await say("Reading messages is not set up on this deployment yet.");

      const { system, schema } = requestEventsAndPublications(gate.vocab, todayInNewYork());
      const { data } = await generateStructured({ system, schema, text, maxTokens: 16_000 });
      const found = data as { events?: unknown; publications?: unknown; news?: unknown };
      const events = toDrafts(found.events ?? { items: [] }, gate.vocab);
      const publications = toDrafts(found.publications ?? { items: [] }, gate.vocab);
      const news = toDrafts(found.news ?? { items: [] }, gate.vocab);

      if (events.length === 0 && publications.length === 0 && news.length === 0) {
        return await say(
          "I couldn't find a talk, a paper or news in that. Include the details (title, date, speaker; title, authors, venue; or what happened), or say \"add this as news\", and mention me again.",
        );
      }

      const added: string[] = [];
      const skipped: string[] = [];
      const seriesLabel = new Map(gate.vocab.series.map((s) => [s.slug, s.label]));

      for (const { draft, warnings } of events) {
        const name = escape(str(draft.title) ?? "an event");
        const parsed = asEvent(draft);
        if (!parsed.ok) {
          skipped.push(`• Event *${name}*: couldn't find ${parsed.missing}.`);
          continue;
        }
        try {
          await ctx.runMutation(internal.slack.submitEvent, { email, event: parsed.event });
          const series = seriesLabel.get(parsed.event.series) ?? parsed.event.series;
          added.push(`• Event: *${name}*, ${readableDate(parsed.event.startDate)} (${escape(series)})${check(warnings)}`);
        } catch (error) {
          skipped.push(`• Event *${name}*: ${escape(error instanceof ConvexError ? String(error.data) : "could not be saved")}`);
          if (!(error instanceof ConvexError)) console.error("Slack event submit failed", error);
        }
      }

      for (const { draft, warnings } of publications) {
        const name = escape(str(draft.title) ?? "a paper");
        const parsed = asPublication(draft);
        if (!parsed.ok) {
          skipped.push(`• Paper *${name}*: couldn't find ${parsed.missing}.`);
          continue;
        }
        try {
          await ctx.runMutation(internal.slack.submitPublication, { email, publication: parsed.publication });
          added.push(`• Paper: *${name}*, ${escape(parsed.publication.venue)}${check(warnings)}`);
        } catch (error) {
          skipped.push(`• Paper *${name}*: ${escape(error instanceof ConvexError ? String(error.data) : "could not be saved")}`);
          if (!(error instanceof ConvexError)) console.error("Slack publication submit failed", error);
        }
      }

      for (const { draft, warnings } of news) {
        const name = escape(str(draft.title) ?? "a news item");
        const parsed = asNews(draft);
        if (!parsed.ok) {
          skipped.push(`• News *${name}*: couldn't find ${parsed.missing}.`);
          continue;
        }
        try {
          await ctx.runMutation(internal.slack.submitNews, { email, news: parsed.news });
          added.push(`• News: *${name}*${parsed.news.date ? `, ${readableDate(parsed.news.date)}` : ""}${check(warnings)}`);
        } catch (error) {
          skipped.push(`• News *${name}*: ${escape(error instanceof ConvexError ? String(error.data) : "could not be saved")}`);
          if (!(error instanceof ConvexError)) console.error("Slack news submit failed", error);
        }
      }

      const lines: string[] = [];
      if (added.length > 0) {
        lines.push(`Added for review:`, ...added);
        lines.push(`An admin will publish ${added.length === 1 ? "it" : "them"}. Follow or fix under Submissions on the <${ADMIN_URL}|admin page>.`);
      }
      if (skipped.length > 0) {
        lines.push(added.length > 0 ? "\nNot added:" : "I couldn't add these:", ...skipped);
        lines.push(`You can fill them in on the <${ADMIN_URL}|admin page>.`);
      }
      return await say(lines.join("\n"));
    } catch (error) {
      if (error instanceof ConvexError) return await say(escape(String(error.data)));
      console.error("Slack mention failed", error);
      return await say(`Something went wrong reading that. Try the <${ADMIN_URL}|admin page> instead.`);
    }
  },
});
