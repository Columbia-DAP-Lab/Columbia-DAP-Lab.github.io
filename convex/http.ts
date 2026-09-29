import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

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
    const [events, publications, people, news, eventSeries, fieldColors] = await Promise.all([
      ctx.runQuery(api.content.events, {}),
      ctx.runQuery(api.content.publications, {}),
      ctx.runQuery(api.content.people, {}),
      ctx.runQuery(api.content.news, {}),
      ctx.runQuery(api.content.eventSeries, {}),
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

export default http;
