/**
 * agents/ux — UX Designer reviewer
 *
 * Task 6.4 — Real implementation. Source-aware (Task 3.4).
 *
 * Decides whether the product is usable, clear, and visually
 * crafted. For browser sources the reviewer uses
 * page-content + screenshots + accessibility signals. For code
 * sources (GitHub / ZIP) the reviewer uses the README, the
 * file tree, and project-shape signals — there is no rendered
 * page to evaluate, so recommendations about "hero",
 * "headline", "CTA", or "above the fold" are not emitted.
 *
 * Like the QA reviewer, the current implementation is
 * **deterministic**: it does not call an LLM. A future task can
 * drop in an LLM-backed variant via the `ReviewerFactory`
 * (`createUxReviewer`) without changing this module's public
 * surface.
 *
 * Public surface (matches the `ReviewerModule` shape in
 * `agents/contract.ts`):
 *
 *   - `REVIEWER_ID`       — the `ReviewerId` literal `'ux'`.
 *   - `uxReviewer`        — the object-shaped `Reviewer`.
 *   - `runReviewer`       — legacy function entry point that
 *                           delegates to `uxReviewer.run()`.
 *   - `createUxReviewer`  — `ReviewerFactory` for DI of future
 *                           LLM clients.
 *   - `default`           — the `ReviewerModule` the orchestrator
 *                           consumes at registration time.
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
  hasAccessibility,
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

export const REVIEWER_ID = 'ux' as const satisfies ReviewerId;

/* -------------------------------------------------------------------------- */
/* Descriptor + rubric                                                        */
/* -------------------------------------------------------------------------- */

const descriptor: ReviewerDescriptor = {
  id: 'ux',
  role: REVIEWER_ROLES.ux,
  description:
    'Decides whether the product is usable, clear, and visually crafted. Scores clarity of value proposition, visual hierarchy, primary-action usability, cross-surface consistency, and overall craft.',
  defaultWeight: 0.2,
};

const rubric: ReviewerRubric = [
  {
    id: 'clarity',
    label: 'Clarity of value proposition',
    description: 'Is the headline, subhead, and body copy immediately understandable?',
    weight: 0.25,
  },
  {
    id: 'hierarchy',
    label: 'Visual hierarchy',
    description: 'Are headings, body, and CTAs structured so the user knows where to look?',
    weight: 0.2,
  },
  {
    id: 'usability',
    label: 'Primary-action usability',
    description: 'Is the main call-to-action obvious and reachable in one click?',
    weight: 0.2,
  },
  {
    id: 'consistency',
    label: 'Cross-surface consistency',
    description: 'Do desktop and mobile / page-to-page surfaces feel coherent?',
    weight: 0.15,
  },
  {
    id: 'craft',
    label: 'Craft & polish',
    description: 'Typography, spacing, accessibility, and overall finish.',
    weight: 0.2,
  },
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));

const round = (n: number): number => Math.round(n);

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
 * Browser-source UX analysis. Uses the rendered page
 * (headings, body, links), screenshots, and any
 * accessibility findings. Recommendations are framed for a
 * live website (headline, hierarchy, primary action).
 */
const analyzeBrowser = (evidence: EvidenceBundle): Analysis => {
  const { screenshots, metrics } = evidence;

  // --- clarity -----------------------------------------------------------
  // Headline + body copy presence, length, and density.
  let clarity = 30;
  const claritySignals: string[] = [];
  if (hasPageContent(evidence)) {
    const body = evidence.pageContent.body;
    const wordCount = body.split(/\s+/).filter(Boolean).length;
    if (wordCount >= 30) {
      clarity += 40;
      claritySignals.push(`${wordCount} words of body copy present`);
    } else if (wordCount > 0) {
      clarity += 20;
      claritySignals.push(`only ${wordCount} word${wordCount === 1 ? '' : 's'} of body copy`);
    } else {
      claritySignals.push('no body copy');
    }
    const headingCount = evidence.pageContent.headings.length;
    if (headingCount > 0) {
      clarity += 30;
      claritySignals.push(`${headingCount} heading${headingCount === 1 ? '' : 's'}`);
    } else {
      claritySignals.push('no headings');
    }
  } else {
    claritySignals.push('no page content in evidence');
  }
  clarity = clamp(clarity, 0, 100);

  // --- hierarchy ---------------------------------------------------------
  // Hierarchical structure: how many headings vs body chars.
  let hierarchy = 40;
  const hierarchySignals: string[] = [];
  if (hasPageContent(evidence)) {
    const headingCount = evidence.pageContent.headings.length;
    if (headingCount > 0) {
      hierarchy += 30;
      if (headingCount >= 3) {
        hierarchy += 30;
        hierarchySignals.push(`${headingCount} headings — substantial hierarchy`);
      } else {
        hierarchySignals.push(`only ${headingCount} heading${headingCount === 1 ? '' : 's'}`);
      }
    } else {
      hierarchySignals.push('no headings to structure the page');
    }
  } else {
    hierarchySignals.push('no page content to score hierarchy');
  }
  hierarchy = clamp(hierarchy, 0, 100);

  // --- usability ---------------------------------------------------------
  // Primary action usability: presence of links, screenshots for context.
  let usability = 40;
  const usabilitySignals: string[] = [];
  if (hasPageContent(evidence)) {
    const linkCount = evidence.pageContent.links.length;
    if (linkCount > 0) {
      usability += 30;
      if (linkCount >= 3) {
        usability += 30;
        usabilitySignals.push(`${linkCount} link${linkCount === 1 ? '' : 's'} — clear navigation`);
      } else {
        usability += 10;
        usabilitySignals.push(`only ${linkCount} link${linkCount === 1 ? '' : 's'}`);
      }
    } else {
      usabilitySignals.push('no links in page content');
    }
    if (screenshots.items.length >= 1) {
      usabilitySignals.push(
        `${screenshots.items.length} screenshot${screenshots.items.length === 1 ? '' : 's'} captured`,
      );
    } else {
      usabilitySignals.push('no screenshots captured — primary action cannot be visually verified');
    }
  } else {
    usabilitySignals.push('no page content to evaluate primary-action usability');
  }
  usability = clamp(usability, 0, 100);

  // --- consistency -------------------------------------------------------
  // Cross-surface consistency: at least 2 screenshots, or at least 1 + page content.
  let consistency = 50;
  let consistencyNote = 'Insufficient signals to evaluate cross-surface consistency.';
  if (screenshots.items.length >= 2) {
    consistency = 85;
    consistencyNote = `Multiple viewport captures (${screenshots.items.length}) suggest cross-surface review.`;
  } else if (screenshots.items.length === 1 && hasPageContent(evidence)) {
    consistency = 70;
    consistencyNote = 'Single viewport capture; mobile vs desktop cannot be confirmed.';
  } else if (screenshots.items.length === 1) {
    consistency = 60;
    consistencyNote = 'Single screenshot; consistency cannot be fully evaluated.';
  } else {
    consistency = 40;
    consistencyNote = 'No screenshots; consistency is unprovable from the bundle alone.';
  }

  // --- craft -------------------------------------------------------------
  // Craft: low accessibility findings + clean logs = good craft.
  let craft = 80;
  let craftNote = 'No accessibility findings in the evidence bundle.';
  if (hasAccessibility(evidence)) {
    const a = evidence.accessibility.summary;
    craft = clamp(100 - a.critical * 18 - a.serious * 9 - a.moderate * 4 - a.minor * 2, 0, 100);
    craftNote =
      `${a.critical} critical, ${a.serious} serious, ${a.moderate} moderate, ` +
      `and ${a.minor} minor accessibility finding${a.minor === 1 ? '' : 's'}.`;
  }
  if (metrics?.accessibility !== undefined) {
    // The Lighthouse accessibility score is a strong craft signal.
    craft = clamp(Math.round((craft + metrics.accessibility) / 2), 0, 100);
    craftNote += ` Lighthouse accessibility: ${metrics.accessibility}/100.`;
  }

  const rubricScores: RubricScore[] = [
    { rubricId: 'clarity', score: clarity, note: claritySignals.join('; ') },
    { rubricId: 'hierarchy', score: hierarchy, note: hierarchySignals.join('; ') },
    { rubricId: 'usability', score: usability, note: usabilitySignals.join('; ') },
    { rubricId: 'consistency', score: consistency, note: consistencyNote },
    { rubricId: 'craft', score: craft, note: craftNote },
  ];

  const overall = round(
    clarity * 0.25 + hierarchy * 0.2 + usability * 0.2 + consistency * 0.15 + craft * 0.2,
  );

  // --- confidence --------------------------------------------------------
  // Same evidence-density heuristic as the QA reviewer. Capped at 0.85
  // because the implementation is deterministic and does not use an LLM.
  let evidencePoints = 0;
  if (hasScreenshots(evidence)) evidencePoints += 1;
  if (hasPageContent(evidence)) evidencePoints += 1;
  if (hasAccessibility(evidence)) evidencePoints += 1;
  if (hasMetrics(evidence)) evidencePoints += 1;
  evidencePoints += 1; // logs are always present
  const confidence = evidencePoints >= 4 ? 0.85 : evidencePoints >= 2 ? 0.7 : 0.5;

  // --- findings ----------------------------------------------------------
  const findings: ReviewerFinding[] = [];
  if (hasPageContent(evidence) && evidence.pageContent.body.length === 0) {
    findings.push({
      title: 'No body copy',
      detail:
        'The page has no extractable body text. The user cannot understand what the product does from the page itself.',
      category: 'clarity',
      confidence: 0.9,
    });
  } else if (hasPageContent(evidence)) {
    const wordCount = evidence.pageContent.body.split(/\s+/).filter(Boolean).length;
    if (wordCount > 0 && wordCount < 30) {
      findings.push({
        title: 'Very thin body copy',
        detail: `Only ${wordCount} words of body copy. The product is likely under-explained above the fold.`,
        category: 'clarity',
        confidence: 0.75,
      });
    }
  }
  if (
    hasPageContent(evidence) &&
    evidence.pageContent.headings.length === 0 &&
    evidence.pageContent.body.length > 0
  ) {
    findings.push({
      title: 'No headings',
      detail: 'Body copy exists but no headings were extracted. The page lacks visible structure.',
      category: 'hierarchy',
      confidence: 0.85,
    });
  }
  if (hasPageContent(evidence) && evidence.pageContent.links.length === 0) {
    findings.push({
      title: 'No links discovered',
      detail:
        'The page has no discoverable links. Users have no obvious next step or navigation path.',
      category: 'usability',
      confidence: 0.9,
    });
  }
  if (screenshots.items.length === 0) {
    findings.push({
      title: 'No screenshots',
      detail:
        'The bundle has no visual captures. The UX reviewer cannot judge hierarchy, polish, or mobile/desktop consistency.',
      category: 'consistency',
      confidence: 0.95,
    });
  } else if (screenshots.items.length === 1) {
    findings.push({
      title: 'Only one viewport captured',
      detail:
        'A single screenshot cannot reveal cross-surface issues (mobile vs desktop, dark mode, signed-out vs signed-in).',
      category: 'consistency',
      confidence: 0.8,
    });
  }
  if (hasAccessibility(evidence) && evidence.accessibility.summary.critical > 0) {
    findings.push({
      title: 'Critical accessibility findings',
      detail: `${evidence.accessibility.summary.critical} critical accessibility issue${evidence.accessibility.summary.critical === 1 ? '' : 's'} — craft and inclusive usability are at risk.`,
      category: 'craft',
      confidence: 0.9,
    });
  }

  // --- strengths + weaknesses -------------------------------------------
  const strengths: string[] = [];
  if (clarity >= 80) strengths.push('Headline and copy communicate the value proposition clearly.');
  if (hierarchy >= 80) strengths.push('Page has a clear visual hierarchy (≥ 3 headings).');
  if (hasPageContent(evidence) && evidence.pageContent.links.length >= 5) {
    strengths.push('Multiple primary navigation paths are visible.');
  }
  if (craft >= 85) strengths.push('No meaningful accessibility violations detected.');
  if (screenshots.items.length >= 2)
    strengths.push('Multiple viewport captures — cross-surface polish verified.');

  const weaknesses: string[] = [];
  if (hasPageContent(evidence) && evidence.pageContent.body.length === 0) {
    weaknesses.push('No body copy extracted — the value proposition is invisible.');
  }
  if (hasPageContent(evidence) && evidence.pageContent.headings.length === 0) {
    weaknesses.push('No headings — the page lacks visible structure.');
  }
  if (screenshots.items.length === 0) {
    weaknesses.push('No visual evidence — UX polish cannot be evaluated.');
  }
  if (
    hasAccessibility(evidence) &&
    evidence.accessibility.summary.critical + evidence.accessibility.summary.serious > 0
  ) {
    const total = evidence.accessibility.summary.critical + evidence.accessibility.summary.serious;
    weaknesses.push(`${total} critical+serious accessibility issue(s) impact inclusive craft.`);
  }

  // --- priority fixes ----------------------------------------------------
  const priorityFixes: PriorityFix[] = [];
  if (hasPageContent(evidence) && evidence.pageContent.body.length === 0) {
    priorityFixes.push({
      title: 'Add a clear above-the-fold value proposition',
      description:
        'Without body copy, the product does not communicate what it is or who it is for. Add a one-sentence headline and 1–2 supporting sentences above the fold.',
      effort: 'low',
      impact: 'high',
    });
  }
  if (
    hasPageContent(evidence) &&
    evidence.pageContent.headings.length === 0 &&
    evidence.pageContent.body.length > 0
  ) {
    priorityFixes.push({
      title: 'Add headings to structure the page',
      description:
        'No headings were extracted from the page. Add at least one H1 and a couple of H2s so the page reads as structured.',
      effort: 'low',
      impact: 'medium',
    });
  }
  if (screenshots.items.length === 0) {
    priorityFixes.push({
      title: 'Capture screenshots for visual review',
      description:
        'Without screenshots, downstream reviewers cannot judge visual quality. Re-run the analyzer with the browser collector enabled.',
      effort: 'low',
      impact: 'medium',
    });
  }
  if (hasAccessibility(evidence) && evidence.accessibility.summary.critical > 0) {
    priorityFixes.push({
      title: 'Fix critical accessibility violations',
      description:
        'Critical accessibility findings block users who rely on assistive technology. Address the top critical rule first, then re-run the analyzer.',
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
 * Code-source UX analysis. Evaluates the README, the project
 * file tree, and any docs / examples. The five rubric axes
 * map to: clarity of the README, hierarchy of the docs
 * structure, usability of the developer workflow (how easy
 * is it to install / run), consistency of the project shape,
 * and craft of the documentation.
 */
const analyzeCode = (evidence: EvidenceBundle): Analysis => {
  const files = hasFiles(evidence) ? evidence.files : undefined;
  const readme = files?.readme;
  const readmeLength = readme?.length ?? 0;
  const fileTree = files?.fileTree ?? [];
  const topLevel = files?.topLevel ?? [];

  // Build a docs / examples presence map from the file tree.
  const hasDocsDir = fileTree.some(
    (p) => /(^|\/)docs?\//i.test(p) || /(^|\/)documentation\//i.test(p),
  );
  const hasExamplesDir = fileTree.some(
    (p) => /(^|\/)examples?\//i.test(p) || /(^|\/)demo\//i.test(p) || /(^|\/)sample\//i.test(p),
  );
  const hasContributing = fileTree.some(
    (p) => /(^|\/)contributing\.md$/i.test(p) || /(^|\/)code_of_conduct\.md$/i.test(p),
  );
  const hasChangelog = fileTree.some(
    (p) => /(^|\/)changelog\.md$/i.test(p) || /(^|\/)changes\.md$/i.test(p),
  );

  // --- clarity -----------------------------------------------------------
  // The README is the "headline + body copy" of a code project.
  let clarity = 25;
  const claritySignals: string[] = [];
  if (readmeLength > 0) {
    clarity += 30;
    if (readmeLength >= 1500) {
      clarity += 30;
      claritySignals.push(`README is substantial (${readmeLength.toLocaleString()} chars)`);
    } else if (readmeLength >= 500) {
      clarity += 20;
      claritySignals.push(`README is reasonable (${readmeLength.toLocaleString()} chars)`);
    } else if (readmeLength >= 200) {
      clarity += 10;
      claritySignals.push(`README is short (${readmeLength.toLocaleString()} chars)`);
    } else {
      claritySignals.push(`README is very short (${readmeLength.toLocaleString()} chars)`);
    }
  } else {
    claritySignals.push('no README in the project — value proposition is invisible');
  }
  if (evidence.metadata.facts.description) {
    clarity += 10;
    claritySignals.push('project description present in metadata');
  }
  clarity = clamp(clarity, 0, 100);

  // --- hierarchy ---------------------------------------------------------
  // Hierarchy for a code project = "is the README + docs
  // organised into sections a new visitor can scan?".
  let hierarchy = 30;
  const hierarchySignals: string[] = [];
  if (readme && readme.length > 0) {
    const headingCount = (readme.match(/^#{1,6}\s+/gm) ?? []).length;
    if (headingCount >= 5) {
      hierarchy += 50;
      hierarchySignals.push(`README has ${headingCount} headings — strong hierarchy`);
    } else if (headingCount >= 2) {
      hierarchy += 30;
      hierarchySignals.push(`README has ${headingCount} headings`);
    } else if (headingCount >= 1) {
      hierarchy += 15;
      hierarchySignals.push('README has 1 heading');
    } else {
      hierarchySignals.push('README has no headings — flat structure');
    }
  } else {
    hierarchySignals.push('no README to score hierarchy');
  }
  if (hasDocsDir) {
    hierarchy += 20;
    hierarchySignals.push('docs/ directory present');
  }
  hierarchy = clamp(hierarchy, 0, 100);

  // --- usability ---------------------------------------------------------
  // "Primary-action usability" for a code project = "can a
  // new dev install + run it in one command?". We use
  // README content + project-shape signals.
  let usability = 30;
  const usabilitySignals: string[] = [];
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
      usability += 30;
      usabilitySignals.push('install command visible in the README');
    }
    if (hasQuickStart) {
      usability += 20;
      usabilitySignals.push('Quick Start / Getting Started section present');
    }
    if (!hasInstallCmd && !hasQuickStart) {
      usabilitySignals.push('no install command or Quick Start section visible in the README');
    }
  } else {
    usabilitySignals.push('no README — developer workflow is invisible');
  }
  if (hasExamplesDir) {
    usability += 10;
    usabilitySignals.push('examples/ directory present');
  }
  usability = clamp(usability, 0, 100);

  // --- consistency -------------------------------------------------------
  // "Cross-surface consistency" for a code project = "is the
  // top-level shape consistent and recognisable?".
  let consistency = 50;
  let consistencyNote = 'Insufficient signals to evaluate project-shape consistency.';
  if (fileTree.length > 0) {
    if (topLevel.length >= 3 && topLevel.length <= 8) {
      consistency = 80;
      consistencyNote = `Top-level layout has ${topLevel.length} entries — a recognisable project shape.`;
    } else if (topLevel.length > 0) {
      consistency = 65;
      consistencyNote = `Top-level layout has ${topLevel.length} entries.`;
    } else {
      consistency = 40;
      consistencyNote = 'No top-level entries; the project shape is flat.';
    }
    // Penalise a missing LICENSE — every public repo / OSS
    // distribution is expected to have one.
    if (!files?.license) {
      consistency = clamp(consistency - 10, 0, 100);
    }
  } else {
    consistency = 35;
    consistencyNote = 'No file tree; project shape is unknown.';
  }

  // --- craft -------------------------------------------------------------
  // Craft for a code project = "are the docs / examples /
  // contributing / changelog conventions present?".
  let craft = 60;
  let craftNote = 'No project-shape signals in the file tree.';
  if (fileTree.length > 0) {
    const craftSignals: string[] = [];
    if (hasDocsDir) {
      craft = clamp(craft + 12, 0, 100);
      craftSignals.push('docs/ present');
    }
    if (hasExamplesDir) {
      craft = clamp(craft + 10, 0, 100);
      craftSignals.push('examples/ present');
    }
    if (hasContributing) {
      craft = clamp(craft + 8, 0, 100);
      craftSignals.push('CONTRIBUTING / Code of Conduct present');
    }
    if (hasChangelog) {
      craft = clamp(craft + 5, 0, 100);
      craftSignals.push('CHANGELOG present');
    }
    if (craftSignals.length > 0) {
      craftNote = craftSignals.join('; ') + '.';
    } else {
      craftNote = 'No docs, examples, contributing, or changelog conventions in the project tree.';
    }
  }

  const rubricScores: RubricScore[] = [
    { rubricId: 'clarity', score: clarity, note: claritySignals.join('; ') },
    { rubricId: 'hierarchy', score: hierarchy, note: hierarchySignals.join('; ') },
    { rubricId: 'usability', score: usability, note: usabilitySignals.join('; ') },
    { rubricId: 'consistency', score: consistency, note: consistencyNote },
    { rubricId: 'craft', score: craft, note: craftNote },
  ];

  const overall = round(
    clarity * 0.25 + hierarchy * 0.2 + usability * 0.2 + consistency * 0.15 + craft * 0.2,
  );

  let evidencePoints = 0;
  if (fileTree.length > 0) evidencePoints += 1;
  if (readme && readmeLength > 0) evidencePoints += 1;
  if (evidence.metadata.facts.title || evidence.metadata.facts.description) evidencePoints += 1;
  if (files?.license) evidencePoints += 1;
  evidencePoints += 1; // logs are always present
  const confidence = evidencePoints >= 4 ? 0.85 : evidencePoints >= 2 ? 0.7 : 0.5;

  // --- findings ----------------------------------------------------------
  const findings: ReviewerFinding[] = [];
  if (!readme || readmeLength === 0) {
    findings.push({
      title: 'No README',
      detail:
        'There is no README in the project. A new visitor cannot tell what the project does or how to run it.',
      category: 'clarity',
      confidence: 0.95,
    });
  } else if (readmeLength < 200) {
    findings.push({
      title: 'README is very short',
      detail: `Only ${readmeLength} characters. A new visitor cannot evaluate the project from a one-paragraph README.`,
      category: 'clarity',
      confidence: 0.85,
    });
  }
  if (readme && readme.length > 0) {
    const headingCount = (readme.match(/^#{1,6}\s+/gm) ?? []).length;
    if (headingCount === 0) {
      findings.push({
        title: 'README has no headings',
        detail: 'A flat block of text — the README will not scan well. Add a few section headings.',
        category: 'hierarchy',
        confidence: 0.85,
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
          'A developer cannot onboard from the README alone. Add a "Quick start" section with the exact install command.',
        category: 'usability',
        confidence: 0.85,
      });
    }
  }
  if (!files?.license) {
    findings.push({
      title: 'No license file',
      detail:
        'A missing license makes the project legally ambiguous for adopters. Pick a license and add a LICENSE file.',
      category: 'consistency',
      confidence: 0.8,
    });
  }

  // --- strengths + weaknesses -------------------------------------------
  const strengths: string[] = [];
  if (clarity >= 80) strengths.push('README communicates the project clearly.');
  if (hierarchy >= 80) strengths.push('README / docs are well structured with section headings.');
  if (usability >= 75) strengths.push('Developer workflow is documented in the README.');
  if (craft >= 75) strengths.push('Project follows docs / examples / contributing conventions.');
  if (readme && readmeLength >= 1500) strengths.push('README is substantial.');

  const weaknesses: string[] = [];
  if (!readme || readmeLength === 0) weaknesses.push('No README — the project is undocumented.');
  if (readme && readmeLength > 0 && readmeLength < 200) weaknesses.push('README is very short.');
  if (
    readme &&
    !/\b(npm install|pnpm install|yarn add|pip install|cargo build|go mod|brew install|docker run)\b/i.test(
      readme,
    )
  ) {
    weaknesses.push('No install command in the README.');
  }
  if (!files?.license) weaknesses.push('No LICENSE file.');

  // --- priority fixes ----------------------------------------------------
  const priorityFixes: PriorityFix[] = [];
  if (!readme || readmeLength === 0) {
    priorityFixes.push({
      title: 'Add a README',
      description:
        'A README is the front door of a code project. Add a one-paragraph "What it is" and a "How to run" section.',
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
  if (readme && readme.length > 0) {
    const lower = readme.toLowerCase();
    const hasInstallCmd =
      /\b(npm install|pnpm install|yarn add|pip install|cargo build|go mod|brew install|docker run)\b/.test(
        lower,
      );
    if (!hasInstallCmd) {
      priorityFixes.push({
        title: 'Add a "Quick start" section to the README',
        description:
          'A developer cannot onboard from the README alone. Add a "Quick start" section with the exact install command and a minimal working example.',
        effort: 'low',
        impact: 'high',
      });
    }
  }
  if (!files?.license) {
    priorityFixes.push({
      title: 'Add a LICENSE file',
      description:
        'A missing license makes the project legally ambiguous for adopters. Add a LICENSE (MIT or Apache-2.0 are common defaults).',
      effort: 'low',
      impact: 'medium',
    });
  }
  if (readme && readme.length > 0) {
    const headingCount = (readme.match(/^#{1,6}\s+/gm) ?? []).length;
    if (headingCount === 0) {
      priorityFixes.push({
        title: 'Add section headings to the README',
        description:
          'The README is a flat block of text. Split it into scannable sections (Overview, Install, Usage, etc.).',
        effort: 'low',
        impact: 'medium',
      });
    }
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
 * (e.g. "Add a clear above-the-fold value proposition") can
 * never slip in.
 */
const analyze = (evidence: EvidenceBundle): Analysis => {
  const source = evidence.metadata.source;
  const inner = isCodeSource(source) ? analyzeCode(evidence) : analyzeBrowser(evidence);
  if (!isCodeSource(source)) return inner;

  const filteredFixes = inner.priorityFixes.filter(
    (fix) =>
      !containsBannedToken(fix.title, source) && !containsBannedToken(fix.description, source),
  );
  return { ...inner, priorityFixes: filteredFixes };
};

/* -------------------------------------------------------------------------- */
/* Summary                                                                    */
/* -------------------------------------------------------------------------- */

const summarize = (a: Analysis, evidence: EvidenceBundle): string => {
  const source = sourceLabel(evidence.metadata.source);
  const target = evidence.metadata.input.label;
  const level =
    a.overall >= 85 ? 'excellent' : a.overall >= 70 ? 'good' : a.overall >= 50 ? 'fair' : 'poor';
  return (
    `UX review of ${source} "${target}" is ${level} ` +
    `(score ${a.overall}/100, confidence ${a.confidence.toFixed(2)}). ` +
    `${a.strengths.length} strength${a.strengths.length === 1 ? '' : 's'}, ` +
    `${a.weaknesses.length} weakness${a.weaknesses.length === 1 ? '' : 'es'}, ` +
    `${a.priorityFixes.length} priority fix${a.priorityFixes.length === 1 ? '' : 'es'}.`
  );
};

/* -------------------------------------------------------------------------- */
/* Reviewer object                                                            */
/* -------------------------------------------------------------------------- */

const uxReviewer: Reviewer = {
  id: 'ux',
  descriptor,
  rubric,

  validate(output: ReviewerOutput): { ok: true } | { ok: false; reason: string } {
    if (output.reviewer !== 'ux') {
      return { ok: false, reason: `Expected reviewer 'ux', got '${output.reviewer}'.` };
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
        reviewer: 'ux',
        kind: 'aborted',
        message: 'UX reviewer run was aborted before start.',
        retriable: false,
      };
      throw new Error(err.message);
    }

    const analysis = analyze(ctx.evidence);
    const output: ReviewerOutput = {
      reviewer: 'ux',
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

    const validate = uxReviewer.validate;
    if (!validate) {
      throw new Error('UX reviewer is missing its validate() implementation.');
    }
    const validation = validate(output);
    if (!validation.ok) {
      const err: ReviewerError = {
        reviewer: 'ux',
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

/**
 * Backwards-compatible function entry point. Delegates to
 * `uxReviewer.run()` and is what the reviewer registry will
 * call when it dispatches the UX juror on a session.
 */
export async function runReviewer(
  ctx: ReviewerContext,
  options?: ReviewerRunOptions,
): Promise<ReviewerOutput> {
  return uxReviewer.run(ctx, options);
}

/**
 * `ReviewerFactory` for dependency injection. The current
 * implementation takes no dependencies; the signature exists
 * so a future LLM-backed variant can be slotted in without
 * changing the import surface (`createUxReviewer(deps)`).
 */
export const createUxReviewer: ReviewerFactory = (_deps) => uxReviewer;

/**
 * The `Reviewer` object itself, exported for tests and for
 * registries that prefer object-style registration over the
 * default module export.
 */
export { uxReviewer };

const uxModule: ReviewerModule = {
  reviewer: uxReviewer,
  REVIEWER_ID,
  runReviewer,
};

export default uxModule;
