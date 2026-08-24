import shared from "./shared-constants.json";

export const LANGUAGE_COLORS = shared.languageColors;
export const LANGUAGE_BY_EXTENSION = shared.languages;
export const CHUNKING = shared.chunking;
export const RETRIEVAL = shared.retrieval;

/** Colour for a language badge, falling back to a neutral grey. */
export function languageColor(language) {
  return LANGUAGE_COLORS[language?.toLowerCase()] ?? "#5a5a5a";
}

export function languageFromPath(path = "") {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return "text";
  return LANGUAGE_BY_EXTENSION[path.slice(dot).toLowerCase()] ?? "text";
}

/** Ordered pipeline stages, mirroring the backend IndexStatus enum. */
export const INDEX_STAGES = [
  { status: "QUEUED", label: "Queued" },
  { status: "CLONING", label: "Cloning" },
  { status: "PARSING", label: "Parsing" },
  { status: "CHUNKING", label: "Chunking" },
  { status: "EMBEDDING", label: "Embedding" },
  { status: "INDEXING", label: "Indexing" },
  { status: "READY", label: "Ready" },
];

export const TERMINAL_STATUSES = new Set(["READY", "FAILED"]);

export const STATUS_TONE = {
  QUEUED: "neutral",
  CLONING: "active",
  PARSING: "active",
  CHUNKING: "active",
  EMBEDDING: "active",
  INDEXING: "active",
  READY: "positive",
  FAILED: "critical",
};

export const SAMPLE_REPOSITORIES = [
  {
    url: "https://github.com/psf/requests",
    name: "psf/requests",
    blurb: "Python HTTP library — small, readable, great for a first index.",
  },
  {
    url: "https://github.com/pallets/flask",
    name: "pallets/flask",
    blurb: "Microframework with clear layering and decorators.",
  },
  {
    url: "https://github.com/expressjs/express",
    name: "expressjs/express",
    blurb: "Node.js web framework — middleware and routing.",
  },
  {
    url: "https://github.com/tiangolo/fastapi",
    name: "tiangolo/fastapi",
    blurb: "Modern Python API framework with dependency injection.",
  },
];

export const EXAMPLE_QUESTIONS = [
  "Explain the authentication flow.",
  "Where is JWT verified?",
  "How is middleware connected?",
  "Which file handles API routing?",
  "Explain this project's architecture.",
  "Find dead code.",
];
