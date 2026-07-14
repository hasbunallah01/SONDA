/**
 * agents/marketing — Marketing / GTM Expert reviewer
 *
 * Task 6.5 — Real implementation. Source-aware (Task 3.4).
 *
 * Decides whether the product has a clear story, positioning,
 * and go-to-market. For browser sources the reviewer uses
 * the page headline, copy density, links (CTAs, social
 * proof), screenshots (visual identity), and metadata
 * (title, description). For code sources the reviewer uses
 * the README, the project description, the project
 * metadata, and any "Used by" / "Customers" signals in the
 * README — and never recommends "Add a primary CTA" or
 * "Sharpen the headline" since those do not apply.
 *
 * Like the QA and UX reviewers, the current implementation is
 * **deterministic**: it does not call an LLM. A future task can
 * drop in an LLM-backed variant via the `ReviewerFactory`
 * (`createMarketingReviewer`) without changing this module's
 * public surface.
 *
 * Public surface (matches the `ReviewerModule` shape in
 * `agents/contract.ts`):
 *
 *   - `REVIEWER_ID`                  — `'marketing'`.
 *   - `marketingReviewer`            — the `Reviewer` object.
 *   - `runReviewer`                  — legacy function entry point.
 *   - `createMarketingReviewer`      — `ReviewerFactory` for DI.
 *   - `default`                      — the `ReviewerModule`.
 */

import type { Reviewer, ReviewerFactory, ReviewerModule } from '@/agents/contract';
import type {
  PriorityFix,
  ReviewerContext,
  ReviewerDescriptor,
  ReviewerError,
  ReviewerFinding,
  ReviewerId,
  ReviewerOutput,
  ReviewerRubric,
  ReviewerRunOptions,
  RubricScore,
} from '@/agents/types';
import { REVIEWER_ROLES } from '@/agents/types';
import type { EvidenceBundle, ReviewSource } from '@/types/evidence';

import {
  containsBannedToken,
  hasFiles,
  hasMetrics,
  hasPageContent,
  hasScreenshots,
  isCodeSource,
  sourceLabel,
} from '@/agents/_lib/source';

/* -------------------------------------------------------------------------- */
/* Identity                                                                   */
/* -------------------------------------------------------------------------- */

export const REVIEWER_ID = 'marketing' as const satisfies ReviewerId;

/* -------------------------------------------------------------------------- */
/* Descriptor + rubric                                                        */
/* -------------------------------------------------------------------------- */

const descriptor: ReviewerDescriptor = {
  id: 'marketing',
  role: REVIEWER_ROLES.marketing,
  description:
    'Decides whether the product has a clear story, positioning, and go-to-market. Scores positioning, differentiation, conversion clarity, copy quality, and audience fit.',
  defaultWeight: 0.15,
};

const rubric: ReviewerRubric = [
  {
    id: 'positioning',
    label: 'Positioning & value proposition',
    description: 'Is the product positioning clear from the headline, subhead, and metadata?',
    weight: 0.25,
  },
  {
    id: 'differentiation',
    label: 'Differentiation',
    description: 'Is there a clear "why this, not that" framing vs the obvious alternative?',
    weight: 0.2,
  },
  {
    id: 'conversion',
    label: 'Conversion clarity',
    description: 'Are calls to action, social proof, and trust signals visible?',
    weight: 0.25,
  },
  {
    id: 'copy',
    label: 'Copy quality',
    description: 'Is the copy plain, specific, and written for a defined audience?',
    weight: 0.15,
  },
  {
    id: 'audience-fit',
    label: 'Audience fit',
    description: 'Does the page read like it was written for a specific person?',
    weight: 0.15,
  },
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));

const round = (n: number): number => Math.round(n);

/**
 * Crude heuristic for "is this an action verb" — used to detect
 * CTAs (e.g. "Get started", "Sign up", "Try it free", "Book a demo").
 * Returns true if the link text starts with one of the recognized
 * verbs or contains a known action phrase.
 */
const isLikelyCta = (text: string): boolean => {
  const t = text.trim().toLowerCase();
  if (t.length === 0) return false;
  const verbStarts = [
    'get ',
    'sign ',
    'try ',
    'start ',
    'book ',
    'join ',
    'subscribe',
    'download',
    'install',
    'request',
    'contact',
    'demo',
    'schedule',
    'buy ',
    'see ',
    'view ',
    'launch',
    'claim',
    'reserve',
  ];
  return verbStarts.some((v) => t.startsWith(v));
};

/**
 * Crude heuristic for "is this likely social proof / trust signal".
 * Looks for known phrases in link text or hrefs.
 */
const isLikelySocialProof = (text: string, href: string): boolean => {
  const t = `${text} ${href}`.toLowerCase();
  return (
    t.includes('customer') ||
    t.includes('testimonial') ||
    t.includes('case stud') ||
    t.includes('press') ||
    t.includes('logo') ||
    t.includes('trust') ||
    t.includes('review') ||
    t.includes('rating') ||
    t.includes('backed by') ||
    t.includes('used by') ||
    t.includes('featured in')
  );
};

/**
 * Crude heuristic for "is this a 'used by' / customer logo strip"
 * in a README. Looks at headings or paragraphs.
 */
const readmeMentionsSocialProof = (readme: string): boolean => {
  const lower = readme.toLowerCase();
  return (
    /\bused by\b/.test(lower) ||
    /\btrusted by\b/.test(lower) ||
    /\bbacked by\b/.test(lower) ||
    /\bfeatured in\b/.test(lower) ||
    /\bcustomers?\b/.test(lower) ||
    /\btestimonials?\b/.test(lower) ||
    /\bpress\b/.test(lower)
  );
};

/* -------------------------------------------------------------------------- */
/* Analysis                                                                   */
/* -------------------------------------------------------------------------- */

type Analysis = {
  rubricScores: RubricScore[];
  findings: ReviewerFinding[];
  strengths: string[];
  weaknesses: string[];
  priorityFixes: PriorityFix[];
  overall: number;
  confidence: number;
  source: ReviewSource;
};

/**
 * Browser-source marketing analysis. Looks at the rendered
 * page, the metadata, and the Lighthouse SEO score to
 * judge positioning, differentiation, conversion, copy, and
 * audience fit. CTAs, social proof, and headline are framed
 * for a live website.
 */
const analyzeBrowser = (evidence: EvidenceBundle): Analysis => {
  const { screenshots, metrics, metadata } = evidence;
  const pageContent = hasPageContent(evidence) ? evidence.pageContent : undefined;

  // --- positioning -------------------------------------------------------
  // Headline + subhead + metadata (title / description).
  let positioning = 30;
  const positioningSignals: string[] = [];
  const firstHeading = pageContent?.headings[0];
  if (firstHeading && firstHeading.length > 0) {
    positioning += 25;
    positioningSignals.push(`headline present ("${firstHeading.slice(0, 60)}")`);
  } else {
    positioningSignals.push('no headline (H1) extracted');
  }
  if (metadata.facts.title && metadata.facts.title.length > 0) {
    positioning += 15;
    positioningSignals.push(`metadata title present ("${metadata.facts.title.slice(0, 60)}")`);
  } else {
    positioningSignals.push('no metadata title in the bundle');
  }
  if (metadata.facts.description && metadata.facts.description.length > 0) {
    positioning += 20;
    positioningSignals.push('metadata description present');
  } else {
    positioningSignals.push('no metadata description');
  }
  if (pageContent && pageContent.body.length > 0) {
    positioning += 10;
    positioningSignals.push('body copy present to support the positioning');
  }
  positioning = clamp(positioning, 0, 100);

  // --- differentiation ---------------------------------------------------
  let differentiation = 35;
  const differentiationSignals: string[] = [];
  if (pageContent) {
    const haystack = `${pageContent.headings.join(' ')} ${pageContent.body}`.toLowerCase();
    const compareHits =
      (haystack.match(/\bvs\.?\b/g)?.length ?? 0) +
      (haystack.match(/\bversus\b/g)?.length ?? 0) +
      (haystack.match(/\bunlike\b/g)?.length ?? 0) +
      (haystack.match(/\balternative\b/g)?.length ?? 0) +
      (haystack.match(/\bbetter than\b/g)?.length ?? 0) +
      (haystack.match(/\binstead of\b/g)?.length ?? 0);
    if (compareHits >= 1) {
      differentiation += 40;
      differentiationSignals.push(
        `comparison-style language detected (${compareHits} hit${compareHits === 1 ? '' : 's'})`,
      );
    } else {
      differentiationSignals.push('no explicit comparison/alternative framing detected');
    }
    if (pageContent.headings.length >= 3) {
      differentiation += 15;
      differentiationSignals.push(
        'multiple headings — page likely articulates more than one angle',
      );
    }
  } else {
    differentiationSignals.push('no page content to evaluate differentiation');
  }
  differentiation = clamp(differentiation, 0, 100);

  // --- conversion --------------------------------------------------------
  // CTAs in link text + screenshots (visual identity / hero).
  let conversion = 35;
  const conversionSignals: string[] = [];
  let ctaCount = 0;
  if (pageContent) {
    for (const link of pageContent.links) {
      if (isLikelyCta(link.text)) ctaCount += 1;
    }
    if (ctaCount >= 1) {
      conversion += 30;
      conversionSignals.push(`${ctaCount} CTA-style link${ctaCount === 1 ? '' : 's'} detected`);
    } else {
      conversionSignals.push('no CTA-style links detected in page content');
    }
    if (ctaCount >= 3) {
      conversion += 20;
      conversionSignals.push('multiple CTAs — clear primary action is reinforced');
    }
  } else {
    conversionSignals.push('no page content to evaluate conversion');
  }
  if (hasScreenshots(evidence)) {
    conversion += 5;
    conversionSignals.push('hero / above-the-fold visual captured');
  }
  // Trust signals: social-proof-ish links.
  let socialProof = 0;
  if (pageContent) {
    for (const link of pageContent.links) {
      if (isLikelySocialProof(link.text, link.href)) socialProof += 1;
    }
    if (socialProof >= 1) {
      conversion = clamp(conversion + 10, 0, 100);
      conversionSignals.push(
        `${socialProof} social-proof/trust-signal link${socialProof === 1 ? '' : 's'}`,
      );
    }
  }
  conversion = clamp(conversion, 0, 100);

  // --- copy quality ------------------------------------------------------
  let copy = 50;
  let copyNote = 'No body copy to evaluate.';
  if (pageContent && pageContent.body.length > 0) {
    const words = pageContent.body.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    if (wordCount >= 60) {
      copy += 25;
      copyNote = `Substantial copy (${wordCount} words).`;
    } else if (wordCount >= 20) {
      copy += 15;
      copyNote = `Modest copy (${wordCount} words) — sufficient for a focused positioning.`;
    } else {
      copy += 5;
      copyNote = `Thin copy (${wordCount} word${wordCount === 1 ? '' : 's'}).`;
    }
    if (wordCount > 0) {
      const linkDensity = pageContent.links.length / wordCount;
      if (linkDensity > 0 && linkDensity < 0.2) {
        copy += 15;
        copyNote += ' Reasonable link density.';
      } else if (linkDensity >= 0.2) {
        copy -= 10;
        copyNote += ' Link density is high — copy may feel like a list of links.';
      }
    }
  }
  copy = clamp(copy, 0, 100);

  // --- audience fit ------------------------------------------------------
  let audienceFit = 40;
  const audienceSignals: string[] = [];
  if (pageContent) {
    const haystack = `${pageContent.headings.join(' ')} ${pageContent.body}`.toLowerCase();
    const youCount =
      (haystack.match(/\byou\b/g)?.length ?? 0) + (haystack.match(/\byour\b/g)?.length ?? 0);
    if (youCount >= 2) {
      audienceFit += 35;
      audienceSignals.push(
        `second-person voice detected (${youCount} hit${youCount === 1 ? '' : 's'})`,
      );
    } else if (youCount === 1) {
      audienceFit += 15;
      audienceSignals.push('one second-person reference — some audience-direct language');
    } else {
      audienceSignals.push('no second-person voice — copy may feel generic');
    }
    const audiencePhrases = [
      'built for',
      'designed for',
      'for teams',
      'for developers',
      'for founders',
      'for creators',
      'for marketers',
      'perfect for',
      'made for',
    ];
    if (audiencePhrases.some((p) => haystack.includes(p))) {
      audienceFit += 15;
      audienceSignals.push('explicit "for X" audience phrase detected');
    }
  } else {
    audienceSignals.push('no page content to evaluate audience fit');
  }
  audienceFit = clamp(audienceFit, 0, 100);

  if (metrics?.seo !== undefined) {
    audienceFit = clamp(Math.round((audienceFit + metrics.seo) / 2), 0, 100);
  }

  const rubricScores: RubricScore[] = [
    { rubricId: 'positioning', score: positioning, note: positioningSignals.join('; ') },
    {
      rubricId: 'differentiation',
      score: differentiation,
      note: differentiationSignals.join('; '),
    },
    { rubricId: 'conversion', score: conversion, note: conversionSignals.join('; ') },
    { rubricId: 'copy', score: copy, note: copyNote },
    { rubricId: 'audience-fit', score: audienceFit, note: audienceSignals.join('; ') },
  ];

  const overall = round(
    positioning * 0.25 +
      differentiation * 0.2 +
      conversion * 0.25 +
      copy * 0.15 +
      audienceFit * 0.15,
  );

  let evidencePoints = 0;
  if (hasScreenshots(evidence)) evidencePoints += 1;
  if (hasPageContent(evidence)) evidencePoints += 1;
  if (metadata.facts.title || metadata.facts.description) evidencePoints += 1;
  if (pageContent && pageContent.links.length > 0) evidencePoints += 1;
  if (hasMetrics(evidence)) evidencePoints += 1;
  const confidence = evidencePoints >= 4 ? 0.85 : evidencePoints >= 2 ? 0.7 : 0.5;

  // --- findings ----------------------------------------------------------
  const findings: ReviewerFinding[] = [];
  if (!firstHeading) {
    findings.push({
      title: 'No headline extracted',
      detail:
        'The page does not surface a clear H1. Without a headline, the visitor cannot determine what the product is in the first 5 seconds.',
      category: 'positioning',
      confidence: 0.95,
    });
  }
  if (!metadata.facts.description) {
    findings.push({
      title: 'No meta description',
      detail:
        'No `<meta name="description">` content was captured. The product misses an opportunity to articulate positioning in search and social previews.',
      category: 'positioning',
      confidence: 0.9,
    });
  }
  if (ctaCount === 0) {
    findings.push({
      title: 'No CTA detected',
      detail:
        'No link text matches common call-to-action patterns ("Get started", "Sign up", "Try", "Book"). The page may lack a clear primary action.',
      category: 'conversion',
      confidence: 0.85,
    });
  }
  if (socialProof === 0) {
    findings.push({
      title: 'No social proof / trust signals',
      detail:
        'No link matches common social-proof patterns (customers, testimonials, press, "backed by"). Trust signals are absent from the captured evidence.',
      category: 'conversion',
      confidence: 0.7,
    });
  }
  if (pageContent && pageContent.body.length > 0) {
    const words = pageContent.body.split(/\s+/).filter(Boolean);
    if (words.length > 0 && words.length < 20) {
      findings.push({
        title: 'Thin body copy',
        detail: `Only ${words.length} words of body copy. The positioning is unlikely to be persuasive.`,
        category: 'copy',
        confidence: 0.75,
      });
    }
  }

  // --- strengths + weaknesses -------------------------------------------
  const strengths: string[] = [];
  if (positioning >= 80) strengths.push('Headline + metadata form a clear positioning statement.');
  if (ctaCount >= 2) strengths.push('Multiple CTAs — primary action is reinforced.');
  if (socialProof >= 1) strengths.push('Social proof / trust signals are visible.');
  if (audienceFit >= 75)
    strengths.push('Copy is written in a second-person voice for a defined audience.');
  if (copy >= 80) strengths.push('Copy is substantial and well-paced.');

  const weaknesses: string[] = [];
  if (positioning < 60)
    weaknesses.push('Positioning is unclear — headline / metadata are missing or thin.');
  if (ctaCount === 0) weaknesses.push('No CTAs detected in the page content.');
  if (socialProof === 0) weaknesses.push('No social proof or trust signals surfaced.');
  if (differentiation < 50) weaknesses.push('No explicit "vs alternative" framing detected.');

  // --- priority fixes ----------------------------------------------------
  const priorityFixes: PriorityFix[] = [];
  if (positioning < 70) {
    priorityFixes.push({
      title: 'Sharpen the headline and subhead',
      description:
        'Add a one-sentence headline and a one-sentence subhead that name the audience and the outcome. The first 5 seconds decide whether the visitor stays.',
      effort: 'low',
      impact: 'high',
    });
  }
  if (ctaCount === 0) {
    priorityFixes.push({
      title: 'Add a primary call-to-action',
      description:
        'No CTA-style link was detected. Add a clear primary action above the fold (e.g. "Get started", "Try it free", "Book a demo").',
      effort: 'low',
      impact: 'high',
    });
  }
  if (socialProof === 0) {
    priorityFixes.push({
      title: 'Add social proof',
      description:
        'Add at least one trust signal — a customer logo strip, a testimonial, a "backed by" line, or a press mention. Visitors need a reason to believe.',
      effort: 'medium',
      impact: 'medium',
    });
  }
  if (differentiation < 50) {
    priorityFixes.push({
      title: 'State the differentiation explicitly',
      description:
        'Add a "Unlike X, we Y" or "Built for X, not for Y" line so the visitor knows why this is different from the obvious alternative.',
      effort: 'low',
      impact: 'medium',
    });
  }
  if (!metadata.facts.description) {
    priorityFixes.push({
      title: 'Write a meta description',
      description:
        'Add a `<meta name="description">` with a one-sentence positioning statement. This surfaces in search results and social previews.',
      effort: 'low',
      impact: 'low',
    });
  }

  return {
    rubricScores,
    findings,
    strengths,
    weaknesses,
    priorityFixes,
    overall,
    confidence,
    source: evidence.metadata.source,
  };
};

/**
 * Code-source marketing analysis. Looks at the README, the
 * project description (from `metadata.facts.description` /
 * `metadata.input.label`), and any "Used by" / "Customers"
 * signals in the README. Recommendations are framed for a
 * repository (e.g. "Add a 'Used by' / customers list" rather
 * than "Add a primary CTA").
 */
const analyzeCode = (evidence: EvidenceBundle): Analysis => {
  const { metadata } = evidence;
  const files = hasFiles(evidence) ? evidence.files : undefined;
  const readme = files?.readme;
  const readmeLength = readme?.length ?? 0;
  const fileTree = files?.fileTree ?? [];

  const title = metadata.facts.title;
  const description = metadata.facts.description;
  const label = metadata.input.label;

  const haystack = `${title ?? ''} ${description ?? ''} ${readme ?? ''}`.toLowerCase();

  // --- positioning -------------------------------------------------------
  // For a repo, "positioning" = "is the project's value
  // proposition clear from the README + the metadata
  // (description, language, etc.)?".
  let positioning = 30;
  const positioningSignals: string[] = [];
  if (description && description.length > 0) {
    positioning += 25;
    positioningSignals.push(`project description present ("${description.slice(0, 60)}")`);
  } else if (title && title.length > 0) {
    positioning += 15;
    positioningSignals.push(
      `project title present ("${title.slice(0, 60)}") — description is missing`,
    );
  } else {
    positioningSignals.push('no project description or title in metadata');
  }
  if (readme && readmeLength > 0) {
    if (readmeLength >= 1500) {
      positioning += 30;
      positioningSignals.push(`README is substantial (${readmeLength.toLocaleString()} chars)`);
    } else if (readmeLength >= 500) {
      positioning += 20;
      positioningSignals.push(`README is reasonable (${readmeLength.toLocaleString()} chars)`);
    } else if (readmeLength >= 200) {
      positioning += 10;
      positioningSignals.push(`README is short (${readmeLength.toLocaleString()} chars)`);
    } else {
      positioning += 5;
      positioningSignals.push(`README is very short (${readmeLength.toLocaleString()} chars)`);
    }
  } else {
    positioningSignals.push('no README in the project');
  }
  positioning = clamp(positioning, 0, 100);

  // --- differentiation ---------------------------------------------------
  let differentiation = 35;
  const differentiationSignals: string[] = [];
  const compareHits =
    (haystack.match(/\bvs\.?\b/g)?.length ?? 0) +
    (haystack.match(/\bversus\b/g)?.length ?? 0) +
    (haystack.match(/\bunlike\b/g)?.length ?? 0) +
    (haystack.match(/\balternative\b/g)?.length ?? 0) +
    (haystack.match(/\bbetter than\b/g)?.length ?? 0) +
    (haystack.match(/\binstead of\b/g)?.length ?? 0) +
    (haystack.match(/\bopen[- ]source\b/g)?.length ?? 0) +
    (haystack.match(/\bself[- ]hosted\b/g)?.length ?? 0);
  if (compareHits >= 1) {
    differentiation += 40;
    differentiationSignals.push(
      `comparison-style language detected (${compareHits} hit${compareHits === 1 ? '' : 's'})`,
    );
  } else {
    differentiationSignals.push('no explicit comparison / alternative framing detected');
  }
  if (readme && (readme.match(/^#{1,6}\s+/gm) ?? []).length >= 3) {
    differentiation += 15;
    differentiationSignals.push(
      'multiple README sections — likely articulates more than one angle',
    );
  }
  differentiation = clamp(differentiation, 0, 100);

  // --- conversion --------------------------------------------------------
  // "Conversion" for a repo = "does the README give the
  // visitor a clear next step?". A "Quick start" / "Install"
  // section, a star / fork count, a download count, or a
  // "Used by" section all count.
  let conversion = 35;
  const conversionSignals: string[] = [];
  if (readme) {
    const hasInstall =
      /\b(npm install|pnpm install|yarn add|pip install|cargo build|go mod|brew install|docker run)\b/i.test(
        readme,
      );
    if (hasInstall) {
      conversion += 30;
      conversionSignals.push('install command visible in the README');
    } else {
      conversionSignals.push('no install command in the README');
    }
    if (readmeMentionsSocialProof(readme)) {
      conversion = clamp(conversion + 25, 0, 100);
      conversionSignals.push('"Used by" / social-proof vocabulary in the README');
    }
  } else {
    conversionSignals.push('no README to evaluate conversion');
  }
  // Stars are a strong demand signal for a GitHub source.
  if (evidence.metrics?.stars !== undefined) {
    const stars = evidence.metrics.stars;
    if (stars >= 100) {
      conversion = clamp(conversion + 20, 0, 100);
      conversionSignals.push(`star count signals demand: ${stars}`);
    } else if (stars >= 10) {
      conversion = clamp(conversion + 10, 0, 100);
      conversionSignals.push(`early star count: ${stars}`);
    }
  }
  conversion = clamp(conversion, 0, 100);

  // --- copy quality ------------------------------------------------------
  let copy = 50;
  let copyNote = 'No README to evaluate copy quality.';
  if (readme && readmeLength > 0) {
    const words = readme.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    if (wordCount >= 200) {
      copy += 30;
      copyNote = `Substantial README (${wordCount.toLocaleString()} words).`;
    } else if (wordCount >= 60) {
      copy += 20;
      copyNote = `Modest README (${wordCount.toLocaleString()} words).`;
    } else if (wordCount >= 20) {
      copy += 10;
      copyNote = `Short README (${wordCount.toLocaleString()} words).`;
    } else {
      copy += 5;
      copyNote = `Very short README (${wordCount.toLocaleString()} words).`;
    }
  }
  copy = clamp(copy, 0, 100);

  // --- audience fit ------------------------------------------------------
  let audienceFit = 40;
  const audienceSignals: string[] = [];
  const youCount =
    (haystack.match(/\byou\b/g)?.length ?? 0) + (haystack.match(/\byour\b/g)?.length ?? 0);
  if (youCount >= 2) {
    audienceFit += 35;
    audienceSignals.push(
      `second-person voice detected (${youCount} hit${youCount === 1 ? '' : 's'})`,
    );
  } else if (youCount === 1) {
    audienceFit += 15;
    audienceSignals.push('one second-person reference — some audience-direct language');
  } else {
    audienceSignals.push('no second-person voice — copy may feel generic');
  }
  const audiencePhrases = [
    'built for',
    'designed for',
    'for teams',
    'for developers',
    'for founders',
    'for creators',
    'for marketers',
    'perfect for',
    'made for',
  ];
  if (audiencePhrases.some((p) => haystack.includes(p))) {
    audienceFit += 15;
    audienceSignals.push('explicit "for X" audience phrase detected');
  }
  audienceFit = clamp(audienceFit, 0, 100);

  const rubricScores: RubricScore[] = [
    { rubricId: 'positioning', score: positioning, note: positioningSignals.join('; ') },
    {
      rubricId: 'differentiation',
      score: differentiation,
      note: differentiationSignals.join('; '),
    },
    { rubricId: 'conversion', score: conversion, note: conversionSignals.join('; ') },
    { rubricId: 'copy', score: copy, note: copyNote },
    { rubricId: 'audience-fit', score: audienceFit, note: audienceSignals.join('; ') },
  ];

  const overall = round(
    positioning * 0.25 +
      differentiation * 0.2 +
      conversion * 0.25 +
      copy * 0.15 +
      audienceFit * 0.15,
  );

  let evidencePoints = 0;
  if (readme && readmeLength > 0) evidencePoints += 1;
  if (title || description) evidencePoints += 1;
  if (fileTree.length > 0) evidencePoints += 1;
  if (evidence.metrics?.stars !== undefined) evidencePoints += 1;
  if (files?.license) evidencePoints += 1;
  const confidence = evidencePoints >= 4 ? 0.85 : evidencePoints >= 2 ? 0.7 : 0.5;

  // --- findings ----------------------------------------------------------
  const findings: ReviewerFinding[] = [];
  if (!description) {
    findings.push({
      title: 'No project description',
      detail: `The submission "${label}" has no short description. Add a one-sentence description so the visitor knows what the project is.`,
      category: 'positioning',
      confidence: 0.85,
    });
  }
  if (!readme || readmeLength === 0) {
    findings.push({
      title: 'No README',
      detail:
        'There is no README in the project. The visitor cannot tell what the project does or why it exists.',
      category: 'positioning',
      confidence: 0.95,
    });
  } else if (readmeLength < 200) {
    findings.push({
      title: 'README is very short',
      detail: `Only ${readmeLength} characters. The visitor cannot evaluate the project from a one-paragraph README.`,
      category: 'positioning',
      confidence: 0.85,
    });
  }
  if (readme) {
    const hasInstall =
      /\b(npm install|pnpm install|yarn add|pip install|cargo build|go mod|brew install|docker run)\b/i.test(
        readme,
      );
    if (!hasInstall) {
      findings.push({
        title: 'No install command in the README',
        detail:
          'A developer cannot onboard from the README alone. Add a Quick start with the install command.',
        category: 'conversion',
        confidence: 0.85,
      });
    }
    if (!readmeMentionsSocialProof(readme)) {
      findings.push({
        title: 'No "Used by" or trust signal',
        detail:
          'The README does not mention users, customers, press, or backers. A short "Used by" line is a strong demand signal for a code source.',
        category: 'conversion',
        confidence: 0.7,
      });
    }
  }

  // --- strengths + weaknesses -------------------------------------------
  const strengths: string[] = [];
  if (positioning >= 80)
    strengths.push('Project description + README form a clear positioning statement.');
  if (readme && readmeLength >= 1500) strengths.push('README is substantial.');
  if (evidence.metrics?.stars !== undefined && evidence.metrics.stars >= 100) {
    strengths.push(`Star count signals demand (${evidence.metrics.stars}).`);
  }
  if (audienceFit >= 75)
    strengths.push('Copy is written in a second-person voice for a defined audience.');

  const weaknesses: string[] = [];
  if (positioning < 60)
    weaknesses.push('Positioning is unclear — README / description are missing or thin.');
  if (!readme || readmeLength === 0) weaknesses.push('No README in the project.');
  if (readme && !readmeMentionsSocialProof(readme))
    weaknesses.push('No "Used by" / social proof in the README.');
  if (differentiation < 50) weaknesses.push('No explicit "vs alternative" framing detected.');

  // --- priority fixes ----------------------------------------------------
  const priorityFixes: PriorityFix[] = [];
  if (!description) {
    priorityFixes.push({
      title: 'Add a one-sentence project description',
      description: `The submission "${label}" has no short description. Add a one-sentence description in the project's metadata.`,
      effort: 'low',
      impact: 'high',
    });
  }
  if (!readme || readmeLength === 0) {
    priorityFixes.push({
      title: 'Add a README',
      description:
        'A README is the front door of a code project. Add a one-paragraph "What it is", a "How to run" section, and a "Who is it for" line.',
      effort: 'low',
      impact: 'high',
    });
  } else if (readmeLength < 200) {
    priorityFixes.push({
      title: 'Expand the README',
      description: `The README is only ${readmeLength} characters. Add a problem statement, install steps, and a usage example.`,
      effort: 'low',
      impact: 'high',
    });
  }
  if (readme && !readmeMentionsSocialProof(readme)) {
    priorityFixes.push({
      title: 'Add a "Used by" / customers section to the README',
      description:
        'Add a short "Used by" or customers list. Even one named user is a strong demand signal for a code source.',
      effort: 'medium',
      impact: 'medium',
    });
  }
  if (readme) {
    const hasInstall =
      /\b(npm install|pnpm install|yarn add|pip install|cargo build|go mod|brew install|docker run)\b/i.test(
        readme,
      );
    if (!hasInstall) {
      priorityFixes.push({
        title: 'Add a "Quick start" section to the README',
        description:
          'A developer cannot onboard from the README alone. Add a Quick start section with the exact install command.',
        effort: 'low',
        impact: 'high',
      });
    }
  }
  if (differentiation < 50) {
    priorityFixes.push({
      title: 'State the differentiation explicitly',
      description:
        'Add a "Unlike X, we Y" or "Built for X, not for Y" line so a visitor knows why this is different from the obvious alternative.',
      effort: 'low',
      impact: 'medium',
    });
  }

  return {
    rubricScores,
    findings,
    strengths,
    weaknesses,
    priorityFixes,
    overall,
    confidence,
    source: evidence.metadata.source,
  };
};

/**
 * Source-aware top-level entry. Branches on `metadata.source`
 * and delegates to the browser or code analyzer. Filters
 * `priorityFixes` through the banned-token safety net for
 * code sources so a stale website-specific recommendation
 * (e.g. "Add a primary call-to-action" or "Sharpen the
 * headline") can never slip in.
 */
const analyze = (evidence: EvidenceBundle): Analysis => {
  const source = evidence.metadata.source;
  const inner = isCodeSource(source) ? analyzeCode(evidence) : analyzeBrowser(evidence);
  if (!isCodeSource(source)) return inner;

  const filteredFixes = inner.priorityFixes.filter(
    (fix) =>
      !containsBannedToken(fix.title, source) && !containsBannedToken(fix.description, source),
  );
  // Also drop any finding whose title / detail accidentally
  // contains a banned token (e.g. "No CTA detected" mentions
  // the word "CTA" which is a banned token for code sources).
  const filteredFindings = inner.findings.filter(
    (f) => !containsBannedToken(f.title, source) && !containsBannedToken(f.detail, source),
  );
  return { ...inner, priorityFixes: filteredFixes, findings: filteredFindings };
};

/* -------------------------------------------------------------------------- */
/* Summary                                                                    */
/* -------------------------------------------------------------------------- */

const summarize = (a: Analysis, evidence: EvidenceBundle): string => {
  const source = sourceLabel(evidence.metadata.source);
  const target = evidence.metadata.input.label;
  const level =
    a.overall >= 85 ? 'strong' : a.overall >= 70 ? 'solid' : a.overall >= 50 ? 'mixed' : 'weak';
  return (
    `Marketing review of ${source} "${target}" is ${level} ` +
    `(score ${a.overall}/100, confidence ${a.confidence.toFixed(2)}). ` +
    `${a.strengths.length} strength${a.strengths.length === 1 ? '' : 's'}, ` +
    `${a.weaknesses.length} weakness${a.weaknesses.length === 1 ? '' : 'es'}, ` +
    `${a.priorityFixes.length} priority fix${a.priorityFixes.length === 1 ? '' : 'es'}.`
  );
};

/* -------------------------------------------------------------------------- */
/* Reviewer object                                                            */
/* -------------------------------------------------------------------------- */

const marketingReviewer: Reviewer = {
  id: 'marketing',
  descriptor,
  rubric,

  validate(output: ReviewerOutput): { ok: true } | { ok: false; reason: string } {
    if (output.reviewer !== 'marketing') {
      return { ok: false, reason: `Expected reviewer 'marketing', got '${output.reviewer}'.` };
    }
    if (output.score < 0 || output.score > 100) {
      return { ok: false, reason: `Score ${output.score} is outside 0–100.` };
    }
    if (output.confidence < 0 || output.confidence > 1) {
      return { ok: false, reason: `Confidence ${output.confidence} is outside 0–1.` };
    }
    if (output.schemaVersion !== 1) {
      return { ok: false, reason: `Unsupported schemaVersion ${output.schemaVersion}.` };
    }
    return { ok: true };
  },

  async run(ctx: ReviewerContext, _options?: ReviewerRunOptions): Promise<ReviewerOutput> {
    if (ctx.signal?.aborted) {
      const err: ReviewerError = {
        reviewer: 'marketing',
        kind: 'aborted',
        message: 'Marketing reviewer run was aborted before start.',
        retriable: false,
      };
      throw new Error(err.message);
    }

    const analysis = analyze(ctx.evidence);
    const output: ReviewerOutput = {
      reviewer: 'marketing',
      score: analysis.overall,
      confidence: analysis.confidence,
      summary: summarize(analysis, ctx.evidence),
      strengths: analysis.strengths,
      weaknesses: analysis.weaknesses,
      priorityFixes: analysis.priorityFixes,
      rubricScores: analysis.rubricScores,
      findings: analysis.findings,
      schemaVersion: 1,
    };

    const validate = marketingReviewer.validate;
    if (!validate) {
      throw new Error('Marketing reviewer is missing its validate() implementation.');
    }
    const validation = validate(output);
    if (!validation.ok) {
      const err: ReviewerError = {
        reviewer: 'marketing',
        kind: 'parse-error',
        message: validation.reason,
        retriable: false,
      };
      throw new Error(err.message);
    }

    return output;
  },
};

/* -------------------------------------------------------------------------- */
/* Module surface                                                             */
/* -------------------------------------------------------------------------- */

export async function runReviewer(
  ctx: ReviewerContext,
  options?: ReviewerRunOptions,
): Promise<ReviewerOutput> {
  return marketingReviewer.run(ctx, options);
}

export const createMarketingReviewer: ReviewerFactory = (_deps) => marketingReviewer;

export { marketingReviewer };

const marketingModule: ReviewerModule = {
  reviewer: marketingReviewer,
  REVIEWER_ID,
  runReviewer,
};

export default marketingModule;
