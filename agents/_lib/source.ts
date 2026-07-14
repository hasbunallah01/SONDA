/**
 * agents/_lib/source — Source-aware helpers for the reviewer agents.
 *
 * SONDA accepts four evidence sources (see
 * `types/evidence.ts#ReviewSource`):
 *
 *   - 'website'  — a public URL. Bundle has `pageContent`,
 *                  `screenshots`, `accessibility`, `metrics`.
 *   - 'private'  — a credentials-gated URL. Same shape as 'website'.
 *   - 'github'   — a public repository. Bundle has `files`,
 *                  `metrics.stars`, metadata. NO `pageContent`,
 *                  NO `accessibility`, NO `screenshots`.
 *   - 'zip'      — a downloaded archive. Bundle has `files`
 *                  (tree + README + license), `metrics.extra`.
 *                  NO `pageContent`, NO `accessibility`,
 *                  NO `screenshots`.
 *
 * The reviewers run on the same `EvidenceBundle` shape for all
 * four sources, so source-specific logic lives in the reviewers
 * — not in the bundle. This module is the single place where
 * that source classification lives, so every reviewer branches
 * on the same predicates and uses the same vocabulary.
 *
 * Why a module (not a switch in each reviewer)?
 *  - One place to update if a new source is added.
 *  - One place to test the predicates.
 *  - Reviewers stay focused on analysis, not classification.
 *  - The source label appears in the `summary` of every
 *    reviewer; having a shared helper keeps that label
 *    consistent.
 *
 * Public API
 *  - `isBrowserSource(source)` — true for website / private.
 *  - `isCodeSource(source)`    — true for github / zip.
 *  - `hasPageContent(evidence)` — type guard for `pageContent`.
 *  - `hasFiles(evidence)`       — type guard for `files`.
 *  - `hasScreenshots(evidence)` — type guard for non-empty `screenshots`.
 *  - `hasAccessibility(evidence)` — type guard for `accessibility`.
 *  - `hasMetrics(evidence)`     — type guard for any metric value.
 *  - `sourceLabel(source)`      — human-readable label for summaries.
 *  - `bannedTokensForSource(source)` — words that should not
 *    appear in `priorityFixes.title` for a given source. The
 *    reviewers consult this list before emitting a fix so
 *    ZIP / GitHub reviews never recommend website-specific
 *    work like "Add a hero section" or "Add a CTA".
 */

import type { EvidenceBundle, ReviewSource } from '@/types/evidence';

/* -------------------------------------------------------------------------- */
/* Source classification                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Browser sources produce a rendered page and may include
 * `pageContent`, `screenshots`, `accessibility`, and
 * Lighthouse `metrics`. Recommendations about CTAs, hero
 * sections, headings, and "above the fold" are appropriate
 * for these sources.
 */
export const isBrowserSource = (source: ReviewSource): boolean =>
  source === 'website' || source === 'private';

/**
 * Code sources produce a file tree plus a README and possibly
 * a license. They do NOT have rendered pages, so
 * recommendations about CTAs, hero sections, and
 * "above-the-fold" copy are nonsensical. Recommendations
 * about README quality, file structure, tests, dependency
 * hygiene, and project completeness are appropriate.
 */
export const isCodeSource = (source: ReviewSource): boolean =>
  source === 'github' || source === 'zip';

/* -------------------------------------------------------------------------- */
/* Evidence shape predicates                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `true` when the bundle has a non-empty `pageContent` section.
 *
 * The section is present on browser sources and absent on code
 * sources. We also defend against the rare case of a present
 * but completely empty `pageContent` (no headings, no body,
 * no links), which is effectively the same as "absent" for
 * reviewer purposes.
 */
export const hasPageContent = (
  evidence: EvidenceBundle,
): evidence is EvidenceBundle & {
  pageContent: NonNullable<EvidenceBundle['pageContent']>;
} => {
  if (!evidence.pageContent) return false;
  const pc = evidence.pageContent;
  return pc.headings.length > 0 || pc.body.length > 0 || pc.links.length > 0;
};

/**
 * `true` when the bundle has a non-empty `files` section.
 *
 * Code sources always carry a file tree; browser sources do
 * not. We require at least one entry in `fileTree` to be
 * considered "present" for reviewer purposes.
 */
export const hasFiles = (
  evidence: EvidenceBundle,
): evidence is EvidenceBundle & { files: NonNullable<EvidenceBundle['files']> } => {
  if (!evidence.files) return false;
  return evidence.files.fileTree.length > 0;
};

/**
 * `true` when the bundle has at least one screenshot URL.
 *
 * Always `false` for code sources; usually `false` for the
 * `website` source until the real Playwright collector ships.
 */
export const hasScreenshots = (evidence: EvidenceBundle): boolean => {
  return evidence.screenshots.items.length > 0;
};

/**
 * `true` when the bundle has an `accessibility` section.
 *
 * Always `false` for code sources; usually `false` for the
 * `website` source until the real axe-core collector ships.
 */
export const hasAccessibility = (
  evidence: EvidenceBundle,
): evidence is EvidenceBundle & {
  accessibility: NonNullable<EvidenceBundle['accessibility']>;
} => {
  return evidence.accessibility !== undefined;
};

/**
 * `true` when the bundle carries at least one numeric
 * metric. Used by reviewers that want to pull in a
 * Lighthouse score or a star count.
 */
export const hasMetrics = (evidence: EvidenceBundle): boolean => {
  if (!evidence.metrics) return false;
  const m = evidence.metrics;
  return (
    m.performance !== undefined ||
    m.accessibility !== undefined ||
    m.bestPractices !== undefined ||
    m.seo !== undefined ||
    m.stars !== undefined ||
    (m.extra !== undefined && Object.keys(m.extra).length > 0)
  );
};

/* -------------------------------------------------------------------------- */
/* Human-readable label                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Human-readable label for each source, used in reviewer
 * `summary` strings so a results page can show
 * "QA review of GitHub repository ..." or
 * "UX review of ZIP archive ...".
 */
export const sourceLabel = (source: ReviewSource): string => {
  switch (source) {
    case 'website':
      return 'website';
    case 'private':
      return 'private website';
    case 'github':
      return 'GitHub repository';
    case 'zip':
      return 'ZIP archive';
  }
};

/* -------------------------------------------------------------------------- */
/* Website-specific vocabulary that must NEVER appear in non-browser reviews  */
/* -------------------------------------------------------------------------- */

/**
 * Tokens that should not appear in `priorityFixes.title`,
 * `priorityFixes.description`, `findings.title`, or
 * `findings.detail` for code sources. Each token is matched
 * case-insensitively as a whole word against the lowercased
 * text.
 *
 * Why a list (not a regex)?
 *  - Easier to extend.
 *  - Easier to reason about for the deterministic reviewers
 *    (the real source of "is this fix website-specific?" is
 *    the source branch in the reviewer; this list is a
 *    belt-and-braces safety net for the LLM-backed variants
 *    that will land later).
 *
 * Adding a token here is the right move when:
 *  - The token is a website-UI concept (hero, CTA, fold).
 *  - The token has no sensible code-source equivalent.
 *  - The reviewer might plausibly produce it in a code-source
 *    run by accident.
 *
 * The list intentionally stays short. Phrasing like
 * "Add a hero section" IS a code-source bug; phrasing like
 * "Improve the headline" is a wording problem in the reviewer
 * itself, not a token to add to this list.
 */
const BROWSER_ONLY_TOKENS: ReadonlyArray<string> = [
  'hero',
  'hero section',
  'hero image',
  'cta',
  'cta button',
  'call-to-action',
  'call to action',
  'landing page',
  'above the fold',
  'above-the-fold',
  'first paint',
  'lighthouse',
  'viewport',
  'mobile vs desktop',
  'mobile and desktop',
  'browser',
  'web page',
  'webpage',
];

/**
 * Return the list of banned tokens for a given source. Code
 * sources ban the full list; browser sources ban nothing.
 *
 * The reviewers call this when generating `priorityFixes`
 * for code sources. If a candidate fix's title or
 * description contains any banned token, the reviewer
 * should rewrite or skip the fix rather than emit it.
 */
export const bannedTokensForSource = (source: ReviewSource): ReadonlyArray<string> => {
  if (isCodeSource(source)) return BROWSER_ONLY_TOKENS;
  return [];
};

/**
 * Return `true` when `text` contains any banned token for
 * `source`. Used as the final safety net by reviewers that
 * are already source-aware — it lets a future test
 * (`tests/source-aware.test.ts`) assert that code-source
 * outputs do not slip a "CTA" or "hero section" in by
 * accident.
 */
export const containsBannedToken = (text: string, source: ReviewSource): boolean => {
  const tokens = bannedTokensForSource(source);
  if (tokens.length === 0) return false;
  const lower = text.toLowerCase();
  for (const token of tokens) {
    // Whole-word match, case-insensitive. A `\\b` boundary
    // would fail on tokens that contain a hyphen; we keep the
    // boundary as `\b` and split hyphenated tokens on `-`
    // before matching.
    const parts = token.split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;
    const escaped = parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const re = new RegExp(`\\b${escaped.join('\\s+')}\\b`, 'i');
    if (re.test(lower)) return true;
  }
  return false;
};

/* -------------------------------------------------------------------------- */
/* Source-aware recommendation vocabulary                                     */
/* -------------------------------------------------------------------------- */

/**
 * Vocabulary the reviewers use to phrase recommendations
 * differently per source. Centralizing it here keeps the
 * reviewer outputs stable and the source-specific wording
 * consistent.
 *
 * Each entry is `{ browser, code }`. Reviewers read the
 * `code` value when emitting a fix for a `github` or `zip`
 * target, and the `browser` value for a `website` or
 * `private` target.
 */
export const RECOMMENDATION_LANGUAGE: ReadonlyArray<{
  id: string;
  browser: string;
  code: string;
}> = [
  {
    id: 'headline',
    browser: 'Sharpen the headline and subhead',
    code: 'Sharpen the project description in the README',
  },
  {
    id: 'cta',
    browser: 'Add a primary call-to-action above the fold',
    code: 'Add a clear "Quick start" section to the README',
  },
  {
    id: 'social-proof',
    browser: 'Add social proof (logos, testimonials, press)',
    code: 'Add a "Used by" / customers list to the README',
  },
  {
    id: 'screenshots',
    browser: 'Capture screenshots for visual review',
    code: 'Add a screenshot or animated GIF to the README',
  },
  {
    id: 'meta-description',
    browser: 'Write a meta description',
    code: 'Write a concise repository description on GitHub',
  },
  {
    id: 'meta-image',
    browser: 'Add a social-share image (og:image)',
    code: 'Add a social-preview image to the repository',
  },
  {
    id: 'accessibility',
    browser: 'Fix critical accessibility violations',
    code: 'Document accessibility commitments in the README',
  },
  {
    id: 'performance',
    browser: 'Improve Lighthouse performance score',
    code: 'Add a performance / benchmarks section to the README',
  },
  {
    id: 'error-states',
    browser: 'Make error states visible and recoverable',
    code: 'Document known limitations and error-handling in the README',
  },
  {
    id: 'demo-flow',
    browser: 'Tighten the demo flow on the home page',
    code: 'Add a working end-to-end demo or example to the repo',
  },
  {
    id: 'navigation',
    browser: 'Make the primary navigation obvious',
    code: 'Add a clear table of contents to the README',
  },
];
