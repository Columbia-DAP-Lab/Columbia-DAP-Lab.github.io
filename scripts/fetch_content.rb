#!/usr/bin/env ruby
# frozen_string_literal: true

# Fetch published content from Convex and write it into _data/ for the Jekyll build.
#
# Run by .github/workflows/deploy.yml before `jekyll build`. The files it writes are
# build output: they are overwritten every run and never committed by this script.
#
#   CONVEX_SITE_URL=https://<deployment>.convex.site ruby scripts/fetch_content.rb
#
# If Convex cannot be reached after several tries, the committed _data/*.yml are
# left in place and the build continues against them. They are a full, valid
# snapshot — refreshed nightly by .github/workflows/snapshot.yml — so the failure
# mode is content up to a day old rather than a page with no events on it.

require "json"
require "net/http"
require "uri"
require "yaml"

SITE_URL = ENV["CONVEX_SITE_URL"].to_s.strip
ATTEMPTS = Integer(ENV.fetch("CONVEX_FETCH_ATTEMPTS", "3"))
STRICT = ENV["CONVEX_FETCH_STRICT"] == "1"

# collection in the payload => the _data file it is written to
FILES = {
  "events" => "_data/events.yml",
  "publications" => "_data/pubs.yml",
  "people" => "_data/people.yml",
  "news" => "_data/news.yml",
  "eventSeries" => "_data/event_types.yml",
  "fieldColors" => "_data/field_colors.yml",
}.freeze

def warn_loudly(message)
  warn "::warning::#{message}" if ENV["GITHUB_ACTIONS"]
  warn message
end

def fetch_payload(url)
  last_error = nil
  ATTEMPTS.times do |attempt|
    sleep(2**attempt) if attempt.positive?
    begin
      response = Net::HTTP.get_response(URI("#{url}/content.json"))
      raise "HTTP #{response.code}" unless response.is_a?(Net::HTTPSuccess)

      payload = JSON.parse(response.body)
      missing = FILES.keys.reject { |key| payload[key].is_a?(Array) || payload[key].is_a?(Hash) }
      raise "payload missing #{missing.join(', ')}" unless missing.empty?

      return payload
    rescue StandardError => e
      last_error = e
      warn "attempt #{attempt + 1}/#{ATTEMPTS} failed: #{e.message}"
    end
  end
  raise last_error || "unreachable"
end

def give_up(message)
  raise message if STRICT

  warn_loudly("#{message} — building from the committed _data/*.yml snapshot instead")
  exit 0
end

give_up("CONVEX_SITE_URL is not set") if SITE_URL.empty?

payload =
  begin
    fetch_payload(SITE_URL)
  rescue StandardError => e
    give_up("could not fetch content from Convex (#{e.message})")
  end

FILES.each do |key, path|
  rows = payload.fetch(key)
  # An empty collection is more likely a broken deployment than real news, and it
  # would silently blank a page. Keep what is committed.
  if rows.empty?
    warn_loudly("Convex returned no #{key}; keeping the committed #{path}")
    next
  end

  header = <<~HEADER
    # Fetched from Convex at build time by scripts/fetch_content.rb — DO NOT EDIT.
    # Edits here are overwritten on the next build. The #{key} table is the source
    # of truth; a committed copy is refreshed nightly as a fallback snapshot.
  HEADER

  File.write(path, header + rows.to_yaml.sub(/\A---\n/, ""))
  puts "#{path}: #{rows.size} records"
end

puts "content generated at #{payload['generatedAt']}"
