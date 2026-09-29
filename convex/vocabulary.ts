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

export type FieldKind = "research" | "department" | "role";

export type TopicSeed = {
  slug: string;
  label: string;
  description?: string;
  sortOrder?: number;
};

export type FieldSeed = {
  slug: string;
  label: string;
  kind: FieldKind;
  color?: string;
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
export const TOPICS: TopicSeed[] = [
  { slug: "ai", label: "Agent Intelligence", sortOrder: 1 },
  { slug: "sys", label: "Agent-ready Systems", sortOrder: 2 },
  { slug: "hac", label: "Human-agent Collaboration", sortOrder: 3 },
  { slug: "automation", label: "Automation", sortOrder: 4 },
  { slug: "whitepaper", label: "White & Position Papers", sortOrder: 5 },

  { slug: "bench", label: "Benchmarks" },
  { slug: "digi-twin", label: "Digital Twins" },
  { slug: "agent-debug", label: "Agent Debugging" },
  { slug: "safety", label: "Safety" },
  { slug: "security", label: "Security" },
  { slug: "hci", label: "Human-Computer Interaction" },
  { slug: "llm", label: "Language Models" },
  { slug: "db", label: "Databases" },
  { slug: "rag", label: "Retrieval-Augmented Generation" },
  { slug: "datasearch", label: "Dataset Search" },
  { slug: "nearest-neighbor", label: "Nearest Neighbor Search" },
  { slug: "rl", label: "Reinforcement Learning" },
  { slug: "theory", label: "Theory" },
  { slug: "multimodal", label: "Multimodal" },
  { slug: "multi-group", label: "Multi-group Learning" },
  { slug: "multiobjective", label: "Multi-objective Learning" },
  { slug: "omniprediction", label: "Omniprediction" },
  { slug: "sample-complexity", label: "Sample Complexity" },
  { slug: "empirical-risk-minimization", label: "Empirical Risk Minimization" },
  { slug: "sublinear-graph-algorithms", label: "Sublinear Graph Algorithms" },
  { slug: "massively-parallel", label: "Massively Parallel Computation" },
  { slug: "test-time-augmentation", label: "Test-time Augmentation" },
  { slug: "attention", label: "Attention" },
  { slug: "os", label: "Operating Systems" },
  { slug: "networking", label: "Networking" },
  { slug: "robotics", label: "Robotics" },
  { slug: "simulation", label: "Simulation" },
  { slug: "vis", label: "Visualization" },
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
 * People badges, from _data/field_colors.yml.
 *
 * `label` is the exact string _data/people.yml uses today, because
 * _includes/people-grid.html looks its badge color up as `field_colors[label]` and
 * prints the same string. Canonicalizing the slug is free; changing the label would
 * change what the page shows and silently drop the color.
 *, which already grouped these in
 * comments: research areas, "Academic groups", and "Administrative and advisory".
 *
 * Note that file lists `HCI` twice with different colors (badge-magenta, then
 * badge-fuchsia); YAML keeps the last, so badge-fuchsia is what the site actually
 * renders today, and that is what is carried over here.
 */
export const FIELDS: FieldSeed[] = [
  { slug: "systems", label: "Systems", kind: "research", color: "badge-dark-blue" },
  { slug: "software", label: "Software", kind: "research", color: "badge-light-blue" },
  { slug: "security", label: "Security", kind: "research", color: "badge-indigo" },
  { slug: "data", label: "Data", kind: "research", color: "badge-sky-blue" },
  { slug: "robotics", label: "Robotics", kind: "research", color: "badge-steel-blue" },
  { slug: "ml", label: "ML", kind: "research", color: "badge-green" },
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
  { slug: "co-director", label: "co-director", kind: "role", color: "badge-director" },
];

/**
 * `field:` values in _data/people.yml, mapped to canonical slugs.
 *
 * The YAML uses display labels; these become slugs. "Human-Centered AI" shares a
 * color with HCI in field_colors.yml and is folded into it.
 */
export const FIELD_ALIASES: Record<string, string> = {
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

const TOPIC_SLUGS = new Set(TOPICS.map((t) => t.slug));
const FIELD_SLUGS = new Set(FIELDS.map((t) => t.slug));

/** Canonicalize one `tags:` entry from _data/pubs.yml. */
export const canonicalTopic = (raw: string) => canonical(raw, TOPIC_ALIASES, TOPIC_SLUGS);

/** Canonicalize one `field:` entry from _data/people.yml. */
export const canonicalField = (raw: string) => canonical(raw, FIELD_ALIASES, FIELD_SLUGS);
