import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

/** Announce upcoming events in Slack, and remind (convex/announcements.ts). */
crons.interval("announce upcoming events", { minutes: 15 }, internal.announcements.tick, {});

export default crons;
