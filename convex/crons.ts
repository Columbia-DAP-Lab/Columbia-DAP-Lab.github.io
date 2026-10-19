import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/** Announce upcoming events in Slack, and remind (convex/announcements.ts). */
crons.interval("announce upcoming events", { minutes: 15 }, internal.announcements.tick, {});

/** Sweep live cursors and clicks nobody is sending any more (convex/presence.ts). */
crons.interval("sweep live cursors", { minutes: 1 }, internal.presence.sweep, {});

export default crons;
