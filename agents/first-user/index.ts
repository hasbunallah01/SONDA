/**
 * agents/first-user — First-time User reviewer
 *
 * Task 6.7 — Real implementation. Source-aware (Task 3.4).
 *
 * Scores the product from the cold-start, first-impression
 * perspective. For browser sources, the reviewer asks: in
 * 30 seconds, can a brand-new visitor figure out what this
 * product is, who it's for, and what to do next? For code
 * sources the question is the same shape, but aimed at a
 * developer landing on a GitHub repo or a ZIP archive: can
 * a brand-new visitor figure out what the project is, who
 * it's for, and how to run it in 30 seconds?
 *
 * Recommendations for code sources are framed for a
 * developer workflow ("Add a Quick start section to the
 * README", "Remove jargon from the README") and never
 * mention CTAs, hero sections, or above-the-fold copy.
 *
 * Public surface (matches `ReviewerModule` in
 * `agents/contract.ts`):
 *
 *   - `REVIEWER_ID`                 — `'first-user'`.
 *   - `firstUserReviewer`           — the `Reviewer` object.
 *   - `runReviewer`                 — legacy function entry point.
 *   - `createFirstUserReviewer`     — `ReviewerFactory` for DI.
 *   - `default`                     — the `ReviewerModule`.
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
  hasPageContent,
  hasScreenshots,
  isCodeSource,
  sourceLabel,
} from '@/agents/_lib/source';

/* -------------------------------------------------------------------------- */
/* Identity                                                                   */
/* -------------------------------------------------------------------------- */

export const REVIEWER_ID = 'first-user' as const satisfies ReviewerId;

/* -------------------------------------------------------------------------- */
/* Descriptor + rubric                                                        */
/* -------------------------------------------------------------------------- */

const descriptor: ReviewerDescriptor = {
  id: 'first-user',
  role: REVIEWER_ROLES['first-user'],
  description:
    'Scores the product from the cold-start, first-impression perspective. In 30 seconds, can a new visitor figure out what this product is, who it is for, and what to do next?',
  defaultWeight: 0.15,
};

const rubric: ReviewerRubric = [
  {
    id: 'purpose',
    label: 'Purpose clarity',
    description: "Is the product's purpose obvious above the fold?",
    weight: 0.25,
  },
  {
    id: 'plain-language',
    label: 'Plain language',
    description: 'Are the labels plain, or do they lean on jargon?',
    weight: 0.15,
  },
  {
    id: 'first-action',
    label: 'First action reachable',
    description: 'Can a new user complete the primary action without help?',
    weight: 0.25,
  },
  {
    id: 'trust',
    label: 'First-impression trust',
    description: 'Does the first impression inspire trust?',
    weight: 0.15,
  },
  {
    id: 'bounce-risk',
    label: 'Bounce risk',
    description: 'What friction is most likely to make a new visitor bounce?',
    weight: 0.2,
  },
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));

const round = (n: number): number => Math.round(n);

/**
 * A small list of words that strongly suggest jargon or fluffy
 * positioning copy. Each match slightly erodes the
 * "plain-language" axis.
 */
const JARGON_WORDS = [
  'synergize',
  'synergy',
  'paradigm',
  'leverage',
  'disrupt',
  'revolutionize',
  'unleash',
  'empower',
  'seamless',
  'frictionless',
  'best-in-class',
  'world-class',
  'next-generation',
  'cutting-edge',
  'holistic',
  'robust',
  'scalable',
  'enterprise-grade',
];

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
 * Browser-source first-user analysis. Looks at the page
 * headline, body copy, links (CTAs), trust signals, and
 * runtime errors.
 */
const analyzeBrowser = (evidence: EvidenceBundle): Analysis => {
  const { screenshots, metadata, logs } = evidence;
  const pageContent = hasPageContent(evidence) ? evidence.pageContent : undefined;

  // --- purpose clarity ---------------------------------------------------
  let purpose = 25;
  const purposeSignals: string[] = [];
  const firstHeading = pageContent?.headings[0];
  if (firstHeading && firstHeading.length > 0) {
    purpose += 30;
    purposeSignals.push(`headline present ("${firstHeading.slice(0, 60)}")`);
  } else {
    purposeSignals.push('no headline extracted — purpose is invisible above the fold');
  }
  if (metadata.facts.title && metadata.facts.title.length > 0) {
    purpose += 20;
    purposeSignals.push(`page title present ("${metadata.facts.title.slice(0, 60)}")`);
  }
  if (pageContent && pageContent.body.length > 0) {
    purpose += 15;
    purposeSignals.push('body copy is available to explain the purpose');
  }
  if (hasScreenshots(evidence)) {
    purpose += 5;
    purposeSignals.push('visual capture available — first-paint evidence exists');
  }
  purpose = clamp(purpose, 0, 100);

  // --- plain language ----------------------------------------------------
  let plainLanguage = 70;
  const plainSignals: string[] = [];
  if (pageContent) {
    const haystack = `${pageContent.headings.join(' ')} ${pageContent.body}`.toLowerCase();
    const jargonHits = JARGON_WORDS.filter((j) => haystack.includes(j));
    if (jargonHits.length === 0) {
      plainSignals.push('no common jargon detected');
    } else {
      plainLanguage = clamp(plainLanguage - jargonHits.length * 10, 0, 100);
      plainSignals.push(`jargon detected: ${jargonHits.join(', ')}`);
    }
    if (pageContent.body.length > 0) {
      const wordCount = pageContent.body.split(/\s+/).filter(Boolean).length;
      if (wordCount > 0) {
        const avgWordLength =
          pageContent.body.split(/\s+/).reduce((sum, w) => sum + w.length, 0) / wordCount;
        if (avgWordLength > 6.5) {
          plainLanguage = clamp(plainLanguage - 10, 0, 100);
          plainSignals.push(`average word length ${avgWordLength.toFixed(1)} — copy may be dense`);
        }
      }
    }
  } else {
    plainSignals.push('no page content to evaluate plain language');
  }
  plainLanguage = clamp(plainLanguage, 0, 100);

  // --- first action reachable -------------------------------------------
  let firstAction = 25;
  const firstActionSignals: string[] = [];
  if (pageContent) {
    let ctaCount = 0;
    for (const link of pageContent.links) {
      const t = link.text.trim().toLowerCase();
      if (
        t.startsWith('get ') ||
        t.startsWith('sign ') ||
        t.startsWith('try ') ||
        t.startsWith('start ') ||
        t.startsWith('book ') ||
        t.startsWith('join ') ||
        t.startsWith('subscribe') ||
        t.startsWith('download') ||
        t.startsWith('install') ||
        t.startsWith('demo')
      ) {
        ctaCount += 1;
      }
    }
    if (ctaCount >= 1) {
      firstAction += 35;
      firstActionSignals.push(`${ctaCount} CTA-style link${ctaCount === 1 ? '' : 's'} visible`);
    } else {
      firstActionSignals.push('no CTA-style links detected');
    }
    if (pageContent.links.length >= 5) {
      firstAction += 20;
      firstActionSignals.push('multiple navigable paths — a curious user can explore');
    } else if (pageContent.links.length >= 1) {
      firstAction += 10;
      firstActionSignals.push('at least one link present');
    }
  } else {
    firstActionSignals.push('no page content to evaluate first-action reachability');
  }
  if (!hasScreenshots(evidence)) {
    firstAction = clamp(firstAction - 10, 0, 100);
    firstActionSignals.push('no screenshots — primary action cannot be visually verified');
  }
  firstAction = clamp(firstAction, 0, 100);

  // --- trust -------------------------------------------------------------
  let trust = 60;
  const trustSignals: string[] = ['baseline trust from a clean surface'];
  if (metadata.facts.description) {
    trust += 10;
    trustSignals.push('meta description present');
  }
  if (pageContent) {
    const linkText = pageContent.links
      .map((l) => l.text)
      .join(' ')
      .toLowerCase();
    if (
      /(customer|testimonial|press|backed by|trusted by|used by|featured in|reviews?)/.test(
        linkText,
      )
    ) {
      trust += 20;
      trustSignals.push('trust / social-proof vocabulary present');
    }
  }
  const errorCount = logs.items.filter((l) => l.level === 'error').length;
  if (errorCount > 0) {
    trust = clamp(trust - errorCount * 10, 0, 100);
    trustSignals.push(`${errorCount} runtime error${errorCount === 1 ? '' : 's'} erode trust`);
  }
  trust = clamp(trust, 0, 100);

  // --- bounce risk -------------------------------------------------------
  let bounceRisk = 30;
  const bounceSignals: string[] = [];
  if (!firstHeading) {
    bounceRisk += 25;
    bounceSignals.push('no headline — visitor cannot orient in 5 seconds');
  }
  if (pageContent && pageContent.body.length === 0) {
    bounceRisk += 20;
    bounceSignals.push('no body copy — no reason to stay');
  }
  if (pageContent && pageContent.links.length === 0) {
    bounceRisk += 15;
    bounceSignals.push('no links — visitor has nowhere to go');
  }
  if (!hasScreenshots(evidence)) {
    bounceRisk += 10;
    bounceSignals.push('no visual evidence — visitor cannot evaluate visually');
  }
  if (errorCount > 0) {
    bounceRisk += 15;
    bounceSignals.push('runtime errors — visitor will see a broken surface');
  }
  if (pageContent && pageContent.body.length > 200) bounceRisk -= 10;
  if (pageContent && pageContent.links.length >= 5) bounceRisk -= 10;
  bounceRisk = clamp(bounceRisk, 0, 100);
  const bounce = clamp(100 - bounceRisk, 0, 100);

  const rubricScores: RubricScore[] = [
    { rubricId: 'purpose', score: purpose, note: purposeSignals.join('; ') },
    { rubricId: 'plain-language', score: plainLanguage, note: plainSignals.join('; ') },
    { rubricId: 'first-action', score: firstAction, note: firstActionSignals.join('; ') },
    { rubricId: 'trust', score: trust, note: trustSignals.join('; ') },
    { rubricId: 'bounce-risk', score: bounce, note: bounceSignals.join('; ') },
  ];

  const overall = round(
    purpose * 0.25 + plainLanguage * 0.15 + firstAction * 0.25 + trust * 0.15 + bounce * 0.2,
  );

  let evidencePoints = 0;
  if (hasScreenshots(evidence)) evidencePoints += 1;
  if (hasPageContent(evidence)) evidencePoints += 1;
  if (metadata.facts.title || metadata.facts.description) evidencePoints += 1;
  evidencePoints += 1; // logs are always present
  if (pageContent && pageContent.headings.length > 0) evidencePoints += 1;
  const confidence = evidencePoints >= 4 ? 0.85 : evidencePoints >= 2 ? 0.7 : 0.5;

  // --- findings ----------------------------------------------------------
  const findings: ReviewerFinding[] = [];
  if (!firstHeading) {
    findings.push({
      title: 'No headline — the visitor cannot orient',
      detail:
        'There is no H1 above the fold. A first-time visitor will not know what the product is within 5 seconds and will bounce.',
      category: 'purpose',
      confidence: 0.95,
    });
  }
  if (pageContent && pageContent.body.length > 0) {
    const haystack = `${pageContent.headings.join(' ')} ${pageContent.body}`.toLowerCase();
    const jargonHits = JARGON_WORDS.filter((j) => haystack.includes(j));
    if (jargonHits.length > 0) {
      findings.push({
        title: 'Jargon in the copy',
        detail: `Words like ${jargonHits.slice(0, 3).join(', ')} repel first-time visitors. Plain language wins.`,
        category: 'plain-language',
        confidence: 0.8,
      });
    }
  }
  if (pageContent && pageContent.links.length === 0) {
    findings.push({
      title: 'No links — no way to start',
      detail: 'A first-time user has no obvious next step. The page reads as a dead end.',
      category: 'first-action',
      confidence: 0.9,
    });
  }
  if (errorCount > 0) {
    findings.push({
      title: 'Runtime errors visible',
      detail: `${errorCount} runtime error${errorCount === 1 ? '' : 's'} detected. A new visitor will see a broken surface.`,
      category: 'trust',
      confidence: 0.95,
    });
  }

  // --- strengths + weaknesses -------------------------------------------
  const strengths: string[] = [];
  if (purpose >= 80) strengths.push('Purpose is obvious above the fold.');
  if (plainLanguage >= 80) strengths.push('Copy is in plain, non-jargon language.');
  if (firstAction >= 80) strengths.push('A primary action is reachable in one click.');
  if (bounce >= 80) strengths.push('Bounce risk appears low.');

  const weaknesses: string[] = [];
  if (!firstHeading) weaknesses.push('No headline — the visitor cannot orient.');
  if (pageContent && pageContent.links.length === 0) weaknesses.push('No links — no path forward.');
  if (errorCount > 0)
    weaknesses.push(
      `${errorCount} runtime error${errorCount === 1 ? '' : 's'} visible to visitors.`,
    );

  // --- priority fixes ----------------------------------------------------
  const priorityFixes: PriorityFix[] = [];
  if (!firstHeading) {
    priorityFixes.push({
      title: 'Add a clear, plain headline',
      description:
        'A new visitor has 5 seconds. State what the product is and who it is for in one short sentence.',
      effort: 'low',
      impact: 'high',
    });
  }
  if (pageContent && pageContent.links.length === 0) {
    priorityFixes.push({
      title: 'Add at least one link / next step',
      description:
        'Give the visitor a way to start. A "Get started" button or a "Learn more" link is the minimum.',
      effort: 'low',
      impact: 'high',
    });
  }
  if (pageContent) {
    const haystack = `${pageContent.headings.join(' ')} ${pageContent.body}`.toLowerCase();
    const jargonHits = JARGON_WORDS.filter((j) => haystack.includes(j));
    if (jargonHits.length > 0) {
      priorityFixes.push({
        title: 'Remove jargon from the copy',
        description: `Words like ${jargonHits.slice(0, 3).join(', ')} repel first-time visitors. Replace with plain language.`,
        effort: 'low',
        impact: 'medium',
      });
    }
  }
  if (errorCount > 0) {
    priorityFixes.push({
      title: 'Resolve runtime errors',
      description:
        'Runtime errors are visible to the visitor and crush first-impression trust. Triage and fix.',
      effort: 'medium',
      impact: 'high',
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
 * Code-source first-user analysis. Looks at the README, the
 * project description, and any "Quick start" or install
 * command. Recommendations are framed for a developer
 * landing on a repo.
 */
const analyzeCode = (evidence: EvidenceBundle): Analysis => {
  const { metadata, logs } = evidence;
  const files = hasFiles(evidence) ? evidence.files : undefined;
  const readme = files?.readme;
  const readmeLength = readme?.length ?? 0;

  // --- purpose clarity ---------------------------------------------------
  let purpose = 25;
  const purposeSignals: string[] = [];
  if (readme && readmeLength > 0) {
    if (readmeLength >= 1500) {
      purpose += 50;
      purposeSignals.push(`README is substantial (${readmeLength.toLocaleString()} chars)`);
    } else if (readmeLength >= 500) {
      purpose += 35;
      purposeSignals.push(`README is reasonable (${readmeLength.toLocaleString()} chars)`);
    } else if (readmeLength >= 200) {
      purpose += 20;
      purposeSignals.push(`README is short (${readmeLength.toLocaleString()} chars)`);
    } else {
      purpose += 10;
      purposeSignals.push(`README is very short (${readmeLength.toLocaleString()} chars)`);
    }
  } else {
    purposeSignals.push('no README — purpose is invisible');
  }
  if (metadata.facts.description && metadata.facts.description.length > 0) {
    purpose += 20;
    purposeSignals.push(
      `project description present ("${metadata.facts.description.slice(0, 60)}")`,
    );
  }
  if (metadata.facts.title && metadata.facts.title.length > 0) {
    purpose += 5;
    purposeSignals.push(`project title present ("${metadata.facts.title.slice(0, 60)}")`);
  }
  purpose = clamp(purpose, 0, 100);

  // --- plain language ----------------------------------------------------
  let plainLanguage = 70;
  const plainSignals: string[] = [];
  if (readme) {
    const haystack = readme.toLowerCase();
    const jargonHits = JARGON_WORDS.filter((j) => haystack.includes(j));
    if (jargonHits.length === 0) {
      plainSignals.push('no common jargon detected in the README');
    } else {
      plainLanguage = clamp(plainLanguage - jargonHits.length * 10, 0, 100);
      plainSignals.push(`jargon detected: ${jargonHits.join(', ')}`);
    }
    if (readme.split(/\s+/).filter(Boolean).length > 0) {
      const words = readme.split(/\s+/).filter(Boolean);
      const avgWordLength = words.reduce((s, w) => s + w.length, 0) / words.length;
      if (avgWordLength > 6.5) {
        plainLanguage = clamp(plainLanguage - 10, 0, 100);
        plainSignals.push(
          `average word length ${avgWordLength.toFixed(1)} — README copy may be dense`,
        );
      }
    }
  } else {
    plainSignals.push('no README to evaluate plain language');
  }
  plainLanguage = clamp(plainLanguage, 0, 100);

  // --- first action reachable -------------------------------------------
  // For a code source, the "primary action" is "install +
  // run the project from the README alone". A Quick Start /
  // install command is the equivalent of a CTA.
  let firstAction = 25;
  const firstActionSignals: string[] = [];
  if (readme) {
    const lower = readme.toLowerCase();
    const hasInstallCmd =
      /\b(npm install|pnpm install|yarn add|pip install|cargo build|go mod|brew install|docker run)\b/.test(
        lower,
      );
    const hasQuickStart =
      /\b(quick start|getting started|installation|install|usage|how to run|run locally)\b/.test(
        lower,
      );
    if (hasInstallCmd) {
      firstAction += 35;
      firstActionSignals.push('install command visible in the README');
    } else {
      firstActionSignals.push('no install command in the README');
    }
    if (hasQuickStart) {
      firstAction += 25;
      firstActionSignals.push('Quick Start / Getting Started section present');
    }
    const headingCount = (readme.match(/^#{1,6}\s+/gm) ?? []).length;
    if (headingCount >= 5) {
      firstAction += 10;
      firstActionSignals.push(`README has ${headingCount} headings — easy to scan`);
    } else if (headingCount >= 2) {
      firstAction += 5;
      firstActionSignals.push(`README has ${headingCount} headings`);
    }
  } else {
    firstActionSignals.push('no README — developer workflow is invisible');
  }
  if (files?.license) {
    firstAction = clamp(firstAction + 5, 0, 100);
    firstActionSignals.push('license present — adoption friction is lower');
  }
  firstAction = clamp(firstAction, 0, 100);

  // --- trust -------------------------------------------------------------
  let trust = 60;
  const trustSignals: string[] = ['baseline trust from a clean project surface'];
  if (metadata.facts.description) {
    trust += 10;
    trustSignals.push('project description present');
  }
  if (readme) {
    const lower = readme.toLowerCase();
    if (/(customers?|used by|trusted by|backed by|featured in|press|testimonials?)/.test(lower)) {
      trust += 20;
      trustSignals.push('trust / "used by" vocabulary present in the README');
    }
  }
  if (files?.license) {
    trust += 5;
    trustSignals.push('license present');
  }
  if (evidence.metrics?.stars !== undefined) {
    const stars = evidence.metrics.stars;
    if (stars >= 100) {
      trust = clamp(trust + 15, 0, 100);
      trustSignals.push(`strong star count: ${stars}`);
    } else if (stars >= 10) {
      trust = clamp(trust + 8, 0, 100);
      trustSignals.push(`early star count: ${stars}`);
    }
  }
  const errorCount = logs.items.filter((l) => l.level === 'error').length;
  if (errorCount > 0) {
    trust = clamp(trust - errorCount * 10, 0, 100);
    trustSignals.push(`${errorCount} collector error${errorCount === 1 ? '' : 's'} erode trust`);
  }
  trust = clamp(trust, 0, 100);

  // --- bounce risk -------------------------------------------------------
  let bounceRisk = 30;
  const bounceSignals: string[] = [];
  if (!readme || readmeLength === 0) {
    bounceRisk += 25;
    bounceSignals.push('no README — visitor cannot orient in 5 seconds');
  } else if (readmeLength < 200) {
    bounceRisk += 15;
    bounceSignals.push('README is very short — visitor cannot evaluate the project');
  }
  if (!metadata.facts.description) {
    bounceRisk += 10;
    bounceSignals.push('no project description — visitor has no one-line summary');
  }
  if (!files?.license) {
    bounceRisk += 10;
    bounceSignals.push('no LICENSE — adoption friction is high');
  }
  if (errorCount > 0) {
    bounceRisk += 15;
    bounceSignals.push('collector errors — the analysis step did not complete cleanly');
  }
  if (readme && readme.split(/\s+/).filter(Boolean).length >= 200) bounceRisk -= 10;
  if (readme && (readme.match(/^#{1,6}\s+/gm) ?? []).length >= 5) bounceRisk -= 10;
  bounceRisk = clamp(bounceRisk, 0, 100);
  const bounce = clamp(100 - bounceRisk, 0, 100);

  const rubricScores: RubricScore[] = [
    { rubricId: 'purpose', score: purpose, note: purposeSignals.join('; ') },
    { rubricId: 'plain-language', score: plainLanguage, note: plainSignals.join('; ') },
    { rubricId: 'first-action', score: firstAction, note: firstActionSignals.join('; ') },
    { rubricId: 'trust', score: trust, note: trustSignals.join('; ') },
    { rubricId: 'bounce-risk', score: bounce, note: bounceSignals.join('; ') },
  ];

  const overall = round(
    purpose * 0.25 + plainLanguage * 0.15 + firstAction * 0.25 + trust * 0.15 + bounce * 0.2,
  );

  let evidencePoints = 0;
  if (readme && readmeLength > 0) evidencePoints += 1;
  if (metadata.facts.title || metadata.facts.description) evidencePoints += 1;
  if (files?.license) evidencePoints += 1;
  if (evidence.metrics?.stars !== undefined) evidencePoints += 1;
  evidencePoints += 1; // logs are always present
  const confidence = evidencePoints >= 4 ? 0.85 : evidencePoints >= 2 ? 0.7 : 0.5;

  // --- findings ----------------------------------------------------------
  const findings: ReviewerFinding[] = [];
  if (!readme || readmeLength === 0) {
    findings.push({
      title: 'No README — the visitor cannot orient',
      detail:
        'There is no README in the project. A first-time developer will not know what the project is within 5 seconds and will bounce.',
      category: 'purpose',
      confidence: 0.95,
    });
  } else if (readmeLength < 200) {
    findings.push({
      title: 'README is very short',
      detail: `Only ${readmeLength} characters. A first-time developer cannot evaluate the project from a one-paragraph README.`,
      category: 'purpose',
      confidence: 0.85,
    });
  }
  if (readme) {
    const lower = readme.toLowerCase();
    const jargonHits = JARGON_WORDS.filter((j) => lower.includes(j));
    if (jargonHits.length > 0) {
      findings.push({
        title: 'Jargon in the README',
        detail: `Words like ${jargonHits.slice(0, 3).join(', ')} repel first-time developers. Plain language wins.`,
        category: 'plain-language',
        confidence: 0.8,
      });
    }
  }
  if (readme) {
    const lower = readme.toLowerCase();
    const hasInstallCmd =
      /\b(npm install|pnpm install|yarn add|pip install|cargo build|go mod|brew install|docker run)\b/.test(
        lower,
      );
    if (!hasInstallCmd) {
      findings.push({
        title: 'No install command in the README',
        detail:
          'A first-time developer cannot onboard from the README alone. Add a Quick start with the install command.',
        category: 'first-action',
        confidence: 0.9,
      });
    }
  }
  if (!files?.license) {
    findings.push({
      title: 'No LICENSE — adoption friction is high',
      detail:
        'A missing LICENSE makes the project legally ambiguous. A first-time developer may bounce rather than risk the legal question.',
      category: 'trust',
      confidence: 0.8,
    });
  }
  if (errorCount > 0) {
    findings.push({
      title: 'Collector errors visible',
      detail: `${errorCount} collector error${errorCount === 1 ? '' : 's'} detected. The analysis step did not complete cleanly.`,
      category: 'trust',
      confidence: 0.95,
    });
  }

  // --- strengths + weaknesses -------------------------------------------
  const strengths: string[] = [];
  if (purpose >= 80) strengths.push('Purpose is obvious from the README.');
  if (plainLanguage >= 80) strengths.push('README is in plain, non-jargon language.');
  if (firstAction >= 80)
    strengths.push('A first-time developer can install + run from the README alone.');
  if (bounce >= 80) strengths.push('Bounce risk appears low.');

  const weaknesses: string[] = [];
  if (!readme || readmeLength === 0) weaknesses.push('No README — the visitor cannot orient.');
  if (readme && readmeLength > 0 && readmeLength < 200) weaknesses.push('README is very short.');
  if (
    readme &&
    !/\b(npm install|pnpm install|yarn add|pip install|cargo build|go mod|brew install|docker run)\b/i.test(
      readme,
    )
  ) {
    weaknesses.push('No install command in the README.');
  }
  if (!files?.license) weaknesses.push('No LICENSE — adoption friction is high.');

  // --- priority fixes ----------------------------------------------------
  const priorityFixes: PriorityFix[] = [];
  if (!readme || readmeLength === 0) {
    priorityFixes.push({
      title: 'Add a README',
      description:
        'A first-time developer has 5 seconds. State what the project is, who it is for, and how to run it in a short README.',
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
  if (readme) {
    const lower = readme.toLowerCase();
    const hasInstallCmd =
      /\b(npm install|pnpm install|yarn add|pip install|cargo build|go mod|brew install|docker run)\b/.test(
        lower,
      );
    if (!hasInstallCmd) {
      priorityFixes.push({
        title: 'Add a Quick start section to the README',
        description:
          'A first-time developer cannot onboard from the README alone. Add a "Quick start" with the install command and a minimal example.',
        effort: 'low',
        impact: 'high',
      });
    }
  }
  if (readme) {
    const lower = readme.toLowerCase();
    const jargonHits = JARGON_WORDS.filter((j) => lower.includes(j));
    if (jargonHits.length > 0) {
      priorityFixes.push({
        title: 'Remove jargon from the README',
        description: `Words like ${jargonHits.slice(0, 3).join(', ')} repel first-time developers. Replace with plain language.`,
        effort: 'low',
        impact: 'medium',
      });
    }
  }
  if (!files?.license) {
    priorityFixes.push({
      title: 'Add a LICENSE file',
      description:
        'A missing LICENSE makes the project legally ambiguous. Add a LICENSE (MIT or Apache-2.0 are common defaults).',
      effort: 'low',
      impact: 'medium',
    });
  }
  if (errorCount > 0) {
    priorityFixes.push({
      title: 'Resolve collector errors',
      description:
        'Runtime errors are visible to the visitor and crush first-impression trust. Triage and fix.',
      effort: 'medium',
      impact: 'high',
    });
  }

  const source = evidence.metadata.source;

  // Final safety net: drop any priority fix or finding whose
  // title or description contains a banned browser-only
  // token. The code-source analysis is already framed for a
  // repo, but the filter is the belt-and-braces guarantee.
  const filteredFixes = isCodeSource(source)
    ? priorityFixes.filter(
        (fix) =>
          !containsBannedToken(fix.title, source) && !containsBannedToken(fix.description, source),
      )
    : priorityFixes;
  const filteredFindings = isCodeSource(source)
    ? findings.filter(
        (f) => !containsBannedToken(f.title, source) && !containsBannedToken(f.detail, source),
      )
    : findings;

  return {
    rubricScores,
    findings: filteredFindings,
    strengths,
    weaknesses,
    priorityFixes: filteredFixes,
    overall,
    confidence,
    source,
  };
};

/**
 * Source-aware top-level entry. Branches on `metadata.source`
 * and delegates to the browser or code analyzer.
 */
const analyze = (evidence: EvidenceBundle): Analysis => {
  const source = evidence.metadata.source;
  return isCodeSource(source) ? analyzeCode(evidence) : analyzeBrowser(evidence);
};

/* -------------------------------------------------------------------------- */
/* Summary                                                                    */
/* -------------------------------------------------------------------------- */

const summarize = (a: Analysis, evidence: EvidenceBundle): string => {
  const source = sourceLabel(evidence.metadata.source);
  const target = evidence.metadata.input.label;
  const level =
    a.overall >= 85
      ? 'inviting'
      : a.overall >= 70
        ? 'welcoming'
        : a.overall >= 50
          ? 'mixed'
          : 'hostile';
  return (
    `First-time-user review of ${source} "${target}" is ${level} ` +
    `(score ${a.overall}/100, confidence ${a.confidence.toFixed(2)}). ` +
    `${a.strengths.length} strength${a.strengths.length === 1 ? '' : 's'}, ` +
    `${a.weaknesses.length} weakness${a.weaknesses.length === 1 ? '' : 'es'}, ` +
    `${a.priorityFixes.length} priority fix${a.priorityFixes.length === 1 ? '' : 'es'}.`
  );
};

/* -------------------------------------------------------------------------- */
/* Reviewer object                                                            */
/* -------------------------------------------------------------------------- */

const firstUserReviewer: Reviewer = {
  id: 'first-user',
  descriptor,
  rubric,

  validate(output: ReviewerOutput): { ok: true } | { ok: false; reason: string } {
    if (output.reviewer !== 'first-user') {
      return { ok: false, reason: `Expected reviewer 'first-user', got '${output.reviewer}'.` };
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
        reviewer: 'first-user',
        kind: 'aborted',
        message: 'First-time user reviewer run was aborted before start.',
        retriable: false,
      };
      throw new Error(err.message);
    }

    const analysis = analyze(ctx.evidence);
    const output: ReviewerOutput = {
      reviewer: 'first-user',
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

    const validate = firstUserReviewer.validate;
    if (!validate) {
      throw new Error('First-time user reviewer is missing its validate() implementation.');
    }
    const validation = validate(output);
    if (!validation.ok) {
      const err: ReviewerError = {
        reviewer: 'first-user',
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
  return firstUserReviewer.run(ctx, options);
}

export const createFirstUserReviewer: ReviewerFactory = (_deps) => firstUserReviewer;

export { firstUserReviewer };

const firstUserModule: ReviewerModule = {
  reviewer: firstUserReviewer,
  REVIEWER_ID,
  runReviewer,
};

export default firstUserModule;
