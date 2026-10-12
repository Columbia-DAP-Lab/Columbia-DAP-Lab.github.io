/**
 * Publication dates from the source, for drafts the model read without one.
 *
 * Pasted text often has a paper's link but not its date, so the model leaves
 * the date out or falls back to January 1 of the venue's year. When a draft's
 * URL is an arXiv paper or a DOI, this asks arXiv (when it was first posted)
 * or Crossref (when the publisher dates it) and fills the date in, with a note
 * saying where it came from. Used by Quick add (convex/extract.ts) and the
 * Slack bot (convex/slack.ts); both run in the default runtime, which has fetch.
 *
 * arXiv throttles bursts from one address, so lookups run one at a time with a
 * pause between them.
 */

type Draft = { draft: Record<string, unknown>; warnings: string[] };

const ARXIV_ID = /(?:arxiv\.org\/(?:abs|pdf)\/|arxiv:\s*)(\d{4}\.\d{4,5})/i;
const DOI = /(?:doi\.org\/|doi:\s*)(10\.\d{4,9}\/[^\s"<>?#]+)/i;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Most lookups per read; a long paper list beyond this keeps the model's dates. */
const MAX_LOOKUPS = 12;
const PAUSE_MS = 1000;
const TIMEOUT_MS = 8000;

const pad = (n: number) => String(n).padStart(2, "0");

const fetchWithTimeout = async (url: string, init: RequestInit = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

/** The date arXiv first posted a paper (its v1), as YYYY-MM-DD. */
const fromArxiv = async (id: string): Promise<string | null> => {
  const response = await fetchWithTimeout(`https://export.arxiv.org/api/query?id_list=${id}`);
  if (!response.ok) return null;
  const entry = (await response.text()).split("<entry>")[1];
  return entry?.match(/<published>(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
};

/** The publisher's date for a DOI, as YYYY-MM-DD; a missing day or month reads as the 1st. */
const fromCrossref = async (doi: string): Promise<string | null> => {
  const response = await fetchWithTimeout(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
    headers: { "user-agent": "DAPLab website (https://daplab.cs.columbia.edu)" },
  });
  if (!response.ok) return null;
  const work = ((await response.json()) as { message?: Record<string, { "date-parts"?: number[][] }> }).message;
  const parts = (work?.["published-print"] ?? work?.["published-online"] ?? work?.issued)?.["date-parts"]?.[0];
  if (!parts?.[0]) return null;
  return `${parts[0]}-${pad(parts[1] ?? 1)}-${pad(parts[2] ?? 1)}`;
};

/** A date the model stood in for an unknown one: January 1, or the 1st with a warning about it. */
const isStandIn = (date: string, warnings: string[]) =>
  date.endsWith("-01-01") || (date.endsWith("-01") && warnings.some((w) => /date|month|first/i.test(w)));

const isPreprint = (venue: unknown) => typeof venue === "string" && /arxiv|preprint/i.test(venue);

/**
 * Fill in or correct paper drafts' dates from arXiv or Crossref. Changes the
 * drafts in place; a lookup that fails leaves the draft as the model wrote it.
 */
export const fillPublicationDates = async (drafts: Draft[]) => {
  let lookups = 0;
  for (const item of drafts) {
    const { draft, warnings } = item;
    const url = typeof draft.url === "string" ? draft.url : "";
    const current = typeof draft.pubDate === "string" && ISO.test(draft.pubDate) ? draft.pubDate : null;
    if (current !== null && !isStandIn(current, warnings)) continue;

    const arxiv = url.match(ARXIV_ID)?.[1];
    const doi = arxiv ? undefined : url.match(DOI)?.[1];
    if (!arxiv && !doi) continue;
    if (lookups >= MAX_LOOKUPS) break;
    if (lookups > 0) await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    lookups++;

    let found: string | null = null;
    try {
      found = arxiv ? await fromArxiv(arxiv) : await fromCrossref(doi!);
    } catch (error) {
      console.warn("Publication date lookup failed", { url, error: error instanceof Error ? error.message : String(error) });
    }
    if (found === null) continue;
    const source = arxiv ? `arXiv (first posted ${found})` : `the publisher (${found})`;

    // An arXiv date is when the preprint appeared, which can be a year before the
    // venue. Take it for a preprint, when there was no date, or when it falls in
    // the year the model guessed; otherwise keep the guess and mention it.
    const sameYear = current !== null && current.slice(0, 4) === found.slice(0, 4);
    if (current === null || !arxiv || isPreprint(draft.venue) || sameYear) {
      draft.pubDate = found;
      item.warnings = [
        ...warnings.filter((w) => !/january 1|first day|first of|inferred|date/i.test(w)),
        `Date from ${source}.`,
      ];
    } else {
      item.warnings = [...warnings, `arXiv first posted it on ${found}, a different year; check the date.`];
    }
  }
};
