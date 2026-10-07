import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { grantedCapabilities } from "./authz";
import { ADMIN_URL, escape, slackApi } from "./slack";

/**
 * Upcoming events, announced in Slack.
 *
 * A cron (convex/crons.ts) runs `tick` every 15 minutes. For each published
 * event coming up (courses excepted: they meet all semester), it posts:
 *
 *   - a week before: the announcement, in SLACK_ANNOUNCE_CHANNEL;
 *   - two days before: a reminder in the announcement's thread;
 *   - two hours before: a last reminder in the thread, also sent to the channel.
 *
 * An event whose start time cannot be read from its time label ("TBD") is not
 * announced at all; instead everyone who manages events gets a Slack DM, once
 * per label, saying which event and to set its time on the Events tab. Once the
 * time can be read, the next tick announces it.
 *
 * An event published less than a week out is announced at once, and a stage
 * whose moment has already passed is skipped, never sent late. Editing the
 * event updates the announcement; moving it to another day starts the
 * reminders over; removing it says so in the thread.
 *
 * Nothing is posted without SLACK_ANNOUNCE_CHANNEL, which is set on production
 * only: dev shares the bot, and must not announce its copy of the events.
 * The bot must be a member of the channel (/invite @DAPLab).
 */

const HOUR = 60 * 60 * 1000;
const WEEK = 7 * 24 * HOUR;
const TWO_DAYS = 48 * HOUR;
const TWO_HOURS = 2 * HOUR;
const TIME_ZONE = "America/New_York";
const EVENTS_URL = "https://daplab.cs.columbia.edu/events";

// ------------------------------------------------------------------- times

/**
 * The start time in a free-text label, as 24-hour [hours, minutes]: "3PM-4PM",
 * "12:30PM-1:30PM", "10:10AM - 12:00PM F", "12-1pm" (the pm carries back).
 * Null when there is no time in it.
 */
export const parseStartTime = (label: string | undefined): [number, number] | null => {
  if (!label) return null;
  const times = [...label.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?![\d])/gi)].filter(
    (m) => Number(m[1]) >= 1 && Number(m[1]) <= 12,
  );
  if (times.length === 0) return null;
  const [first, second] = times;
  const meridiem = (first[3] ?? second?.[3] ?? "").toLowerCase().replace(/\./g, "");
  let hours = Number(first[1]);
  const minutes = Number(first[2] ?? 0);
  if (meridiem === "pm" && hours < 12) hours += 12;
  else if (meridiem === "am" && hours === 12) hours = 0;
  // No am/pm anywhere: talks run in the daytime, so 1-6 is the afternoon.
  else if (meridiem === "" && hours >= 1 && hours <= 6) hours += 12;
  return [hours, minutes];
};

/** The instant a New York wall-clock time happens, in milliseconds. */
const newYorkInstant = (isoDate: string, hours: number, minutes: number) => {
  const [y, mo, d] = isoDate.split("-").map(Number);
  const asIfUtc = Date.UTC(y, mo - 1, d, hours, minutes);
  const offsetAt = (instant: number) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: TIME_ZONE,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
        .formatToParts(instant)
        .map((p) => [p.type, p.value]),
    );
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) - instant;
  };
  // Twice, so an instant near a daylight-saving change lands on the right side.
  return asIfUtc - offsetAt(asIfUtc - offsetAt(asIfUtc));
};

/**
 * When an event starts, or null when its time label has no time to read. For
 * the one-week check alone, an unreadable event is taken to start at 9 AM.
 */
const startOf = (event: { startDate: string; timeLabel?: string }) => {
  const time = parseStartTime(event.timeLabel);
  return { at: newYorkInstant(event.startDate, ...(time ?? [9, 0])), hasTime: time !== null };
};

/** The anchor /events gives an event: its date as yymmdd, then its title slugified. */
const eventAnchor = (startDate: string, title: string) =>
  `${startDate.slice(2).replace(/-/g, "")}-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;

// ----------------------------------------------------------------- messages

type Upcoming = {
  eventId: Id<"events">;
  title: string;
  startDate: string;
  timeLabel?: string;
  location?: string;
  description?: string;
  link?: string;
  series: string;
  speakers: { name: string; affiliation?: string }[];
  announcement: {
    _id: Id<"eventAnnouncements">;
    channel: string;
    ts: string;
    reminderAt?: number;
    finalAt?: number;
    startsAt: number;
    text: string;
  } | null;
};

const dayOf = (isoDate: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options }).format(new Date(`${isoDate}T12:00:00Z`));

const whenLine = (e: Upcoming) =>
  [dayOf(e.startDate, { weekday: "long", month: "long", day: "numeric" }), e.timeLabel, e.location].filter(Boolean).join(" · ");

const speakerLine = (e: Upcoming) =>
  e.speakers.map((s) => (s.affiliation ? `${s.name} (${s.affiliation})` : s.name)).join(", ");

/** The first paragraph of the abstract, kept short. */
const teaser = (description: string | undefined) => {
  const first = (description ?? "").split(/\n\s*\n/)[0].replace(/\s+/g, " ").trim();
  return first.length > 400 ? `${first.slice(0, 400).replace(/\s+\S*$/, "")}…` : first;
};

const announcementText = (e: Upcoming) => {
  const details = `${EVENTS_URL}#${eventAnchor(e.startDate, e.title)}`;
  return [
    `:mega: *${escape(e.title)}*${e.series ? ` · ${escape(e.series)}` : ""}`,
    speakerLine(e) && escape(speakerLine(e)),
    escape(whenLine(e)),
    teaser(e.description) && `>${escape(teaser(e.description))}`,
    `<${details}|Details on the DAPLab site>`,
  ]
    .filter(Boolean)
    .join("\n");
};

const reminderText = (e: Upcoming) =>
  `:alarm_clock: Reminder: *${escape(e.title)}* is on ${dayOf(e.startDate, { weekday: "long" })}` +
  `${e.timeLabel ? `, ${escape(e.timeLabel)}` : ""}${e.location ? `, in ${escape(e.location)}` : ""}.`;

const finalText = (e: Upcoming) =>
  `:hourglass_flowing_sand: Starting in two hours: *${escape(e.title)}*` +
  `${speakerLine(e) ? ` with ${escape(speakerLine(e))}` : ""}${e.location ? `, in ${escape(e.location)}` : ""}.`;

/** The DM to the admins about an event that cannot be announced. */
const issueText = (e: Upcoming) =>
  `:warning: I couldn't announce *${escape(e.title)}* (${dayOf(e.startDate, { weekday: "long", month: "long", day: "numeric" })}) ` +
  `in Slack: its time ${e.timeLabel ? `"${escape(e.timeLabel)}"` : "is empty and"} isn't one I can read. ` +
  `Set the time on the Events tab of the <${ADMIN_URL}|admin page> (Published events → Edit), like "3PM-4PM" or "12:30PM", ` +
  `and I'll announce it within 15 minutes.`;

// -------------------------------------------------------------------- data

/** Published events between two dates, with their speakers and any announcement. */
export const upcoming = internalQuery({
  args: { from: v.string(), to: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, args): Promise<Upcoming[]> => {
    const events = await ctx.db
      .query("events")
      .withIndex("by_status_and_startDate", (q) =>
        q.eq("status", "published").gte("startDate", args.from).lte("startDate", args.to),
      )
      .take(200);
    const out: Upcoming[] = [];
    for (const e of events) {
      if (e.series === "course") continue;
      const [speakers, series, announcement] = await Promise.all([
        ctx.db
          .query("eventSpeakers")
          .withIndex("by_eventId_and_position", (q) => q.eq("eventId", e._id))
          .take(20),
        ctx.db
          .query("eventSeries")
          .withIndex("by_slug", (q) => q.eq("slug", e.series))
          .unique(),
        ctx.db
          .query("eventAnnouncements")
          .withIndex("by_eventId", (q) => q.eq("eventId", e._id))
          .unique(),
      ]);
      out.push({
        eventId: e._id,
        title: e.title,
        startDate: e.startDate,
        timeLabel: e.timeLabel,
        location: e.location,
        description: e.description,
        link: e.link,
        series: series?.label && series.slug !== "other" ? series.label : "",
        speakers: speakers.map((s) => ({ name: s.name, affiliation: s.affiliation })),
        announcement: announcement && {
          _id: announcement._id,
          channel: announcement.channel,
          ts: announcement.ts,
          reminderAt: announcement.reminderAt,
          finalAt: announcement.finalAt,
          startsAt: announcement.startsAt,
          text: announcement.text,
        },
      });
    }
    return out;
  },
});

/** Announcements of events that have since been removed (or unpublished), not yet marked cancelled. */
export const withdrawn = internalQuery({
  args: { now: v.number() },
  returns: v.array(
    v.object({ _id: v.id("eventAnnouncements"), channel: v.string(), ts: v.string(), text: v.string() }),
  ),
  handler: async (ctx, args) => {
    const announcements = await ctx.db.query("eventAnnouncements").take(500);
    const out = [];
    for (const a of announcements) {
      if (a.cancelledAt !== undefined || a.startsAt < args.now) continue;
      const event = await ctx.db.get("events", a.eventId);
      if (event === null || event.status !== "published") {
        out.push({ _id: a._id, channel: a.channel, ts: a.ts, text: a.text });
      }
    }
    return out;
  },
});

/** Who manages events, by email: they hear about events that cannot be announced. */
export const eventManagers = internalQuery({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const roles = await ctx.db.query("roles").take(500);
    const out = [];
    for (const role of roles) {
      const caps = await grantedCapabilities(ctx, role.email);
      if (caps.includes("admin") || caps.includes("events")) out.push(role.email);
    }
    return out;
  },
});

/** Whether the admins have already been told about this event with this time label. */
export const issueNotified = internalQuery({
  args: { eventId: v.id("events"), timeLabel: v.optional(v.string()) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const issue = await ctx.db
      .query("announcementIssues")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .unique();
    return issue !== null && issue.timeLabel === args.timeLabel;
  },
});

export const saveIssue = internalMutation({
  args: { eventId: v.id("events"), timeLabel: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const issue = await ctx.db
      .query("announcementIssues")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .unique();
    if (issue === null) await ctx.db.insert("announcementIssues", { ...args, notifiedAt: Date.now() });
    else await ctx.db.patch("announcementIssues", issue._id, { timeLabel: args.timeLabel, notifiedAt: Date.now() });
    return null;
  },
});

export const saveAnnouncement = internalMutation({
  args: {
    eventId: v.id("events"),
    channel: v.string(),
    ts: v.string(),
    startsAt: v.number(),
    text: v.string(),
    reminderAt: v.optional(v.number()),
    finalAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("eventAnnouncements", { ...args, announcedAt: Date.now() });
    return null;
  },
});

export const updateAnnouncement = internalMutation({
  args: {
    id: v.id("eventAnnouncements"),
    text: v.optional(v.string()),
    startsAt: v.optional(v.number()),
    reminderAt: v.optional(v.union(v.number(), v.null())),
    finalAt: v.optional(v.union(v.number(), v.null())),
    cancelledAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { id, ...changes }) => {
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(changes)) {
      if (value !== undefined) patch[key] = value === null ? undefined : value;
    }
    await ctx.db.patch("eventAnnouncements", id, patch);
    return null;
  },
});

// ------------------------------------------------------------------- the tick

const isoDay = (instant: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    instant,
  );

export const tick = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const token = env.SLACK_BOT_TOKEN?.trim();
    const channel = env.SLACK_ANNOUNCE_CHANNEL?.trim();
    if (!token || !channel) return null;
    const post = (params: Record<string, string | undefined>) => slackApi(token, "chat.postMessage", params);
    const now = Date.now();

    const events: Upcoming[] = await ctx.runQuery(internal.announcements.upcoming, {
      from: isoDay(now - 24 * HOUR),
      to: isoDay(now + WEEK + 24 * HOUR),
    });

    for (const e of events) {
      try {
        const { at, hasTime } = startOf(e);
        const left = at - now;
        const finalDue = left <= TWO_HOURS;

        // No time to read: nothing is posted; the people who manage events hear why.
        if (!hasTime) {
          if (left > WEEK) continue;
          const told: boolean = await ctx.runQuery(internal.announcements.issueNotified, {
            eventId: e.eventId,
            timeLabel: e.timeLabel,
          });
          if (told) continue;
          const managers: string[] = await ctx.runQuery(internal.announcements.eventManagers, {});
          for (const email of managers) {
            try {
              const found = (await slackApi(token, "users.lookupByEmail", { email })) as { user?: { id?: string } };
              if (!found.user?.id) continue;
              const dm = (await slackApi(token, "conversations.open", { users: found.user.id })) as { channel?: { id?: string } };
              if (dm.channel?.id) await post({ channel: dm.channel.id, text: issueText(e) });
            } catch (error) {
              const reason = error instanceof Error ? error.message : String(error);
              if (!reason.includes("users_not_found")) console.warn("Could not DM an event manager", { email, reason });
            }
          }
          await ctx.runMutation(internal.announcements.saveIssue, { eventId: e.eventId, timeLabel: e.timeLabel });
          continue;
        }
        if (left <= 0) continue;
        const text = announcementText(e);
        const a = e.announcement;

        if (a === null) {
          if (left > WEEK) continue;
          const sent = await post({ channel, text, unfurl_links: "false" });
          // Stages already due are folded into this announcement, not sent after it.
          await ctx.runMutation(internal.announcements.saveAnnouncement, {
            eventId: e.eventId,
            channel,
            ts: String(sent.ts),
            startsAt: at,
            text,
            reminderAt: left <= TWO_DAYS ? now : undefined,
            finalAt: finalDue ? now : undefined,
          });
          continue;
        }

        // Moved to another time: the reminders start over.
        let { reminderAt, finalAt } = a;
        if (a.startsAt !== at) {
          reminderAt = left <= TWO_DAYS ? now : undefined;
          finalAt = finalDue ? now : undefined;
          await ctx.runMutation(internal.announcements.updateAnnouncement, {
            id: a._id,
            startsAt: at,
            reminderAt: reminderAt ?? null,
            finalAt: finalAt ?? null,
          });
        }
        if (a.text !== text) {
          await slackApi(token, "chat.update", { channel: a.channel, ts: a.ts, text });
          await ctx.runMutation(internal.announcements.updateAnnouncement, { id: a._id, text });
        }
        if (reminderAt === undefined && left <= TWO_DAYS) {
          // Once the last reminder is due, it covers this one.
          if (!finalDue) await post({ channel: a.channel, thread_ts: a.ts, text: reminderText(e) });
          await ctx.runMutation(internal.announcements.updateAnnouncement, { id: a._id, reminderAt: now });
        }
        if (finalAt === undefined && finalDue) {
          await post({ channel: a.channel, thread_ts: a.ts, reply_broadcast: "true", text: finalText(e) });
          await ctx.runMutation(internal.announcements.updateAnnouncement, { id: a._id, finalAt: now });
        }
      } catch (error) {
        console.error("Event announcement failed", { title: e.title, error: error instanceof Error ? error.message : error });
      }
    }

    // Removed after being announced: say so in the thread, and mark the post.
    const gone: { _id: Id<"eventAnnouncements">; channel: string; ts: string; text: string }[] = await ctx.runQuery(
      internal.announcements.withdrawn,
      { now },
    );
    for (const a of gone) {
      try {
        await post({ channel: a.channel, thread_ts: a.ts, text: ":no_entry: This event has been cancelled." });
        await slackApi(token, "chat.update", { channel: a.channel, ts: a.ts, text: `~Cancelled~\n${a.text}` });
        await ctx.runMutation(internal.announcements.updateAnnouncement, { id: a._id, cancelledAt: now });
      } catch (error) {
        console.error("Event cancellation notice failed", error instanceof Error ? error.message : error);
      }
    }
    return null;
  },
});

/**
 * What tick would do, without posting: each upcoming event's start as read,
 * and when each stage goes out (New York time). From the command line:
 *
 *   npx convex run --prod announcements:preview
 */
export const preview = internalAction({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx): Promise<unknown[]> => {
    const now = Date.now();
    const events: Upcoming[] = await ctx.runQuery(internal.announcements.upcoming, {
      from: isoDay(now - 24 * HOUR),
      to: isoDay(now + WEEK + 24 * HOUR),
    });
    const show = (instant: number) =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: TIME_ZONE,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(instant);
    return events.map((e) => {
      const { at, hasTime } = startOf(e);
      const when = (instant: number) => (instant <= now ? "now (or already)" : show(instant));
      if (!hasTime) {
        return {
          title: e.title,
          timeLabel: e.timeLabel ?? null,
          starts: `${e.startDate}: no time I can read`,
          skipped: "not announced; event managers get a DM to set the time",
          messages: { dm: issueText(e) },
        };
      }
      return {
        title: e.title,
        timeLabel: e.timeLabel ?? null,
        starts: show(at),
        announce: e.announcement ? "done" : when(at - WEEK),
        reminder: e.announcement?.reminderAt ? "done" : when(at - TWO_DAYS),
        final: e.announcement?.finalAt ? "done" : when(at - TWO_HOURS),
        messages: { announcement: announcementText(e), reminder: reminderText(e), final: finalText(e) },
      };
    });
  },
});
