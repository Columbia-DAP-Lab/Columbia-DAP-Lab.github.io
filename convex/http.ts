import { httpRouter } from "convex/server";
import { env, httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { slackApi, verifySlackRequest } from "./slack";
import { rejectDialog } from "./slackReview";

/**
 * Public content feed for the site build.
 *
 * .github/workflows/deploy.yml fetches this before `jekyll build` and writes it
 * into _data/, so the published pages are still static HTML served by Pages.
 *
 * One endpoint rather than four: a single request is one transaction, so the build
 * cannot catch events from before a publish and publications from after it.
 *
 * Unauthenticated on purpose — it returns exactly what the public site shows.
 */
const http = httpRouter();

http.route({
  path: "/content.json",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const [events, publications, people, news, eventSeries, projects, fieldColors] = await Promise.all([
      ctx.runQuery(api.content.events, {}),
      ctx.runQuery(api.content.publications, {}),
      ctx.runQuery(api.content.people, {}),
      ctx.runQuery(api.content.news, {}),
      ctx.runQuery(api.content.eventSeries, {}),
      ctx.runQuery(api.content.projects, {}),
      ctx.runQuery(api.content.fieldColors, {}),
    ]);

    return new Response(
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        events,
        publications,
        people,
        news,
        eventSeries,
        projects,
        fieldColors,
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          // The build fetches this fresh every time; a CDN copy would defeat the
          // repository_dispatch that triggered the build in the first place.
          "cache-control": "no-store",
          "access-control-allow-origin": "*",
        },
      },
    );
  }),
});

/**
 * Slack's Events API: each @DAPLab mention, signed with the app's signing secret.
 * Answers within Slack's 3 seconds and leaves the reading to convex/slack.ts.
 */
http.route({
  path: "/slack/events",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Trimmed: a secret pasted with a trailing newline would never match.
    const secret = env.SLACK_SIGNING_SECRET?.trim();
    if (!secret) return new Response("Slack is not set up on this deployment", { status: 503 });

    // The signature covers the raw body, so read it as text before parsing.
    const body = await request.text();
    if (!(await verifySlackRequest(request.headers, body, secret))) {
      return new Response("Bad signature", { status: 401 });
    }

    const payload = JSON.parse(body) as {
      type?: string;
      challenge?: string;
      event_id?: string;
      authorizations?: { user_id?: string }[];
      event?: { type?: string; subtype?: string; bot_id?: string; user?: string; text?: string; ts?: string; thread_ts?: string; channel?: string };
    };

    // Slack checks the URL once, when it is entered in the app's settings.
    if (payload.type === "url_verification") {
      return new Response(JSON.stringify({ challenge: payload.challenge }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const event = payload.event;
    if (
      payload.type === "event_callback" &&
      event?.type === "app_mention" &&
      !event.bot_id &&
      !event.subtype &&
      event.user &&
      event.ts &&
      event.channel &&
      payload.event_id
    ) {
      await ctx.runMutation(internal.slack.receive, {
        eventId: payload.event_id,
        channel: event.channel,
        ts: event.ts,
        threadTs: event.thread_ts,
        user: event.user,
        text: event.text ?? "",
        botUserId: payload.authorizations?.[0]?.user_id,
      });
    } else {
      // Only shapes, no message text: enough to tell a wrong subscription from a bot's own post.
      console.log("Slack request ignored", {
        type: payload.type,
        event: event?.type,
        subtype: event?.subtype,
        fromBot: Boolean(event?.bot_id),
      });
    }
    return new Response(null, { status: 200 });
  }),
});

/**
 * Slack's Interactivity: the review DMs' buttons and the Reject dialog
 * (convex/slackReview.ts). Signed like events; the body is form-encoded with
 * the JSON in `payload`.
 */
http.route({
  path: "/slack/interactions",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const secret = env.SLACK_SIGNING_SECRET?.trim();
    if (!secret) return new Response("Slack is not set up on this deployment", { status: 503 });
    const body = await request.text();
    if (!(await verifySlackRequest(request.headers, body, secret))) {
      return new Response("Bad signature", { status: 401 });
    }

    const payload = JSON.parse(new URLSearchParams(body).get("payload") ?? "{}") as {
      type?: string;
      trigger_id?: string;
      user?: { id?: string };
      actions?: { action_id?: string; value?: string }[];
      view?: { callback_id?: string; private_metadata?: string; state?: { values?: Record<string, Record<string, { value?: string | null }>> } };
    };
    const slackUser = payload.user?.id;
    if (!slackUser) return new Response(null, { status: 200 });
    const target = (value: string | undefined) => {
      const parsed = JSON.parse(value ?? "{}") as { table?: string; id?: string };
      const tables = ["events", "publications", "people", "news", "profileEdits"] as const;
      const table = tables.find((t) => t === parsed.table);
      return table && parsed.id ? { table, id: parsed.id } : null;
    };

    if (payload.type === "block_actions") {
      const action = payload.actions?.[0];
      const which = target(action?.value);
      if (which && action?.action_id === "review_approve") {
        await ctx.scheduler.runAfter(0, internal.slackReview.decide, { slackUser, ...which, decision: "published" });
      } else if (which && action?.action_id === "review_reject" && payload.trigger_id) {
        // The dialog has to open within Slack's 3 seconds, so it is opened here.
        const token = env.SLACK_BOT_TOKEN?.trim();
        if (token) await slackApi(token, "views.open", rejectDialog(payload.trigger_id, action.value ?? ""));
      }
      // "Open in admin" is a link; Slack still reports the click, and there is nothing to do.
    } else if (payload.type === "view_submission" && payload.view?.callback_id === "review_reject") {
      const which = target(payload.view.private_metadata);
      const note = payload.view.state?.values?.note?.note?.value?.trim() || undefined;
      if (which) {
        await ctx.scheduler.runAfter(0, internal.slackReview.decide, { slackUser, ...which, decision: "rejected", reviewNote: note });
      }
    }
    return new Response(null, { status: 200 });
  }),
});

export default http;
