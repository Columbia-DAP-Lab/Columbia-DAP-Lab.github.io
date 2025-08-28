# Columbia DAP Lab Website

The official website for the Data, Agents, and Processes Lab (DAPLab) at Columbia University.

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

### Project Structure

- `_data/` - Data files (people, publications, events, etc.)
- `_includes/` - Reusable HTML components
- `_layouts/` - Page templates
- `files/` - Static assets (CSS, images, JS)
- `_config.yml` - Jekyll configuration
- `Gemfile` - Ruby dependencies
- `docker-compose.yml` - Docker configuration

