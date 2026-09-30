import { v } from "convex/values";
import { env, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Ask GitHub to rebuild the site after content changes.
 *
 * Publishing sends a `repository_dispatch` of type `content-updated`, which
 * .github/workflows/deploy.yml listens for; the build then fetches the current
 * content and publishes it to Pages.
 *
 * Debounced, because publishing five items in a row should produce one build, not
 * five. A request records the time and schedules a send for QUIET_MS later; the
 * send goes ahead only if nothing has been requested since. GitHub Actions'
 * `cancel-in-progress` handles whatever still overlaps.
 *
 * Needs two deployment environment variables:
 *   npx convex env set GITHUB_REPOSITORY Columbia-DAP-Lab/Columbia-DAP-Lab.github.io
 *   npx convex env set GITHUB_DISPATCH_TOKEN <token with contents:write on that repo>
 *
 * Without them this logs and does nothing, so a deployment that has not been
 * given a token still works — the nightly snapshot and the next ordinary push
 * pick the content up.
 */

const QUIET_MS = 60_000;

/** Note that a rebuild is wanted, and schedule the send. */
export const requestRebuild = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const existing = await ctx.db.query("rebuildRequests").take(1);
    if (existing.length > 0) {
      await ctx.db.patch("rebuildRequests", existing[0]._id, { requestedAt: now });
    } else {
      await ctx.db.insert("rebuildRequests", { requestedAt: now });
    }
    await ctx.scheduler.runAfter(QUIET_MS, internal.deployHook.sendIfQuiet, { requestedAt: now });
    return null;
  },
});

/** The most recent request time, so a send can tell whether it was superseded. */
export const latestRequest = internalQuery({
  args: {},
  returns: v.union(v.number(), v.null()),
  handler: async (ctx) => {
    const rows = await ctx.db.query("rebuildRequests").take(1);
    return rows[0]?.requestedAt ?? null;
  },
});

export const sendIfQuiet = internalAction({
  args: { requestedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const latest = await ctx.runQuery(internal.deployHook.latestRequest, {});
    // Something was published after this request; that later timer will send.
    if (latest !== null && latest > args.requestedAt) return null;

    const repository = env.GITHUB_REPOSITORY;
    const token = env.GITHUB_DISPATCH_TOKEN;
    if (!repository || !token) {
      console.warn("No GITHUB_DISPATCH_TOKEN; skipping rebuild. The site updates on the next build.");
      return null;
    }

    const response = await fetch(`https://api.github.com/repos/${repository}/dispatches`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "user-agent": "daplab-convex",
      },
      body: JSON.stringify({ event_type: "content-updated" }),
    });

    if (!response.ok) {
      // Worth failing loudly in the logs: the site is now behind the database, and
      // nothing else will notice until the nightly snapshot runs.
      throw new Error(`repository_dispatch failed: ${response.status} ${await response.text()}`);
    }
    return null;
  },
});
