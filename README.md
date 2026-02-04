# Columbia DAP Lab Website

The official website for the Data, Agents, and Processes Lab (DAPLab) at Columbia University.


## Editing Content

After editing, please test your changes locally using Docker (see below), submit a Pull Request to [Columbia-DAP-Lab.github.io](https://github.com/Columbia-DAP-Lab/Columbia-DAP-Lab.github.io), and request [@Alex-XJK](https://github.com/Alex-XJK/) (for students or general inquiries) or [@sirrice](https://github.com/sirrice) (for faculty-related inquiries) to review and merge.

If you are adding a new feature or making significant changes, please talk to our maintaining team in advance.


### Contributing Your Profile

You can now add yourself or update your profile by editing the `_data/people.yml` file.

- For Faculty members:  
  ```yaml
  - name: Your Name
    homepage: (optional) https://your.website
    image: (optional) /files/images/avatar/your_image.jpg
    bio: >
      (optional) A brief multi-line introduction
    category: Faculty
    field: [CS, Systems...]  # comma-separated research fields
  ```

- For Postdoc and PhD Students:  
  If you are adding yourself as a **new** member, you must include **your supervisor's name** in your PR description for verification. Without that, your PR may be delayed or rejected!
  ```yaml
  - name: Your Name
    homepage: (optional) https://your.website
    image: (optional) /files/images/avatar/your_fullname.jpg
    category: Postdoc/PhD
  ```

- For MS/Undergraduate Students:  
  For **new** members, please ask your advisor or advising PhD to make the PR **on your behalf** for verification. Personal PRs will be directly rejected without review.
  ```yaml
  - name: Your Name
    image: (optional) /files/images/avatar/your_fullname.jpg
    category: Student
    advisor:
      - Advisor Name 1
      - Advisor Name 2  # add more if you have multiple advisors
  ```

Please upload your avatar image to `/files/images/avatar/` and use that full path above. Please ensure your image is in square format and appropriately sized *under 1MB* for the best display.

For Students and Researchers ordering: Since commit a92a4bc, for ease of maintenance, student categories no longer need to be sorted; Liquid will automatically sort them at deployment-time.


### Updating Publications

Edit `_data/pubs.yml` and follow the existing format to add your publications. Basically, you will need to provide the following information for each publication:
```yaml
- title: Title of the paper
  authors: name 1, name 2
  conf: conference name
  pub_date: "YYYY-MM-DD"
  url: url to the paper
  tags:
    - tag1
    - tag2
```
A explanation of the publication date: Only the year and month will be displayed, but you need to provide complete information for sorting purposes.


### Managing Events

To manage events,
- Edit the `_data/events.yml` file, or
- Add new events directly to the "website" table in the shared "Fall 2025 DAP Lab Seminar" Google Sheet. They will be automatically synced into the YAML file at 9 AM EST every day.

> Note: The Google Sheet method is temporarily disabled due to the low frequency of use after Sept. 9, 2025. Please edit the YAML file directly for now.

However, if you are in charge of regularly adding events (such as seminar organizers), please contact our maintaining team for further assistance.


### Adding Blog Posts

To create a new blog post, follow these steps:

#### 1. Create the post file
Create a new file in `_posts/` with the name format: `YYYY-MM-DD-slug.md` (e.g., `2026-01-16-my-great-post.md`).

#### 2. Add front-matter
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

#### 3. Write your content
Use standard Markdown syntax. For best readability, keep your article within ~900px width (this is enforced by the layout).

#### 4. Add images
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

#### 5. Link to other blog posts
Use Jekyll's standard `{% link %}` syntax to reference other posts:
```liquid
As {% link _posts/2026-01-01-my-other-post.md %} shows, ...
```

#### 6. Add custom styles (optional)
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

#### 7. Test locally
See the [Local Development with Docker](#local-development-with-docker) section below for complete testing instructions.

#### 8. Submit a Pull Request
Push your changes to a branch and open a PR for review.


## Local Development with Docker

This project uses Docker to provide a consistent development environment. Follow these steps to test changes locally:

### Prerequisites

- [Docker](https://www.docker.com/get-started) installed on your system
- [Docker Compose](https://docs.docker.com/compose/install/) (usually included with Docker Desktop)

### Quick Start

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

### Development Commands

#### Start the site (with rebuild)
```bash
docker compose up --build
```

#### Start the site in the background
```bash
docker compose up -d
```

#### View logs
```bash
docker compose logs
docker compose logs --follow  # Follow logs in real-time
```

#### Stop the site
```bash
docker compose down
```

#### Restart after making changes
```bash
docker compose restart
```

#### Access the container shell (for debugging)
```bash
docker compose exec jekyll bash
```

### Making Changes

1. Edit any file in the repository
2. The site will automatically regenerate (watch for changes in the logs)
3. Refresh your browser to see the changes
4. For `_config.yml` changes, restart the container:
   ```bash
   docker compose restart
   ```

### Troubleshooting

#### Port already in use
If port 8080 is already in use, you can change it in `docker-compose.yml`:
```yaml
ports:
  - "3000:8080"  # Use port 3000 instead
```

#### Container won't start
```bash
# Clean up and rebuild
docker compose down
docker compose up --build
```

#### View detailed build logs
```bash
docker compose up --build --no-cache
```
