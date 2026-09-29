# DAPLab admin service — design

Status: proposal, not built. Written 2026-09-29.

Adapts three features from [CAIL's site](https://cail.columbia.edu) to daplabsite:
Columbia/Google login, a Slack bot that files events from channel messages, and a
web GUI for adding events and publications.

## 1. The constraint that shapes everything

CAIL is a Flask app that renders YAML on every request, running on a DigitalOcean
droplet it controls. Its admin panel and Slack bot write YAML files on that box; a
cron job commits them to GitHub every 5 minutes.

daplabsite is Jekyll on GitHub Pages. There is no server and no runtime — Pages
builds the site on push and serves static files. Every one of these three features
needs code running somewhere with a public HTTPS URL.

The host chosen is **Convex**. Convex is TypeScript-only, so none of CAIL's Python
ports over; `admin.py` and `slack_bot.py` become design references, not source. What
does carry over is CAIL's *model*: capability-based roles in a YAML file, a
link-your-Slack-account flow, drafts that wait for a human click, and git as the
audit log.

Two things Convex does **not** do, which the design has to route around:

- It does not host web pages. Convex serves functions and an HTTP endpoint, not a
  frontend. The admin UI has to live somewhere else — see §6.
- It has no filesystem and no git. Writes go to the repo through the GitHub API.

## 2. Architecture

```
                      ┌──────────────────────────────┐
  Slack workspace ───▶│ Convex deployment            │
   @daplab mention    │                              │
                      │  http.ts   /slack/events     │──┐
  Browser ───────────▶│            /slack/actions    │  │
   /admin/ on the     │  auth      Google OIDC       │  │ Anthropic API
   Pages site         │  db        drafts, roles,    │  │ (field extraction)
   (Convex client)    │            slack links,      │◀─┘
                      │            dedupe            │
                      │  actions   github.ts         │
                      └──────────────┬───────────────┘
                                     │ GitHub REST API
                                     ▼
                      ┌──────────────────────────────┐
                      │ Columbia-DAP-Lab.github.io   │
                      │  _data/events.yml  (commit)  │
                      │  _data/pubs.yml    (PR)      │
                      └──────────────┬───────────────┘
                                     │ push triggers Pages build
                                     ▼
                            daplab.cs.columbia.edu
```

The public site is untouched. Every write is a git commit, so `git log` and `git
revert` are the audit trail and the undo button, exactly as with a hand edit.

## 3. Repo is the source of truth

CAIL treats its server's `data/` as authoritative and pushes to GitHub. This design
inverts that: **the repo is authoritative and Convex holds no content**, only
transient state:

| Convex table | Holds | Lifetime |
|---|---|---|
| `drafts` | Proposed events awaiting a Slack click | 14 days |
| `slackLinks` | Slack user id → login email | Until revoked |
| `slackEvents` | Seen Slack `event_id`s, for retry dedupe | 24 hours |
| `rolesCache` | `_data/roles.yml`, fetched from GitHub | 5 minutes |

Consequences worth naming: there is no reconciliation problem and no "server vs.
git" race, but every read of current events costs a GitHub API call (cached), and
Convex going down means no admin UI and no Slack bot — it does not mean the site
goes down.

## 4. Auth

**Not Convex Auth.** It is still beta, and the admin UI is a static page with no
server to hold a session. Use Google's OIDC ID tokens directly:

1. The `/admin/` page renders Google Identity Services' Sign In With Google button.
2. Google returns an ID token (a JWT, `iss: https://accounts.google.com`).
3. `convex/auth.config.ts` declares Google as an OIDC provider, so Convex validates
   the token itself and exposes the claims via `ctx.auth.getUserIdentity()`.
4. Every mutation checks `identity.email` against roles.

No Convex Auth dependency, no session cookies, no secret in the browser.

Because LionMail is Columbia's Google Workspace, `uni@columbia.edu` sign-in goes
through Columbia's login page with Duo automatically. This is what CAIL means by
"Columbia login" — it is not Shibboleth/CAS, which would need Columbia IT to
register the service. If true CAS is a requirement later, it replaces this section
and nothing else.

Enforce the domain server-side: reject any identity whose email does not end in
`@columbia.edu` unless it is explicitly listed in `roles.yml` (for outside
collaborators). Checking `hd` in the browser proves nothing.

### Roles

New file, `_data/roles.yml`, mirroring CAIL's model:

```yaml
admins:            # events + publications + roles
  - ew2493@columbia.edu
event_editors:     # events only
  - someone@columbia.edu
pub_editors:       # publications only
  - someone-else@columbia.edu
```

Checked into git, so a grant is a reviewable commit and takes effect on the next
cache refresh (5 min, or bust the cache on write). Capabilities are recomputed per
request — removing an email revokes access immediately.

## 5. Writing to the repo

### Credentials

A **GitHub App** installed on the one repo, with `contents: write` and
`pull_requests: write`. Convex stores the app id and private key as environment
variables and mints a short-lived installation token per write. A fine-grained PAT
on a machine account is the simpler alternative; it trades token rotation for
setup time. Not a personal PAT on a human account — commits would be attributed to
that person and the token would carry their whole account.

Commits are authored as `DAPLab Bot <bot@daplab.cs.columbia.edu>` with the acting
person's name and email in the commit message trailer:

```
Add seminar: Raphael Shu, Sept 29

Added via /admin by ew2493@columbia.edu
```

### Two write paths, per the decision

- **Events → commit directly to `main`.** Time-sensitive, low-risk, live in about a
  minute once Pages rebuilds.
- **Publications → open a PR.** Long-lived records; a human merges. The UI returns
  the PR link and says the change is not live yet.

### Preserving comments

`_data/events.yml` and `_data/pubs.yml` open with hand-written field documentation,
and `people.yml` has comments mid-file. `js-yaml` discards all of it on round-trip.
Use the [`yaml`](https://www.npmjs.com/package/yaml) package's `parseDocument()`
API, which preserves comments and formatting — the TypeScript equivalent of
`ruamel.yaml` in round-trip mode.

Keep the single-list files as they are. Do **not** split into `_data/events/*.yml`:
a Jekyll data *directory* makes `site.data.events` a hash keyed by filename rather
than a list, which breaks `events.html`'s sort and its `concat` with
`site.data.startups`.

Insertion follows the file's existing order — `events.yml` is newest-first by date,
`pubs.yml` likewise — so a new record is spliced at the right index, not appended.

### Concurrency

The GitHub contents API takes the blob `sha` you read. If someone else committed in
between, the write 409s. Handle it by re-reading, re-applying the edit to the new
content, and retrying — up to 3 times, then surface the conflict. Two editors
saving different events seconds apart is the common case and resolves silently.

## 6. Admin UI

The UI is a static page; only Convex functions touch secrets. Where the page is
built is the one open question in this design:

**Option A — no build step (recommended to start).** A hand-written
`admin/index.html` in the Jekyll site, using `convex/browser`'s `ConvexClient` and
Google Identity Services loaded as ES modules from a CDN, with plain DOM code or
Preact + `htm`. Matches the repo's current no-build-tooling character; costs some
ergonomics on forms.

**Option B — Vite + React.** Switch Pages from "deploy from branch" to a GitHub
Actions workflow that runs both `jekyll build` and `vite build`, publishing the
admin bundle under `/admin/`. Better DX for multi-field forms and the Convex React
hooks; adds a build pipeline and changes how the whole site deploys.

Either way the page must be excluded from the site nav and from `sitemap.xml`.
Obscurity is not the control — every mutation authorizes server-side — but an admin
form does not belong in search results.

Forms needed:

- **Event** — the fields in `_data/events.yml`'s header comment: `title`, `tag`
  (select, from `event_types.yml`), `who`, `wholink`, `date`, `end_date`, `time`,
  `where`, `link`, `description`, `bio`, `image`, `video`, `slides`. Tag comes from
  a select so a typo cannot create a dead filter chip on `/events`.
- **Publication** — `title`, `authors`, `conf`, `pub_date`, `url`, `tags` (multi-
  select against the controlled vocabulary in `pubs.yml`'s header: `ai`, `sys`,
  and the rest), plus optional `slides`, `code`, `comments`, `selected`, `short`,
  `key`, `citations`, `rate`. Worth adding: paste a DOI or arXiv ID and prefill.
  (arXiv's API throttles parallel requests — fetch serially.)
- **Image upload** — events take an `image` path under `files/images/events/`.
  Upload writes the binary through the same GitHub API commit. Resize to a sane
  width first, as CAIL's `admin._save_photo` does.

## 7. Slack bot

### Endpoints

Convex HTTP actions are served at `https://<deployment>.convex.site`, which Slack
can point at directly — **no DNS record needed**, and nothing to ask Columbia IT
for.

- `POST /slack/events` — `app_mention` and `message.im`
- `POST /slack/actions` — interactive button clicks

### Signature verification

Slack signs the **raw** body: `v0=HMAC-SHA256(signing_secret, "v0:" + timestamp +
":" + rawBody)`. Read it with `await request.text()` before any JSON parsing, verify
with Web Crypto, and reject timestamps older than 5 minutes. Compare in constant
time.

### The 3-second problem

Slack requires a 200 within 3 seconds and retries otherwise; a Claude call will not
finish that fast. So: verify, enqueue, ack.

```ts
// convex/http.ts (sketch)
http.route({ path: "/slack/events", method: "POST", handler: httpAction(
  async (ctx, request) => {
    const raw = await request.text();
    if (!(await verifySlackSignature(request.headers, raw))) {
      return new Response("bad signature", { status: 401 });
    }
    const body = JSON.parse(raw);
    if (body.type === "url_verification") {
      return new Response(body.challenge);   // Slack's setup handshake
    }
    if (await ctx.runMutation(internal.slack.alreadySeen, { id: body.event_id })) {
      return new Response(null, { status: 200 });   // a retry; ignore
    }
    await ctx.scheduler.runAfter(0, internal.slack.handleMention, { event: body.event });
    return new Response(null, { status: 200 });
  })});
```

Dedupe on `event_id` matters: Slack retries a slow endpoint up to 3 times, and
without it one announcement becomes three drafts.

Action time limits are generous — 30 minutes in the Convex runtime, 10 in Node —
so the background handler has room.

### Extraction

CAIL uses Gemini. Use Claude instead: `@anthropic-ai/sdk` in a Node-runtime action
(`"use node"`), model `claude-opus-5-5`, with structured outputs
(`output_config: { format: ... }`) against a JSON schema matching the event fields.
One call decides whether the thread describes an event and, if so, returns the
fields; if the thread is missing a required field (title, date, time, location) the
bot names what is missing in its reply.

Cost is negligible at this volume — Opus 5.5 is $4/$20 per million tokens, and a
thread plus schema is a few thousand tokens. Rough order: a cent or two per
announcement.

### Flow

1. Someone posts an announcement and tags `@daplab`.
2. Bot adds :brain:, extracts fields, writes a `drafts` row, replies in-thread with
   a preview and **Add event** / **Cancel**, removes :brain:.
3. A click hits `/slack/actions`. The bot maps the Slack user to a login email via
   `slackLinks`, checks `roles.yml`, and on success commits to `main` and replaces
   the preview with a confirmation and a link to the event.
4. Anyone may tag the bot; only editors may confirm. An unlinked editor gets an
   ephemeral link to `/admin/slack-link`, where a Google sign-in records the pairing
   — CAIL's flow, and worth keeping, because Slack emails are routinely department
   addresses rather than UNI logins.

Worth copying from CAIL: matching an update against upcoming events and those from
the last 60 days, so "room change for Silvia's talk" edits the right record and
proposes only the changed rows.

Scope deliberately left out of v1: the "ask it anything" Q&A mode. It is the part of
CAIL's bot that needs the whole people directory in context, and it earns its keep
only once the event path is trusted.

## 8. Secrets

All in Convex environment variables (512 max, 8 KiB each — ample):

| Name | Purpose |
|---|---|
| `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_INSTALLATION_ID` | Repo writes |
| `SLACK_SIGNING_SECRET` | Request verification |
| `SLACK_BOT_TOKEN` | Posting replies |
| `ANTHROPIC_API_KEY` | Field extraction |
| `GOOGLE_CLIENT_ID` | Public; also in the page, and in `auth.config.ts` |

No secret reaches the browser. The Google client id is public by design.

## 9. Cost

Convex's free plan covers 1M function calls and 20 GB-hours of action compute per
month; this workload is a few hundred calls a month. Anthropic usage is cents.
Expected steady state: **$0**, with the Convex Pro plan ($25/mo) only if a custom
domain on the OAuth consent screen is wanted.

Compare: CAIL's droplet is roughly $6–12/month plus patching, TLS renewal, uptime
monitoring, and a sync cron. The tradeoff is a platform dependency — if Convex is
ever abandoned, the Slack endpoints and admin UI move, but the content is all in
git and the public site never depended on any of it.

## 10. Build order

1. **Convex project + GitHub write path.** One mutation that appends a test event to
   `_data/events.yml` on a branch, with comment preservation and conflict retry
   proven. This is the load-bearing piece; everything else is UI on top.
2. **Auth + roles.** `auth.config.ts`, `_data/roles.yml`, capability checks.
3. **Event form** at `/admin/`, writing to `main`.
4. **Publication form**, opening PRs. DOI/arXiv prefill after the basic form works.
5. **Slack bot.** Manifest, endpoints, signature verification, dedupe, extraction,
   buttons, account linking.

Steps 1–4 are testable end to end locally against a scratch branch. Step 5 needs the
Slack app and a real workspace; nothing before it does.

## 11. Open questions

- **UI build step** — Option A or B in §6.
- **Who administers the Google Cloud project** for the OAuth client. CAIL's lives in
  a personal project; a lab-owned one survives people leaving.
- **Which Slack workspace**, and whether it permits app installs without an admin
  request.
- **People and blog posts** — out of scope here. `_data/people.yml` has the same
  shape as events and could get a form later; `_posts/` is Markdown with front
  matter and is a different problem.
- **`_data/roles.yml` is public** in a public repo. It lists lab members' emails,
  which are already on the site, but it also advertises who can write. If that is
  unwanted, the roles list moves into Convex and loses its git history.
