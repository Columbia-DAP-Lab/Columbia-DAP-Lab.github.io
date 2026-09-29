import { defineApp } from "convex/server";
import { v } from "convex/values";

/**
 * Typed deployment environment variables.
 *
 * Both are optional: a deployment without them still runs, it just cannot ask
 * GitHub to rebuild (see convex/deployHook.ts). GOOGLE_CLIENT_ID is declared in
 * convex/auth.config.ts instead, which Convex evaluates before this.
 *
 *   npx convex env set GITHUB_REPOSITORY Columbia-DAP-Lab/Columbia-DAP-Lab.github.io
 *   npx convex env set GITHUB_DISPATCH_TOKEN <token with contents:write>
 */
const app = defineApp({
  env: {
    GITHUB_REPOSITORY: v.optional(v.string()),
    GITHUB_DISPATCH_TOKEN: v.optional(v.string()),
  },
});

export default app;
