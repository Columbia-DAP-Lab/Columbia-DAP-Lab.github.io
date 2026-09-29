/**
 * The canonical tag vocabulary, and the one-time mapping that gets the existing
 * data onto it.
 *
 * The messy spellings in _data/pubs.yml and _data/field_colors.yml are collapsed
 * here, during the import, rather than carried forward behind alias pointers. After
 * the migration every stored slug is canonical, so nothing resolves an alias at read
 * time and the admin UI can offer a closed list.
 *
 * Adding a tag later means adding a row to the `tags` table, not editing this file;
 * this is the seed and the migration map, not a runtime lookup.
 */

export type TagKind = "research" | "department" | "role" | "topic";

export type TagSeed = {
  slug: string;
  label: string;
  kind: TagKind;
  color?: string;
  description?: string;
  sortOrder?: number;
};

/**
 * Publication topics.
 *
 * The first five are the site's public filter buttons (see publications.md), so
 * their slugs are fixed — renaming one breaks the page. The rest are the
 * project-specific tags that pubs.yml's header explicitly allows, given real
 * labels.
 */
export const TOPIC_TAGS: TagSeed[] = [
  { slug: "ai", label: "Agent Intelligence", kind: "topic", sortOrder: 1 },
  { slug: "sys", label: "Agent-ready Systems", kind: "topic", sortOrder: 2 },
  { slug: "hac", label: "Human-agent Collaboration", kind: "topic", sortOrder: 3 },
  { slug: "automation", label: "Automation", kind: "topic", sortOrder: 4 },
  { slug: "whitepaper", label: "White & Position Papers", kind: "topic", sortOrder: 5 },

  { slug: "bench", label: "Benchmarks", kind: "topic" },
  { slug: "digi-twin", label: "Digital Twins", kind: "topic" },
  { slug: "agent-debug", label: "Agent Debugging", kind: "topic" },
  { slug: "safety", label: "Safety", kind: "topic" },
  { slug: "security", label: "Security", kind: "topic" },
  { slug: "hci", label: "Human-Computer Interaction", kind: "topic" },
  { slug: "llm", label: "Language Models", kind: "topic" },
  { slug: "db", label: "Databases", kind: "topic" },
  { slug: "rag", label: "Retrieval-Augmented Generation", kind: "topic" },
  { slug: "datasearch", label: "Dataset Search", kind: "topic" },
  { slug: "nearest-neighbor", label: "Nearest Neighbor Search", kind: "topic" },
  { slug: "rl", label: "Reinforcement Learning", kind: "topic" },
  { slug: "theory", label: "Theory", kind: "topic" },
  { slug: "multimodal", label: "Multimodal", kind: "topic" },
  { slug: "multi-group", label: "Multi-group Learning", kind: "topic" },
  { slug: "multiobjective", label: "Multi-objective Learning", kind: "topic" },
  { slug: "omniprediction", label: "Omniprediction", kind: "topic" },
  { slug: "sample-complexity", label: "Sample Complexity", kind: "topic" },
  { slug: "empirical-risk-minimization", label: "Empirical Risk Minimization", kind: "topic" },
  { slug: "sublinear-graph-algorithms", label: "Sublinear Graph Algorithms", kind: "topic" },
  { slug: "massively-parallel", label: "Massively Parallel Computation", kind: "topic" },
  { slug: "test-time-augmentation", label: "Test-time Augmentation", kind: "topic" },
  { slug: "attention", label: "Attention", kind: "topic" },
  { slug: "os", label: "Operating Systems", kind: "topic" },
  { slug: "networking", label: "Networking", kind: "topic" },
  { slug: "robotics", label: "Robotics", kind: "topic" },
  { slug: "simulation", label: "Simulation", kind: "topic" },
  { slug: "vis", label: "Visualization", kind: "topic" },
];

/**
 * Topic spellings in the current data that map onto a canonical slug.
 *
 * Two kinds of entry. Genuine duplicates get merged: `system`/`systems` into `sys`,
 * `sec` into `security`, `benchmark` into `bench`, and `agent`/`agents` into `ai`
 * (they predate the documented vocabulary, and "ai (agent intelligence)" is what
 * they mean). Everything else is just a phrase becoming a slug — `retrieval
 * augmented generation` cannot be a slug at all, because _includes/pubs.html
 * renders `tag-{{tag}}` as a CSS class and a tag containing spaces silently
 * becomes three classes.
 *
 * Distinct low-count topics keep their own slug. pubs.yml's header explicitly
 * sanctions project-specific tags, so a topic used once is not thereby a mistake.
 */
export const TOPIC_ALIASES: Record<string, string> = {
  system: "sys",
  systems: "sys",
  sec: "security",
  benchmark: "bench",
  agent: "ai",
  agents: "ai",
  "retrieval augmented generation": "rag",
  "multi-group learning": "multi-group",
  "multiobjective learning": "multiobjective",
  "nearest-neighbor search": "nearest-neighbor",
  "sample complexity": "sample-complexity",
  "empirical risk minimization": "empirical-risk-minimization",
  "sublinear graph algorithms": "sublinear-graph-algorithms",
  "massively parallel computation": "massively-parallel",
  "test-time augmentation": "test-time-augmentation",
};

/**
 * People badges, from _data/field_colors.yml, which already grouped these in
 * comments: research areas, "Academic groups", and "Administrative and advisory".
 *
 * Note that file lists `HCI` twice with different colors (badge-magenta, then
 * badge-fuchsia); YAML keeps the last, so badge-fuchsia is what the site actually
 * renders today, and that is what is carried over here.
 */
export const PEOPLE_TAGS: TagSeed[] = [
  { slug: "systems", label: "Systems", kind: "research", color: "badge-dark-blue" },
  { slug: "software", label: "Software", kind: "research", color: "badge-light-blue" },
  { slug: "security", label: "Security", kind: "research", color: "badge-indigo" },
  { slug: "data", label: "Data", kind: "research", color: "badge-sky-blue" },
  { slug: "robotics", label: "Robotics", kind: "research", color: "badge-steel-blue" },
  { slug: "ml", label: "Machine learning", kind: "research", color: "badge-green" },
  { slug: "causal-inference", label: "Causal inference", kind: "research", color: "badge-teal" },
  { slug: "rl", label: "Reinforcement learning", kind: "research", color: "badge-lime" },
  { slug: "ai", label: "AI", kind: "research", color: "badge-lime" },
  { slug: "ml-theory", label: "Machine learning theory", kind: "research", color: "badge-forest-green" },
  { slug: "decision-making", label: "Decision making", kind: "research", color: "badge-olive" },
  { slug: "market-design", label: "Pricing and market design", kind: "research", color: "badge-mint" },
  { slug: "hci", label: "HCI", kind: "research", color: "badge-fuchsia" },
  { slug: "nlp", label: "NLP", kind: "research", color: "badge-violet" },
  { slug: "vision", label: "Vision", kind: "research", color: "badge-light-purple" },
  { slug: "neurosymbolic", label: "Neurosymbolic learning", kind: "research", color: "badge-orchid" },
  { slug: "ai-health", label: "AI for Health", kind: "research", color: "badge-dark-slate-blue" },
  { slug: "graphics", label: "Graphics", kind: "research" },
  { slug: "digital-twins", label: "Digital Twins", kind: "research" },

  { slug: "cs", label: "CS", kind: "department", color: "badge-gold" },
  { slug: "ieor", label: "IEOR", kind: "department", color: "badge-silver" },
  { slug: "business", label: "Columbia Business", kind: "department", color: "badge-orange" },
  { slug: "dbmi", label: "DBMI", kind: "department", color: "badge-aquamarine" },
  { slug: "uchicago", label: "UChicago", kind: "department" },

  { slug: "advisory-board", label: "Advisory Board", kind: "role", color: "badge-advisory" },
  { slug: "co-director", label: "Co-Director", kind: "role", color: "badge-director" },
];

/**
 * `field:` values in _data/people.yml, mapped to canonical slugs.
 *
 * The YAML uses display labels; these become slugs. "Human-Centered AI" shares a
 * color with HCI in field_colors.yml and is folded into it.
 */
export const PEOPLE_TAG_ALIASES: Record<string, string> = {
  "CS": "cs",
  "IEOR": "ieor",
  "DBMI": "dbmi",
  "Columbia Business": "business",
  "UChicago": "uchicago",
  "Systems": "systems",
  "Software": "software",
  "Security": "security",
  "Data": "data",
  "Robotics": "robotics",
  "ML": "ml",
  "Machine learning": "ml",
  "Causal inference": "causal-inference",
  "Reinforcement learning": "rl",
  "AI": "ai",
  "Machine learning theory": "ml-theory",
  "Decision making": "decision-making",
  "Pricing and market design": "market-design",
  "HCI": "hci",
  "Human-Centered AI": "hci",
  "NLP": "nlp",
  "Vision": "vision",
  "Neurosymbolic learning": "neurosymbolic",
  "AI for Health": "ai-health",
  "Graphics": "graphics",
  "Digital Twins": "digital-twins",
  "Advisory Board": "advisory-board",
  "co-director": "co-director",
};

/** Slug that a `department` tag also implies for `people.affiliation`. */
export const DEPARTMENT_AFFILIATION: Record<string, string> = {
  cs: "Columbia Computer Science",
  ieor: "Columbia IEOR",
  business: "Columbia Business School",
  dbmi: "Columbia DBMI",
  uchicago: "University of Chicago",
};

/** Role tag that also implies a `people.title` when the record has none. */
export const ROLE_TITLE: Record<string, string> = {
  "co-director": "Co-Director",
  "advisory-board": "Advisory Board",
};

/** Lowercase, collapse anything that is not a word character into a hyphen. */
export const slugify = (raw: string): string =>
  raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const canonical = (
  raw: string,
  aliases: Record<string, string>,
  known: Set<string>,
): { slug: string; known: boolean } => {
  const trimmed = raw.trim();
  const mapped = aliases[trimmed] ?? aliases[trimmed.toLowerCase()] ?? slugify(trimmed);
  const slug = aliases[mapped] ?? mapped;
  return { slug, known: known.has(slug) };
};

const TOPIC_SLUGS = new Set(TOPIC_TAGS.map((t) => t.slug));
const PEOPLE_SLUGS = new Set(PEOPLE_TAGS.map((t) => t.slug));

/** Canonicalize one `tags:` entry from _data/pubs.yml. */
export const canonicalTopic = (raw: string) => canonical(raw, TOPIC_ALIASES, TOPIC_SLUGS);

/** Canonicalize one `field:` entry from _data/people.yml. */
export const canonicalPeopleTag = (raw: string) =>
  canonical(raw, PEOPLE_TAG_ALIASES, PEOPLE_SLUGS);
