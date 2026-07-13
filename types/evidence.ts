/**
 * types/evidence — Shared `EvidenceBundle` contract
 *
 * Task 6.3 — Evidence Bundle Foundation. This is the single,
 * source-agnostic data structure that **every** future analyzer
 * (Playwright / GitHub / ZIP / private-website) will produce.
 *
 * Design
 *  - One `EvidenceBundle` shape for all four sources. There is no
 *    `WebsiteEvidenceBundle` / `GithubEvidenceBundle` / etc. union
 *    anymore — the bundle is the contract, the `source` field is
 *    a plain label, and source-specific analyzers fill in the
 *    sections that apply to them.
 *  - The bundle has seven sections, all named. Each section is its
 *    own type so future code (analyzers, the verdict engine, the
 *    reviewer agents) can refer to a sub-bundle directly.
 *  - Three sections are **required** because every analyzer
 *    produces them: `metadata`, `screenshots`, `logs`.
 *  - Four sections are **optional** because they only apply to some
 *    sources: `pageContent` (browser), `files` (code/archive),
 *    `metrics` (numeric signals), `accessibility` (browser).
 *    Sources that do not have a given kind of evidence simply
 *    leave the section off.
 *
 * Out of scope (per task)
 *  - No analyzer implementation, no Playwright, no GitHub API, no
 *    ZIP extraction, no AI. The contract is the deliverable; the
 *    analyzers that produce real values land in later tasks.
 *  - No factories / constructors. The shape is enough; future
 *    code can build bundles with plain object literals.
 *
 * Why a single shape (not a per-source union)?
 *  - The reviewer agents (QA / UX / Marketing / Investor / Judge /
 *    First-User) consume a *normalized* bundle. A union would force
 *    every consumer to narrow on `source` before reading any
 *    field, which is exactly the friction the original design was
 *    meant to avoid.
 *  - A single shape lets us add a new source by *filling in* the
 *    same fields — the agents do not change.
 *  - Source-specific extras that do not fit any of the seven
 *    sections are out of scope for this task; when a real need
 *    arises, it lands as a new section in its own commit.
 */

/* -------------------------------------------------------------------------- */
/* Source label                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The four sources SONDA supports. The `source` field on the
 * `metadata` section is the only place this type is referenced; it
 * is not a discriminator in the type system.
 */
export type ReviewSource = 'website' | 'github' | 'zip' | 'private';

/* -------------------------------------------------------------------------- */
/* Section 1 — `metadata` (required)                                          */
/* -------------------------------------------------------------------------- */

/**
 * The lightweight facts every bundle carries: what was submitted,
 * when, and the small set of labels an analyzer could derive up
 * front (title / description / language / image).
 *
 * `id` is a stable bundle id (cuid / ulid) the orchestrator can use
 * to correlate logs and progress events with the bundle that
 * produced them.
 */
export type EvidenceMetadata = {
  /** Stable bundle id. */
  id: string;
  /** Which source produced this bundle. */
  source: ReviewSource;
  /** ISO timestamp the bundle was assembled. */
  submittedAt: string;
  /** What the user submitted. */
  input: {
    /** Human-readable label, e.g. `"https://example.com"`. */
    label: string;
    /** Canonical URL, when applicable (website / github / private). */
    url?: string;
  };
  /** Lightweight facts an analyzer can derive up front. */
  facts: {
    title?: string;
    description?: string;
    language?: string;
    imageUrl?: string;
  };
};

/* -------------------------------------------------------------------------- */
/* Section 2 — `screenshots` (required)                                       */
/* -------------------------------------------------------------------------- */

/**
 * Visual captures of the target.
 *
 * Required because the type is uniform across sources, but the
 * `items` list is allowed to be empty for sources that do not
 * render visually (GitHub, ZIP).
 */
export type EvidenceScreenshots = {
  /** Ordered list of screenshot URLs / object-storage paths. */
  items: string[];
  /** Viewport metadata for each capture, in the same order as `items`. */
  viewports?: {
    /** Friendly name, e.g. `"desktop"` / `"mobile"`. */
    name: string;
    /** Viewport width in CSS pixels. */
    width: number;
    /** Viewport height in CSS pixels. */
    height: number;
  }[];
};

/* -------------------------------------------------------------------------- */
/* Section 3 — `pageContent` (optional, browser sources)                      */
/* -------------------------------------------------------------------------- */

/**
 * Structured text and link data extracted from a rendered page.
 * Applies to `website` and `private` sources; absent for `github`
 * and `zip`.
 */
export type EvidencePageContent = {
  /** Headings in document order. */
  headings: string[];
  /** Main body text. */
  body: string;
  /** Links discovered on the page. */
  links: { href: string; text: string }[];
};

/* -------------------------------------------------------------------------- */
/* Section 4 — `files` (optional, code / archive sources)                     */
/* -------------------------------------------------------------------------- */

/**
 * File-system-level evidence for sources that have a tree.
 * Applies to `github` and `zip`; absent for `website` and
 * `private` (their `pageContent` plays the analogous role).
 */
export type EvidenceFiles = {
  /** Flat list of file paths inside the project. */
  fileTree: string[];
  /** First-level children of the project root. */
  topLevel: string[];
  /** README content, when present. */
  readme?: string;
  /** License text or SPDX id, when present. */
  license?: string;
};

/* -------------------------------------------------------------------------- */
/* Section 5 — `metrics` (optional)                                           */
/* -------------------------------------------------------------------------- */

/**
 * Quantitative signals an analyzer can compute. Concrete fields
 * cover the most common cross-source values; `extra` is the
 * catch-all bucket for source-specific numbers that do not yet
 * warrant a top-level field.
 */
export type EvidenceMetrics = {
  /** Lighthouse performance score (0–100), when available. */
  performance?: number;
  /** Lighthouse accessibility score (0–100), when available. */
  accessibility?: number;
  /** Lighthouse best-practices score (0–100), when available. */
  bestPractices?: number;
  /** Lighthouse SEO score (0–100), when available. */
  seo?: number;
  /** GitHub star count, when available. */
  stars?: number;
  /** Source-specific extras that do not yet have a top-level field. */
  extra?: Record<string, number | string | boolean>;
};

/* -------------------------------------------------------------------------- */
/* Section 6 — `accessibility` (optional, browser sources)                    */
/* -------------------------------------------------------------------------- */

/**
 * Accessibility findings. Modeled on axe-core's output shape
 * (id / impact / description / nodes) but the type is a
 * placeholder — the real analyzer will land in a later task.
 */
export type EvidenceAccessibility = {
  /** Counts of findings by severity. */
  summary: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
  };
  /** Individual findings. */
  findings: {
    /** Rule id, e.g. `"color-contrast"`. */
    id: string;
    /** WCAG-aligned severity. */
    impact: 'critical' | 'serious' | 'moderate' | 'minor';
    /** Human-readable description. */
    description: string;
    /** Link to the rule's documentation. */
    helpUrl?: string;
    /** DOM nodes that triggered the finding. */
    nodes: {
      /** CSS selector / XPath describing the node. */
      target: string;
      /** Outer HTML of the node, for the reviewer to inspect. */
      html?: string;
    }[];
  }[];
};

/* -------------------------------------------------------------------------- */
/* Section 7 — `logs` (required)                                              */
/* -------------------------------------------------------------------------- */

/**
 * Analyzer activity trail. Every analyzer — browser, GitHub, ZIP,
 * private — produces a log so the orchestrator and the running-
 * review UI can show progress and diagnose failures.
 */
export type EvidenceLogs = {
  items: {
    /** ISO timestamp. */
    at: string;
    /** Severity. */
    level: 'debug' | 'info' | 'warn' | 'error';
    /** Free-form message. */
    message: string;
  }[];
};

/* -------------------------------------------------------------------------- */
/* The bundle                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The shared `EvidenceBundle` contract.
 *
 * Required sections
 *  - `metadata`    — what was submitted and when.
 *  - `screenshots` — visual captures (empty array if N/A).
 *  - `logs`        — analyzer activity trail.
 *
 * Optional sections
 *  - `pageContent`    — website / private only.
 *  - `files`          — github / zip only.
 *  - `metrics`        — any source that produces numbers.
 *  - `accessibility`  — website / private only.
 *
 * Adding a new source does *not* change this type. The new source's
 * analyzer simply fills in the sections it can produce and leaves
 * the rest off.
 */
export type EvidenceBundle = {
  metadata: EvidenceMetadata;
  screenshots: EvidenceScreenshots;
  pageContent?: EvidencePageContent;
  files?: EvidenceFiles;
  metrics?: EvidenceMetrics;
  accessibility?: EvidenceAccessibility;
  logs: EvidenceLogs;
};
