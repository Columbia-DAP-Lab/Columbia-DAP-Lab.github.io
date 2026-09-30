# DAPLab admin service — design

Status: proposal, not built. Written 2026-09-29, revised for Convex-hosted content.

Three features, adapted from [CAIL's site](https://cail.columbia.edu): Columbia/Google
login, a Slack bot that files events from channel announcements, and a submission
GUI for events and publications.

The organizing decision: **events and publications move out of `_data/*.yml` and
into Convex tables.** Adding a talk or a paper stops being a commit and becomes a
form submission. The repo keeps the site — layouts, styles, people, posts, projects
— and stops carrying the content that changes weekly.

## 1. The site stays on GitHub Pages

`daplab.cs.columbia.edu` keeps building from `.github/workflows/deploy.yml` and
serving from Pages. Nothing here puts a server in front of the public site.

Pages cannot hold a secret, and that decides the rest. Precisely, on a static page:

- **Google sign-in works with no backend.** Google Identity Services runs in the
  browser and returns a signed ID token proving who someone is. Free, today.
- **Saving does not.** A write needs a credential, and anything shipped to the
  browser is public — in a public repo, that is write access for anyone who views
  source. Gating the form client-side is cosmetic; the endpoint can be called
  directly.

So the ID token is verified server-side, where the write actually happens. With
content in Convex, that server is Convex itself — there is no separate "verifier"
tier, and no GitHub credential to protect in the common path.

## 2. Where content lives, and how it reaches the page

Convex is the source of truth for events and publications. Pages still serves static
HTML. The join between them is the question.

### Option A — build-time fetch (recommended)

`deploy.yml` gains a step before `jekyll build` that fetches JSON from Convex and
writes `_data/events.yml` and `_data/pubs.yml` **into the runner's checkout only**.
Never committed. Convex pings `repository_dispatch` after a publish, so a submission
is live in a minute or two.

Why this one:

- Every existing Liquid template keeps working untouched — `events.html`'s
  upcoming/past split and filters, `_includes/pubs.html`'s tag filtering and its
  cross-reference against `site.data.people` to bold lab authors. Client-side
  rendering means rewriting all of that in JavaScript.
- The served page is still pre-rendered HTML: no flash of empty content, no JS
  requirement, and search engines see the real thing. A lab site that wants its
  papers indexed should not hide them behind a fetch.
- **If Convex is down, the site is unaffected.** It is static HTML on a CDN. Only
  the next rebuild would notice, and §8 gives that a fallback.

The cost is latency — a minute or two from submit to live, not instant — and a build
that now depends on an external service (§8 handles that).

### Option B — client-side fetch

`/events` and `/publications` ship as shells that query Convex from the browser.
Instant updates, no rebuild. But it means reimplementing the Liquid in JS, losing
pre-rendered HTML for the two pages most worth indexing, and a spinner on every
visit. Reasonable for a logged-in dashboard; wrong for the public pages.

### Recommendation

Option A for the public pages. Option B is worth adding later *only* for a preview
view inside `/admin/`, so a submitter can see their entry rendered before the site
rebuilds.

## 3. Architecture

```
  Submitter ──────▶┌───────────────────────────┐
   /admin/ form    │ Convex                    │
   (Pages, static) │                           │
                   │  events        (table)    │
  Slack ──────────▶│  publications  (table)    │
   @daplab mention │  people_cache, roles,     │
                   │  drafts, slackLinks       │
                   │                           │
                   │  http: /content/events    │
                   │        /content/pubs      │
                   │        /slack/*           │
                   └────────┬──────────┬───────┘
                            │          │ repository_dispatch
                   fetch at │          ▼
                   build    │   ┌──────────────────────┐
                            └──▶│ deploy.yml (Actions) │
                                │  fetch → jekyll      │
                                │  build → Pages       │
                                └──────────┬───────────┘
                                           ▼
                                 daplab.cs.columbia.edu
```

## 4. What lives where

| Content | Home | Why |
|---|---|---|
| Events | Convex | Changes weekly, submitted by many people |
| Publications | Convex | Same |
| People | Convex | Papers and talks reference person records, so the directory belongs in the same place; `pubs.html` still gets it at build time through the export |
| Startups | Convex (`events`) | Same shape as an event under the Entrepreneurship series |
| Blog posts | Repo (`_posts/`) | Markdown with front matter — a different problem |
| Projects, benchmarks | Repo (collections) | Same |
| Layouts, includes, CSS | Repo | It is the site |

### Tables

The schema lives in [`convex/schema.ts`](../convex/schema.ts) (added in #100). Rather
than mirroring the YAML files field for field, it normalizes three things the YAML
cannot express:

- **Authors and speakers are rows** (`publicationAuthors`, `eventSpeakers`), not
  comma-separated strings, so a person links to their papers and talks. Author
  `position` plus a denormalized `publications.authorCount` distinguishes a lab
  paper from one a lab member's name appears on.
- **Tags are a vocabulary table** with `aliasOf`, so the drift in `pubs.yml`
  (`sys`/`system`/`systems`, `sec`/`security`, `agent`/`agents`) collapses to
  canonical slugs, and `field_colors.yml`'s badge classes fold in.
- **Speaker bios live on the speaker**, where today the same bio is repeated on
  every event that person appears at.

`_data/startups.yml` folds into `events` under the Entrepreneurship series,
`_data/event_types.yml` becomes `eventSeries`, and a `revisions` table records who
changed what — the `git log` answer this move otherwise costs.

Field names track the YAML the templates read wherever there is no reason to
diverge, so the export in §5 stays a rename rather than a transformation.

## 5. Publishing endpoints

Two public HTTP actions serve the build:

- `GET /content/events.yml`
- `GET /content/pubs.yml`

Each returns **YAML**, already in the shape the templates expect, sorted as the
current files are (events newest-first; pubs by date), with `status: "published"`
rows only and the bookkeeping fields (`status`, `submittedBy`, …) stripped. Emitting
YAML rather than JSON keeps the build step to a `curl -o`, and keeps the artifact
readable when someone inspects a failed build.

These are public and unauthenticated — they serve exactly what the public site
shows.

## 6. Submission and review

"Easy to submit" is the point, so the bar to *propose* is low and the bar to
*publish* is a role:

- **Anyone with a `@columbia.edu` Google account** can submit an event or a
  publication. It lands as `status: "pending"`.
- **Editors** (`events` or `pubs` capability) publish, edit, or reject. Publishing
  sets `status: "published"` and fires a rebuild.
- **Admins** additionally manage roles.

This replaces the earlier plan of opening a GitHub PR for publications. The review
gate moves from "a human merges a PR" to "an editor clicks Publish" — same property,
and it no longer requires reviewers to have GitHub accounts.

Editors get an email or Slack ping on a pending submission; without one, pending
items rot. A weekly digest of anything pending more than 3 days is the cheap version.

### Auth

Google OIDC, validated by Convex directly — not Convex Auth, which is still beta:

1. `/admin/` renders Google Identity Services' sign-in button.
2. Google returns an ID token (`iss: https://accounts.google.com`).
3. `convex/auth.config.ts` declares Google as an OIDC provider; Convex validates the
   token and exposes claims via `ctx.auth.getUserIdentity()`.
4. Every mutation checks `identity.email` against the `roles` table.

Because LionMail is Columbia's Google Workspace, `uni@columbia.edu` sign-in goes
through Columbia's login page with Duo automatically. This is what "Columbia login"
means here — not Shibboleth/CAS, which would need Columbia IT to register the
service. Enforce the domain **server-side**; checking `hd` in the browser proves
nothing.

Roles move from a YAML file into a Convex table, since the repo is no longer where
content lives. That trades git history for consistency; the nightly export (§8)
includes the roles table, so grants remain auditable after the fact.

### The forms

At `/admin/`, static pages on Pages talking to Convex:

- **Event** — title, tag (select, from `event_types.yml`, so a typo cannot create a
  dead filter chip), date, end date, time, where, who, speaker link, description,
  bio, links, image.
- **Publication** — title, authors, venue, date, url, tags (multi-select against the
  controlled vocabulary), plus slides/code/comments/selected/short/key/citations/rate.
  Paste a DOI or arXiv id to prefill. (arXiv throttles parallel requests — fetch
  serially.)
- **Image upload** — Convex file storage, served from its CDN. Simpler than
  committing binaries to the repo, and it drops the resize-before-commit step.
- **Queue** — pending submissions with Publish / Edit / Reject.

Build question, unchanged: plain ES modules + the Convex browser client (no build
step, matches this repo) versus Vite + React (better for multi-field forms; one
extra step in `deploy.yml`, which already runs Actions, plus npm and a lockfile in a
repo that has neither).

## 7. Triggering the rebuild

A Convex action calls `POST /repos/Columbia-DAP-Lab/Columbia-DAP-Lab.github.io/dispatches`
with `event_type: "content-updated"`; `deploy.yml` adds `repository_dispatch` to its
triggers. The token is a GitHub App installation token or a fine-grained PAT with
`contents: write`, stored in Convex env vars — the only GitHub credential in the
system, and it can no longer write file contents if scoped to dispatch alone.

Debounce: publishing five items in a row should not queue five builds. Schedule the
dispatch 60 seconds out and cancel any pending one. `deploy.yml`'s existing
`concurrency` block with `cancel-in-progress` already collapses overlapping runs.

## 8. When the fetch fails

A build that cannot reach Convex must not publish an events page with no events.

1. The fetch step retries a few times, then **fails the build**. Pages keeps serving
   the previous deploy — stale, not broken.
2. A nightly Action exports every table to `_data/snapshots/*.yml` and commits it.
   The build prefers live Convex and falls back to the snapshot if the fetch fails,
   so a Convex outage degrades to "yesterday's content" rather than a failed deploy.

The snapshot earns its keep twice over: it is the disaster-recovery copy, and it
restores a readable git history of content changes — `git log -p _data/snapshots/`
answers "when did this talk get added, and by whom", which the move to Convex
otherwise costs. It is **generated**; a header comment must say DO NOT EDIT, because
the next publish overwrites it.

## 9. Slack bot

Convex HTTP actions are served at `https://<deployment>.convex.site`, which Slack
points at directly — no DNS record, nothing to ask Columbia IT for.

- `POST /slack/events` — `app_mention`, `message.im`
- `POST /slack/actions` — button clicks

**Signature verification.** Slack signs the raw body:
`v0=HMAC-SHA256(secret, "v0:" + timestamp + ":" + rawBody)`. Read it with
`await request.text()` before parsing, verify with Web Crypto, reject timestamps
older than 5 minutes, compare in constant time.

**The 3-second problem.** Slack wants a 200 within 3 seconds and retries otherwise;
a Claude call will not finish that fast. Verify, enqueue, ack:

```ts
http.route({ path: "/slack/events", method: "POST", handler: httpAction(
  async (ctx, request) => {
    const raw = await request.text();
    if (!(await verifySlackSignature(request.headers, raw))) {
      return new Response("bad signature", { status: 401 });
    }
    const body = JSON.parse(raw);
    if (body.type === "url_verification") return new Response(body.challenge);
    if (await ctx.runMutation(internal.slack.alreadySeen, { id: body.event_id })) {
      return new Response(null, { status: 200 });     // a retry
    }
    await ctx.scheduler.runAfter(0, internal.slack.handleMention, { event: body.event });
    return new Response(null, { status: 200 });
  })});
```

Dedupe on `event_id` matters: Slack retries a slow endpoint up to three times, and
without it one announcement becomes three submissions.

**Extraction.** CAIL uses Gemini; use Claude — `@anthropic-ai/sdk` in a Node-runtime
action (`"use node"`), model `claude-opus-5-5`, structured outputs
(`output_config: { format: ... }`) against a JSON schema matching the event fields.
One call decides whether the thread describes an event and returns the fields; if a
required field is missing (title, date, time, location) the bot says which.

**Flow.** Tag `@daplab` → bot reacts :brain:, extracts, inserts a `pending` event,
replies in-thread with a preview and **Publish** / **Discard**. An editor's click
publishes; a non-editor's submission stays pending for the queue. Slack emails are
often department addresses rather than UNI logins, so keep CAIL's one-time linking
flow: the bot DMs an hour-long link to `/admin/slack-link`, a Google sign-in there
records the pairing.

Worth copying from CAIL: matching an update against upcoming events and those from
the last 60 days, so "room change for Silvia's talk" edits the right record and
proposes only the changed rows. Deliberately out of v1: the general Q&A mode.

## 10. Migration

One script, run once: read `_data/events.yml` and `_data/pubs.yml`, insert each row
as `status: "published"` with `submittedBy: "migration"`, verify the export endpoint
reproduces the files byte-for-byte modulo key order, then delete the originals and
add the fetch step. Keeping the round-trip honest before deleting anything is the
whole safety margin.

`scripts/sync_events.py` and `.github/workflows/sync.yml` — the defunct Google Sheet
sync — get deleted in the same change. Worth noting its failure mode as a warning:
a cron job against a service-account credential fails quietly and nobody notices
until someone looks at the site. Hence §8's hard failure and fallback.

## 11. What this trades away

Being explicit, because the gains are obvious and the losses are not:

- **Content leaves code review.** No PR, no diff, no `git revert` on a bad edit. The
  nightly snapshot restores history but not the gate; `status: "pending"` is the
  gate now.
- **Editing by hand stops working.** Today anyone with repo access can fix a typo in
  `_data/events.yml`. After this, that edit is silently overwritten by the next
  build. The admin UI must be good enough to be the only path, and everyone needs to
  know that.
- **The build depends on a third party.** Mitigated by §8, not eliminated.
- **A platform dependency.** If Convex is ever abandoned, the tables export to YAML
  and the repo goes back to being the source of truth — a day of work, not a
  rewrite. Keeping the field names identical to the YAML is what keeps that cheap.

## 12. Secrets

| Name | Purpose |
|---|---|
| `GITHUB_DISPATCH_TOKEN` | Triggering rebuilds |
| `SLACK_SIGNING_SECRET` | Request verification |
| `SLACK_BOT_TOKEN` | Posting replies |
| `ANTHROPIC_API_KEY` | Field extraction |
| `GOOGLE_CLIENT_ID` | Public by design; also in the page and `auth.config.ts` |

All in Convex environment variables. Nothing secret reaches the browser.

## 13. Cost

Convex's free plan covers 1M function calls, 20 GB-hours of action compute, 0.5 GB
of database and 1 GB of file storage per month. This workload is a few hundred calls
a month and a few megabytes of event photos. Anthropic usage is cents per
announcement. Expected steady state: **$0**.

## 14. Build order

1. **Schema + export endpoints.** Tables, seeded by the migration script, serving
   YAML that reproduces today's files exactly. Verifiable before anything else
   exists.
2. **Build-time fetch.** `deploy.yml` fetches instead of reading committed YAML;
   snapshot fallback; delete the old files. At this point the site is Convex-backed
   with no UI — content edits happen in the Convex dashboard.
3. **Auth + roles.** Google OIDC, roles table, capability checks.
4. **Submission forms and the review queue** at `/admin/`.
5. **`repository_dispatch`** on publish, with debounce.
6. **Slack bot.**

Steps 1–2 are the risky part and come first; if the round-trip does not reproduce
the current pages, nothing after it matters. Step 6 needs a Slack app and workspace;
nothing before it does.

## 15. Open questions

- **Admin UI build step** — plain ES modules or Vite (§6).
- **Notifications** — how editors learn a submission is pending: email, Slack
  channel, or a weekly digest.
- **Who owns the Google Cloud project** for the OAuth client. A lab-owned project
  survives people leaving; CAIL's lives in a personal one.
- **Which Slack workspace**, and whether it permits app installs without an admin
  request.
- **Startups** — leave in `_data/startups.yml` or migrate into `events` with a tag.
- **People** — stays in the repo for now, but it is the same shape and the same
  argument applies; a later phase could move it.
