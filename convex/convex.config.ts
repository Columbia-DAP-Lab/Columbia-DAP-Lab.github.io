import { defineApp } from "convex/server";
import { v } from "convex/values";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";

/**
 * Typed deployment environment variables.
 *
 * All optional: a deployment without them still runs. Without the GitHub pair it
 * cannot ask GitHub to rebuild (see convex/deployHook.ts); without LLM_API_KEY
 * the admin page's "paste text to fill this form" is switched off (see
 * convex/llm.ts). GOOGLE_CLIENT_ID is declared in convex/auth.config.ts instead,
 * which Convex evaluates before this.
 *
 *   npx convex env set GITHUB_REPOSITORY Columbia-DAP-Lab/Columbia-DAP-Lab.github.io
 *   npx convex env set GITHUB_DISPATCH_TOKEN <token with contents:write>
 *   npx convex env set LLM_API_KEY <OpenAI or Bedrock key, see convex/llm.ts>
 *
 * Without the Slack pair, /slack/events refuses every request (see convex/slack.ts):
 *
 *   npx convex env set SLACK_SIGNING_SECRET <Basic Information → Signing Secret>
 *   npx convex env set SLACK_BOT_TOKEN <OAuth & Permissions → Bot User OAuth Token, xoxb-...>
 */
const app = defineApp({
  env: {
    GITHUB_REPOSITORY: v.optional(v.string()),
    GITHUB_DISPATCH_TOKEN: v.optional(v.string()),
    LLM_API_KEY: v.optional(v.string()),
    /** An OpenAI-compatible endpoint; unset means OpenAI itself. */
    LLM_BASE_URL: v.optional(v.string()),
    /** Overrides the default model in convex/llm.ts. */
    LLM_MODEL: v.optional(v.string()),
    /** Proves a request to /slack/events came from Slack. */
    SLACK_SIGNING_SECRET: v.optional(v.string()),
    /** The bot's token, for reading the sender's profile and replying in the thread. */
    SLACK_BOT_TOKEN: v.optional(v.string()),
    /**
     * The channel ID (C…) to announce upcoming events in, e.g. #general's
     * (convex/announcements.ts). Set on production only: unset, nothing is posted.
     */
    SLACK_ANNOUNCE_CHANNEL: v.optional(v.string()),
  },
});

/** Bounds how often one person can ask the model to read pasted text. */
app.use(rateLimiter);

export default app;
