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
  },
});

/** Bounds how often one person can ask the model to read pasted text. */
app.use(rateLimiter);

export default app;
