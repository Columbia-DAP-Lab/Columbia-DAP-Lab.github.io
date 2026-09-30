# Columbia DAP Lab Website

The website for the Data, Agents, and Processes Lab (DAPLab) at Columbia University:
[daplab.cs.columbia.edu](https://daplab.cs.columbia.edu).


## How the site works

The site is static HTML built by Jekyll and served by GitHub Pages. Its content lives
in two places:

- **In [Convex](https://convex.dev)**: events, publications, people, news and projects.
  They are added and edited through the [admin page](https://daplab.cs.columbia.edu/admin/).
- **In this repo**: blog posts, pages, layouts and styles.

On every build, `.github/workflows/deploy.yml` runs `scripts/fetch_content.rb`, which
fetches the published content from Convex and writes it into `_data/*.yml` and
`_projects/*/*.md` before Jekyll runs. Publishing something on the admin page
triggers that build, so a change is live in about a minute.

Those files are **generated and not in the repo** (they are gitignored): Convex is
the only copy the site reads. If Convex cannot be reached, the build fails and
GitHub Pages keeps serving the last good version.

Every night `.github/workflows/snapshot.yml` commits the public content feed to
`_backup/content.json`. The site never reads it; it is there so
`git log -p _backup/` shows what content changed and when, and as an off-Convex
copy of what the site publishes.

The design, and why it is built this way, is in
[`docs/admin-service-design.md`](docs/admin-service-design.md). That was written
before the build, so some details there have since changed.


## Adding and Editing Content

| Content | Where |
|---|---|
| Events | [Admin page](https://daplab.cs.columbia.edu/admin/) → **Events** |
| Publications | Admin page → **Papers** (a pasted list of papers becomes one draft each) |
| Your own People-page profile | Admin page → your email (top right) → **Edit profile** |
| A new person | Admin page → **People** (admins) |
| Blog posts | This repo: [Blog Posts](#blog-posts) below |
| Projects and software | Admin page → **Projects** (admins) |
| News | Convex, with no form yet: ask an admin (see below) |
| Pages, layouts, styles | This repo, by pull request |

For changes to the repo, test locally ([Developing locally](#developing-locally)),
open a pull request against
[Columbia-DAP-Lab.github.io](https://github.com/Columbia-DAP-Lab/Columbia-DAP-Lab.github.io),
and ask [@Alex-XJK](https://github.com/Alex-XJK/) (students, general questions) or
[@sirrice](https://github.com/sirrice) (faculty) to review. Talk to the maintainers
before large changes.


### The admin page

Sign in at [daplab.cs.columbia.edu/admin/](https://daplab.cs.columbia.edu/admin/) with
your Columbia Google account (`uni@columbia.edu`). Other Google accounts are refused.

- **Who can sign in.** Current lab members on the People page get in automatically:
  the name on their Columbia account is matched to their profile. Anyone else has to
  be added by an admin under **People → Users**.
- **Members** can add events and publications, and edit their own profile.
- **Admins** can also add people, review submissions, and manage users.
- **Everything is reviewed.** A member's submission, including a profile edit, is
  pending until an admin publishes it under **Submissions**.
- **Quick add.** Each form has a Quick add box at the top: paste an announcement, a
  citation list or a bio, press **Extract into form**, and a language model fills the
  form in. Nothing is submitted until you check the form and press **Submit for
  review**. Images are attached by hand.

Photos go in the upload field on the form. Square images under 5 MB work best.


### Projects

Admins create and edit projects under **Projects** on the admin page. A new project
is a draft until you publish it. Its short name becomes the address,
`/projects/<short-name>/`, and is fixed once the project is published. Upload a
card image in the form. **Insert image** puts a picture into the description.

Older projects keep their images in the repo, in `_projects/<slug>/`. Those images
are still served from there; only the `.md` beside them is generated.

### News

News is stored in Convex, but the admin page has no form for it yet. Until it
does, an admin edits it in the [Convex dashboard](https://dashboard.convex.dev)
(production deployment → **Data** → `news`).


## Blog Posts

To create a new blog post, follow these steps:

### 1. Create the post file
Create a new file in `_posts/` with the name format: `YYYY-MM-DD-slug.md` (e.g., `2026-01-16-my-great-post.md`).

### 2. Add front-matter
Include the following required fields at the top of your post:
```yaml
---
layout: post
title: "Your Post Title Here"
date: 2026-01-16
categories: [general]  # for organization
authors:
  - name: "Your Name"
    url: "https://your.website"  # optional
  - name: "Co-author Name"  # add more authors as needed
    url: "https://coauthor.website"  # optional
excerpt: "A brief summary of your post (appears in the blog list)."
slug: "my-great-post"  # Must match the filename slug
---
```

### 3. Write your content
Use standard Markdown syntax. For best readability, keep your article within ~900px width (this is enforced by the layout).

### 4. Add images
- Create a folder: `files/images/blog/{slug}/` (e.g., `files/images/blog/my-great-post/`)
- Place your images there
- In your post, reference images using the `blog-image` include:
  ```liquid
  {% include blog-image.html file="image-name.png" alt="Alt text here" %}
  ```
  This automatically generates: `{{ site.baseurl }}/files/images/blog/{{ page.slug }}/image-name.png`

**Optional parameters:**
- `slug`: Use a different post's slug to reference images from another blog (useful for reusing images):
  ```liquid
  {% include blog-image.html file="diagram.png" alt="Diagram" slug="my-other-post" %}
  ```
- `class`: Add CSS classes for styling (default is `img-fluid`):
  ```liquid
  {% include blog-image.html file="diagram.png" alt="Diagram" class="img-fluid shadow" %}
  ```

### 5. Link to other blog posts
Use Jekyll's standard `{% link %}` syntax to reference other posts:
```liquid
As {% link _posts/2026-01-01-my-other-post.md %} shows, ...
```

### 6. Add custom styles (optional)
You can define custom CSS directly in your post using a `<style>` block:
```html
<style>
.my-custom-class {
  color: #012169;
  font-weight: bold;
}
</style>

<p class="my-custom-class">This text will be styled.</p>
```

### 7. Test locally
See [Developing locally](#developing-locally) below.

### 8. Submit a Pull Request
Push your changes to a branch and open a PR for review.



## Developing locally

### Without Docker

Ruby is managed with [rbenv](https://github.com/rbenv/rbenv); the version is in
`.ruby-version` (which is gitignored, so copy it into a fresh checkout or worktree).

```bash
export PATH="$HOME/.rbenv/shims:$PATH"
bundle install
bundle exec jekyll serve --host localhost --drafts --future --trace
```

Then open http://localhost:4000. Use `localhost`, not `127.0.0.1`: Google sign-in on
the admin page accepts only the origins registered for it.

The content comes from Convex, so fetch it first, and again whenever you want
newer content. Without it, pages build but show no events, papers or people:

```bash
ruby scripts/fetch_content.rb
```

The fetched files are gitignored, so they never show up in `git status`. The Docker
setup below fetches on start. To build from the dev deployment instead, set
`CONVEX_SITE_URL=https://agreeable-stork-479.convex.site` for the fetch.

The admin page at http://localhost:4000/admin/ talks to the **production**
deployment (it reads `convex.url` in `_config.yml`), so anything you publish there
from a local copy is live. To try things out against the dev sandbox instead, layer
`_config.dev.yml` on top and fetch from dev:

```bash
CONVEX_SITE_URL=https://agreeable-stork-479.convex.site ruby scripts/fetch_content.rb
bundle exec jekyll serve --config _config.yml,_config.dev.yml --host localhost --drafts --future
```

### With Docker

This project uses Docker to provide a consistent development environment. Follow these steps to test changes locally:

#### Prerequisites

- [Docker](https://www.docker.com/get-started) installed on your system
- [Docker Compose](https://docs.docker.com/compose/install/) (usually included with Docker Desktop)

#### Quick Start

1. **Clone the repository** (if you haven't already):
   ```bash
   git clone https://github.com/Columbia-DAP-Lab/Columbia-DAP-Lab.github.io.git
   cd Columbia-DAP-Lab.github.io
   ```

2. **Start the development server**:
   ```bash
   docker compose up --build
   ```

3. **Access the site**:
   - Open your browser and go to: http://localhost:8080
   - The site will automatically reload when you make changes to files
   - LiveReload is available at: http://localhost:35729

#### Development commands

##### Start the site (with rebuild)
```bash
docker compose up --build
```

##### Start the site in the background
```bash
docker compose up -d
```

##### View logs
```bash
docker compose logs
docker compose logs --follow  # Follow logs in real-time
```

##### Stop the site
```bash
docker compose down
```

##### Restart after making changes
```bash
docker compose restart
```

##### Access the container shell (for debugging)
```bash
docker compose exec jekyll bash
```

#### Making Changes

1. Edit any file in the repository
2. The site will automatically regenerate (watch for changes in the logs)
3. Refresh your browser to see the changes
4. For `_config.yml` changes, restart the container:
   ```bash
   docker compose restart
   ```

#### Troubleshooting

##### Port already in use
If port 8080 is already in use, you can change it in `docker-compose.yml`:
```yaml
ports:
  - "3000:8080"  # Use port 3000 instead
```

##### Container won't start
```bash
# Clean up and rebuild
docker compose down
docker compose up --build
```

##### View detailed build logs
```bash
docker compose up --build --no-cache
```


## The Convex backend

The backend is in `convex/`. It holds the schema, the queries and mutations behind
the admin page, and the `/content.json` feed the build reads. There are two
deployments:

| Deployment | Role |
|---|---|
| `dutiful-turtle-748` (production) | Serves the live site and the admin page. Named in `_config.yml` under `convex:`. |
| `agreeable-stork-479` (dev) | A sandbox for trying backend changes. |

- `npx convex dev` pushes the code in your checkout to **dev**; `--once` pushes once
  without watching.
- `npx convex deploy` pushes to **production**, after asking you to confirm. Run it
  from an up-to-date `main`, after the change is merged.

Needs Node and `npm install`. Configuration is in deployment environment variables,
set with `npx convex env set [--prod] NAME value`:

| Variable | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID` | Google sign-in. Public; must match `admin.google_client_id` in `_config.yml`. |
| `GITHUB_REPOSITORY`, `GITHUB_DISPATCH_TOKEN` | Rebuilding the site after a publish. The token is a fine-grained token with Contents: read and write on this repo. |
| `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | Quick add. Any OpenAI-compatible endpoint; see `convex/llm.ts`. |

To copy the whole deployment, including users, drafts and uploaded files:

```bash
npx convex export --prod --include-file-storage --path backup.zip
```

The one-time scripts that imported the old `_data/*.yml` into Convex, and checked
that import, have been removed. They are in the git history if you need them.
