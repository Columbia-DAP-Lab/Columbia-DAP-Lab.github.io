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

        return payload
      rescue StandardError => e
        last_error = e
        Jekyll.logger.warn "Convex:", "attempt #{attempt + 1}/#{ATTEMPTS} failed: #{e.message}"
      end
    end
    raise Jekyll::Errors::FatalException, "Could not load content from #{url}: #{last_error&.message}"
  end

  def load(site)
    url = site_url(site)
    raise Jekyll::Errors::FatalException, "No Convex deployment: set convex.site_url in _config.yml" if url.empty?

    payload = fetch(url)
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
