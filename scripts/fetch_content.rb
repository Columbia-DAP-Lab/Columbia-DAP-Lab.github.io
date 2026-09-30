#!/usr/bin/env ruby
# frozen_string_literal: true

# Fetch the site's content from Convex and write it where Jekyll reads it.
#
# Convex is the only source of events, publications, people, news and projects;
# nothing in the repo stands in for it. This writes _data/*.yml and
# _projects/<slug>/<slug>.md, which are build output: gitignored, overwritten
# every run, and never committed. Run it before any Jekyll build:
#
#   ruby scripts/fetch_content.rb
#
# .github/workflows/deploy.yml does so on every build. The deployment comes from
# `convex.site_url` in _config.yml, the same place the admin page reads its URL
# from. CONVEX_SITE_URL overrides it, e.g. to build a local copy from dev:
#
#   CONVEX_SITE_URL=https://<deployment>.convex.site ruby scripts/fetch_content.rb
#
# If Convex cannot be reached, or returns something that looks broken, this exits
# non-zero and the build stops. GitHub Pages then keeps serving the last good
# deploy: stale, never half-empty.

require "fileutils"
require "json"
require "net/http"
require "uri"
require "yaml"

SITE_URL = (ENV["CONVEX_SITE_URL"].to_s.strip.then { |url| url.empty? ? nil : url } ||
            YAML.load_file(File.expand_path("../_config.yml", __dir__)).dig("convex", "site_url").to_s.strip)
ATTEMPTS = Integer(ENV.fetch("CONVEX_FETCH_ATTEMPTS", "3"))

# collection in the payload => the _data file it is written to
FILES = {
  "events" => "_data/events.yml",
  "publications" => "_data/pubs.yml",
  "people" => "_data/people.yml",
  "news" => "_data/news.yml",
  "eventSeries" => "_data/event_types.yml",
  "fieldColors" => "_data/field_colors.yml",
}.freeze

# Collections that are never legitimately empty: an empty one means a broken or
# wrong deployment, and publishing it would blank a page. News may be empty.
REQUIRED = %w[events publications people eventSeries fieldColors projects].freeze

def fail_build(message)
  warn "::error::#{message}" if ENV["GITHUB_ACTIONS"]
  abort "fetch_content: #{message}"
end

def fetch_payload(url)
  last_error = nil
  ATTEMPTS.times do |attempt|
    sleep(2**attempt) if attempt.positive?
    begin
      response = Net::HTTP.get_response(URI("#{url}/content.json"))
      raise "HTTP #{response.code}" unless response.is_a?(Net::HTTPSuccess)

      payload = JSON.parse(response.body)
      missing = (FILES.keys + ["projects"]).reject { |key| payload[key].is_a?(Array) || payload[key].is_a?(Hash) }
      raise "payload missing #{missing.join(', ')}" unless missing.empty?

      return payload
    rescue StandardError => e
      last_error = e
      warn "attempt #{attempt + 1}/#{ATTEMPTS} failed: #{e.message}"
    end
  end
  raise last_error || "unreachable"
end

fail_build("no Convex deployment: set convex.site_url in _config.yml") if SITE_URL.empty?

payload =
  begin
    fetch_payload(SITE_URL)
  rescue StandardError => e
    fail_build("could not fetch content from #{SITE_URL} (#{e.message})")
  end

empty = REQUIRED.select { |key| payload.fetch(key).empty? }
fail_build("Convex returned no #{empty.join(', ')} from #{SITE_URL}") unless empty.empty?

FileUtils.mkdir_p("_data")
FILES.each do |key, path|
  rows = payload.fetch(key)
  header = <<~HEADER
    # Generated from Convex by scripts/fetch_content.rb; not committed. Edit content
    # at /admin/ instead: this file is rewritten on every build.
  HEADER
  File.write(path, header + rows.to_yaml.sub(/\A---\n/, ""))
  puts "#{path}: #{rows.size} records"
end

# Projects are a Jekyll collection, not a data file: each is a Markdown document
# with front matter that renders into its own page.
#
# Only the .md is written. Images committed beside it (named by `avatar`) stay in
# the repo, and the collection copies them verbatim. A project no longer in
# Convex has its Markdown removed so the page goes away; nothing else in the
# directory is touched.
written = payload.fetch("projects").map do |project|
  slug = project.fetch("slug")
  dir = File.join("_projects", slug)
  FileUtils.mkdir_p(dir)
  path = File.join(dir, "#{slug}.md")
  front = project.fetch("frontMatter").to_yaml.sub(/\A---\n/, "")
  File.write(path, "---\n#{front}---\n\n#{project.fetch('body')}\n")
  path
end
(Dir.glob("_projects/*/*.md") - written).each do |stale|
  puts "removing #{stale}: no longer in Convex"
  File.delete(stale)
end
puts "_projects: #{written.size} documents"

puts "content generated at #{payload['generatedAt']} from #{SITE_URL}"
