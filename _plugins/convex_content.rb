# frozen_string_literal: true

# Load the site's content from Convex during the build: events, publications,
# people, news, event series and badge colors into site.data, and projects into the
# projects collection. Nothing is read from or written to _data/ or _projects/*.md;
# the templates see exactly what they saw when those were files.
#
# The deployment is `convex.site_url` in _config.yml (production). CONVEX_SITE_URL
# overrides it, e.g. `CONVEX_SITE_URL=https://agreeable-stork-479.convex.site` to
# build from dev. Every build and every `jekyll serve` regeneration fetches fresh.
#
# If Convex cannot be reached, or returns something that looks broken, the build
# stops. On GitHub Pages that leaves the last good deploy serving: stale, never
# half-empty.
#
# Images are stored in Convex too (people photos, event images, series logos,
# project images, and anything uploaded on the admin page), but visitors do not
# load them from Convex: every Convex file URL in the content is downloaded into
# .convex-media/ and published with the site as /media/<file id>.<ext>. A stored
# file never changes under its id, so each is downloaded once and then cached
# (deploy.yml keeps .convex-media/ between builds), and Convex's bandwidth is spent
# on builds, not page views.

require "fileutils"
require "json"
require "net/http"
require "uri"

module ConvexContent
  # payload key => site.data key, which is what the templates read
  DATA = {
    "events" => "events",
    "publications" => "pubs",
    "people" => "people",
    "news" => "news",
    "eventSeries" => "event_types",
    "fieldColors" => "field_colors",
  }.freeze

  # Never legitimately empty: an empty one means a broken or wrong deployment, and
  # publishing it would blank a page. News may be empty.
  REQUIRED = %w[events publications people eventSeries fieldColors projects].freeze

  ATTEMPTS = 3

  # A Convex file URL: https://<deployment>.convex.cloud/api/storage/<uuid>
  STORAGE_URL = %r{https://[a-z0-9-]+\.convex\.cloud/api/storage/([0-9a-f-]{36})}
  MEDIA_DIR = ".convex-media"
  EXTENSIONS = {
    "image/jpeg" => ".jpg", "image/png" => ".png", "image/gif" => ".gif", "image/webp" => ".webp",
    "image/avif" => ".avif", "image/svg+xml" => ".svg",
  }.freeze

  # A project page whose front matter and body come from Convex rather than a file.
  #
  # It is given the exact text the project's Markdown file used to hold, and parses
  # it with Jekyll's own front-matter pattern and YAML loader, so its data and
  # content are what the file produced, down to the whitespace Jekyll's pattern
  # swallows after the closing `---`. Everything else about reading it (front
  # matter defaults, date parsing, title, excerpt) is Jekyll's normal path.
  class ProjectDocument < Jekyll::Document
    def initialize(path, relations, source:)
      super(path, relations)
      @source = source
    end

    private

    def read_content(**)
      self.content = @source
      return unless content =~ YAML_FRONT_MATTER_REGEXP

      self.content = Regexp.last_match.post_match
      front_matter = SafeYAML.load(Regexp.last_match(1))
      merge_data!(front_matter, source: "Convex") if front_matter
    end
  end


  module_function

  # The Markdown a project used to be stored as: front matter, a blank line, body.
  def markdown(project)
    front = project.fetch("frontMatter").to_yaml.sub(/\A---\n/, "")
    "---\n#{front}---\n\n#{project.fetch('body')}\n"
  end

  def site_url(site)
    override = ENV["CONVEX_SITE_URL"].to_s.strip
    return override unless override.empty?

    site.config.dig("convex", "site_url").to_s.strip
  end

  def fetch(url)
    last_error = nil
    ATTEMPTS.times do |attempt|
      sleep(2**attempt) if attempt.positive?
      begin
        response = Net::HTTP.get_response(URI("#{url}/content.json"))
        raise "HTTP #{response.code}" unless response.is_a?(Net::HTTPSuccess)

        payload = JSON.parse(response.body)
        missing = (DATA.keys + ["projects"]).reject { |key| payload[key].is_a?(Array) || payload[key].is_a?(Hash) }
        raise "payload missing #{missing.join(', ')}" unless missing.empty?

        empty = REQUIRED.select { |key| payload.fetch(key).empty? }
        raise "no #{empty.join(', ')} in it" unless empty.empty?

        return response.body
      rescue StandardError => e
        last_error = e
        Jekyll.logger.warn "Convex:", "attempt #{attempt + 1}/#{ATTEMPTS} failed: #{e.message}"
      end
    end
    raise Jekyll::Errors::FatalException, "Could not load content from #{url}: #{last_error&.message}"
  end

  # Download a stored file into the cache unless it is already there; returns the
  # file name, or nil for something that is not an image.
  def cache_file(url, uuid, dir)
    cached = Dir.glob(File.join(dir, "#{uuid}.*")).first
    return File.basename(cached) if cached

    uri = URI(url)
    3.times do
      response = Net::HTTP.get_response(uri)
      if response.is_a?(Net::HTTPRedirection)
        uri = URI(response["location"])
        next
      end
      raise "HTTP #{response.code}" unless response.is_a?(Net::HTTPSuccess)

      ext = EXTENSIONS[response.content_type]
      return nil if ext.nil?

      name = "#{uuid}#{ext}"
      File.binwrite(File.join(dir, name), response.body)
      return name
    end
    raise "too many redirects"
  rescue StandardError => e
    raise Jekyll::Errors::FatalException, "Could not download #{url}: #{e.message}"
  end

  # Replace every Convex file URL in the raw content with the site's own copy,
  # registering each copy as a static file so it is published at /media/.
  def localize_media(site, text)
    root = site.in_source_dir(MEDIA_DIR)
    dir = File.join(root, "media")
    FileUtils.mkdir_p(dir)
    count = 0
    localized = text.gsub(STORAGE_URL) do |url|
      name = cache_file(url, Regexp.last_match(1), dir)
      next url if name.nil?

      unless site.static_files.any? { |f| f.path == File.join(dir, name) }
        site.static_files << Jekyll::StaticFile.new(site, root, "media", name)
        count += 1
      end
      "/media/#{name}"
    end
    Jekyll.logger.info "Convex:", "#{count} images published under /media/" if count.positive?
    localized
  end

  def load(site)
    url = site_url(site)
    raise Jekyll::Errors::FatalException, "No Convex deployment: set convex.site_url in _config.yml" if url.empty?

    payload = JSON.parse(localize_media(site, fetch(url)))
    DATA.each { |key, name| site.data[name] = payload.fetch(key) }

    projects = site.collections.fetch("projects")
    # Any leftover project Markdown on disk (from before content came from Convex)
    # would duplicate these; Convex is the only source.
    projects.docs.reject! { |doc| doc.extname == ".md" }
    payload.fetch("projects").each do |project|
      slug = project.fetch("slug")
      doc = ProjectDocument.new(
        site.in_source_dir("_projects", slug, "#{slug}.md"),
        { site: site, collection: projects },
        source: markdown(project),
      )
      doc.read
      projects.docs << doc
    end
    projects.docs.sort!

    Jekyll.logger.info "Convex:", "#{payload.fetch('events').size} events, #{payload.fetch('publications').size} " \
                                  "publications, #{payload.fetch('people').size} people, " \
                                  "#{payload.fetch('projects').size} projects from #{url}"
  end
end

Jekyll::Hooks.register :site, :post_read do |site|
  ConvexContent.load(site)
end
