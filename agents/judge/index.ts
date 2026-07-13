/**
 * agents/judge — Hackathon Judge reviewer
 *
 * Task 6.8 — Real implementation.
 *
 * Scores the product as if it were a hackathon submission. The
 * judge is biased toward the 30-second wow factor, demo-ability,
 * technical ambition, polish relative to time spent, and
 * novelty of the idea.
 *
 * Public surface (matches `ReviewerModule` in
 * `agents/contract.ts`):
 *
 *   - `REVIEWER_ID`            — `'judge'`.
 *   - `judgeReviewer`          — the `Reviewer` object.
 *   - `runReviewer`            — legacy function entry point.
 *   - `createJudgeReviewer`    — `ReviewerFactory` for DI.
 *   - `default`                — the `ReviewerModule`.
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
import type { EvidenceBundle } from '@/types/evidence';

/* -------------------------------------------------------------------------- */
/* Identity                                                                   */
/* -------------------------------------------------------------------------- */

export const REVIEWER_ID = 'judge' as const satisfies ReviewerId;

/* -------------------------------------------------------------------------- */
/* Descriptor + rubric                                                        */
/* -------------------------------------------------------------------------- */

const descriptor: ReviewerDescriptor = {
  id: 'judge',
  role: REVIEWER_ROLES.judge,
  description:
    'Scores the product as a hackathon submission. Weights the 30-second wow factor, demo-ability, technical ambition, polish, and novelty of the idea.',
  defaultWeight: 0.15,
};

const rubric: ReviewerRubric = [
  {
    id: 'wow',
    label: '30-second wow factor',
    description: 'Does the hero / first paint pop?',
    weight: 0.25,
  },
  {
    id: 'demo-ability',
    label: 'Demo-ability',
    description: 'Can a stranger grasp the product in one screen?',
    weight: 0.2,
  },
  {
    id: 'ambition',
    label: 'Technical ambition',
    description: 'Is there real technical depth under the hood?',
    weight: 0.2,
  },
  {
    id: 'polish',
    label: 'Polish',
    description: 'Is the surface clean for the time spent?',
    weight: 0.15,
  },
  {
    id: 'novelty',
    label: 'Novelty',
    description: 'Is the idea more than another CRUD app?',
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
};

const analyze = (evidence: EvidenceBundle): Analysis => {
  const { screenshots, pageContent, files, metrics, metadata, logs } = evidence;

  // --- wow factor --------------------------------------------------------
  // A strong hero, a confident headline, and a clean first paint.
  let wow = 30;
  const wowSignals: string[] = [];
  if (screenshots.items.length >= 1) {
    wow += 25;
    wowSignals.push('hero / first-paint visual captured');
  } else {
    wowSignals.push('no screenshots — wow cannot be evaluated');
  }
  const firstHeading = pageContent?.headings[0];
  if (firstHeading && firstHeading.length > 0) {
    wow += 25;
    wowSignals.push(`headline present ("${firstHeading.slice(0, 60)}")`);
  } else {
    wowSignals.push('no headline — hero is mute');
  }
  if (metadata.facts.imageUrl) {
    wow += 10;
    wowSignals.push('OG image present — sharing previews will look branded');
  }
  if (pageContent && pageContent.body.length > 80) {
    wow += 10;
    wowSignals.push('substantial above-the-fold copy');
  }
  wow = clamp(wow, 0, 100);

  // --- demo-ability ------------------------------------------------------
  // Can a stranger grasp it in one screen? Headline + body + links
  // form a triangle: tell me what it is, why it matters, what I do next.
  let demo = 25;
  const demoSignals: string[] = [];
  if (pageContent) {
    const triangleOk =
      pageContent.headings.length > 0 &&
      pageContent.body.length > 0 &&
      pageContent.links.length > 0;
    if (triangleOk) {
      demo += 40;
      demoSignals.push('headline + body + link triangle is complete');
    } else {
      const missing: string[] = [];
      if (pageContent.headings.length === 0) missing.push('headline');
      if (pageContent.body.length === 0) missing.push('body');
      if (pageContent.links.length === 0) missing.push('link');
      demoSignals.push(`demo triangle missing: ${missing.join(', ')}`);
    }
    if (pageContent.body.length > 0 && pageContent.body.length < 200) {
      demo += 10;
      demoSignals.push('body copy is concise — easy to scan');
    } else if (pageContent.body.length >= 200) {
      demo += 5;
      demoSignals.push('body copy is long — demo-ability suffers');
    }
    // CTAs are key.
    let ctaCount = 0;
    for (const link of pageContent.links) {
      const t = link.text.trim().toLowerCase();
      if (
        t.startsWith('get ') ||
        t.startsWith('sign ') ||
        t.startsWith('try ') ||
        t.startsWith('start ') ||
        t.startsWith('book ') ||
        t.startsWith('demo') ||
        t.startsWith('launch')
      ) {
        ctaCount += 1;
      }
    }
    if (ctaCount >= 1) {
      demo += 20;
      demoSignals.push(`${ctaCount} CTA-style link${ctaCount === 1 ? '' : 's'}`);
    }
  } else {
    demoSignals.push('no page content to evaluate demo-ability');
  }
  demo = clamp(demo, 0, 100);

  // --- technical ambition ------------------------------------------------
  // A few heuristics: README + license, code-style project tree, multiple
  // file types, or non-trivial language hint in metadata.
  let ambition = 30;
  const ambitionSignals: string[] = [];
  if (files) {
    if (files.fileTree.length > 0) {
      ambition += 15;
      ambitionSignals.push(
        `${files.fileTree.length} file${files.fileTree.length === 1 ? '' : 's'} in tree`,
      );
    }
    if (files.readme && files.readme.length > 0) {
      ambition += 15;
      ambitionSignals.push('README present — engineering footprint visible');
    }
    if (files.license) {
      ambition += 5;
      ambitionSignals.push('license present — distribution intent is real');
    }
    const exts = new Set(
      files.fileTree
        .map((p) => {
          const m = p.match(/\.([a-z0-9]+)$/i);
          return m && m[1] ? m[1].toLowerCase() : '';
        })
        .filter((s): s is string => s.length > 0),
    );
    if (exts.size >= 3) {
      ambition += 15;
      ambitionSignals.push(
        `${exts.size} file extensions — multi-layer project (${Array.from(exts).slice(0, 5).join(', ')})`,
      );
    } else if (exts.size >= 1) {
      ambition += 5;
      ambitionSignals.push(`${exts.size} file extension${exts.size === 1 ? '' : 's'}`);
    }
  } else {
    ambitionSignals.push('no file tree — technical ambition cannot be evaluated');
  }
  if (metadata.facts.language && metadata.facts.language.length > 0) {
    ambition += 10;
    ambitionSignals.push(`language hint: ${metadata.facts.language}`);
  }
  ambition = clamp(ambition, 0, 100);

  // --- polish ------------------------------------------------------------
  // Accessibility, performance, clean logs.
  let polish = 70;
  const polishSignals: string[] = ['baseline polish from a structured surface'];
  if (evidence.accessibility) {
    const a = evidence.accessibility.summary;
    polish = clamp(100 - a.critical * 18 - a.serious * 8 - a.moderate * 4 - a.minor * 2, 0, 100);
    polishSignals[0] = `accessibility: ${a.critical}C/${a.serious}S/${a.moderate}M/${a.minor}m`;
  }
  if (metrics?.performance !== undefined) {
    polish = clamp(Math.round((polish + metrics.performance) / 2), 0, 100);
    polishSignals.push(`Lighthouse performance: ${metrics.performance}/100`);
  }
  const errorCount = logs.items.filter((l) => l.level === 'error').length;
  const warnCount = logs.items.filter((l) => l.level === 'warn').length;
  if (errorCount > 0) {
    polish = clamp(polish - errorCount * 8, 0, 100);
    polishSignals.push(`${errorCount} runtime error${errorCount === 1 ? '' : 's'} damage polish`);
  }
  if (warnCount > 0) {
    polish = clamp(polish - warnCount * 2, 0, 100);
    polishSignals.push(`${warnCount} runtime warning${warnCount === 1 ? '' : 's'}`);
  }
  polish = clamp(polish, 0, 100);

  // --- novelty -----------------------------------------------------------
  // Hard to detect deterministically. We reward: a second-person
  // pitch, a specific audience phrase, an uncommon tech stack, and a
  // GitHub README whose length suggests a real artifact rather than
  // a starter template.
  let novelty = 50;
  const noveltySignals: string[] = [];
  if (pageContent) {
    const haystack = `${pageContent.headings.join(' ')} ${pageContent.body}`.toLowerCase();
    const specificAudience =
      /\bfor (developers|designers|founders|creators|marketers|agencies|teams|smb|enterprise|students)\b/.test(
        haystack,
      );
    if (specificAudience) {
      novelty += 15;
      noveltySignals.push('specific audience phrase detected');
    }
    const actionVerb =
      /\b(automate|orchestrate|generate|transform|repurpose|reimagine|rewrite|co-pilot|co-create|curate)\b/.test(
        haystack,
      );
    if (actionVerb) {
      novelty += 15;
      noveltySignals.push('action-verb framing detected — likely not CRUD');
    }
  }
  if (files && files.readme) {
    if (files.readme.length > 2000) {
      novelty += 10;
      noveltySignals.push('README is substantial — likely a real artifact, not a starter template');
    } else if (files.readme.length > 500) {
      novelty += 5;
      noveltySignals.push('README is reasonable length');
    }
  }
  if (files) {
    const exts = new Set(
      files.fileTree
        .map((p) => {
          const m = p.match(/\.([a-z0-9]+)$/i);
          return m && m[1] ? m[1].toLowerCase() : '';
        })
        .filter((s): s is string => s.length > 0),
    );
    if (
      exts.has('rs') ||
      exts.has('go') ||
      exts.has('py') ||
      exts.has('ml') ||
      exts.has('ex') ||
      exts.has('exs')
    ) {
      novelty += 10;
      noveltySignals.push('less common tech-stack signal in the tree');
    }
  }
  novelty = clamp(novelty, 0, 100);

  const rubricScores: RubricScore[] = [
    { rubricId: 'wow', score: wow, note: wowSignals.join('; ') },
    { rubricId: 'demo-ability', score: demo, note: demoSignals.join('; ') },
    { rubricId: 'ambition', score: ambition, note: ambitionSignals.join('; ') },
    { rubricId: 'polish', score: polish, note: polishSignals.join('; ') },
    { rubricId: 'novelty', score: novelty, note: noveltySignals.join('; ') },
  ];

  const overall = round(wow * 0.25 + demo * 0.2 + ambition * 0.2 + polish * 0.15 + novelty * 0.2);

  // --- confidence --------------------------------------------------------
  let evidencePoints = 0;
  if (screenshots.items.length > 0) evidencePoints += 1;
  if (pageContent && pageContent.body.length > 0) evidencePoints += 1;
  if (files && files.fileTree.length > 0) evidencePoints += 1;
  if (files?.readme) evidencePoints += 1;
  if (evidence.accessibility || metrics?.performance !== undefined) evidencePoints += 1;
  const confidence = evidencePoints >= 4 ? 0.85 : evidencePoints >= 2 ? 0.7 : 0.5;

  // --- findings ----------------------------------------------------------
  const findings: ReviewerFinding[] = [];
  if (wow < 60) {
    findings.push({
      title: 'Weak wow factor',
      detail:
        'The 30-second wow factor is the single biggest lever for a hackathon submission. A muted hero loses judges fast.',
      category: 'wow',
      confidence: 0.9,
    });
  }
  if (demo < 60) {
    findings.push({
      title: 'Demo is not obvious in one screen',
      detail:
        'Headline / body / link triangle is incomplete. A judge watching the demo for 60 seconds needs to grasp the product immediately.',
      category: 'demo-ability',
      confidence: 0.85,
    });
  }
  if (ambition < 50) {
    findings.push({
      title: 'Technical ambition is hard to see',
      detail:
        'No README, no license, no file-tree signal. The judge cannot tell that there is depth under the hood.',
      category: 'ambition',
      confidence: 0.8,
    });
  }
  if (novelty < 50) {
    findings.push({
      title: 'Hard to tell this is not "another CRUD app"',
      detail:
        'No specific audience, no action-verb framing, no README signal. The novelty lever is not being pulled.',
      category: 'novelty',
      confidence: 0.7,
    });
  }
  if (errorCount > 0) {
    findings.push({
      title: 'Runtime errors visible',
      detail: `${errorCount} error${errorCount === 1 ? '' : 's'} in the runtime logs. The demo will visibly break.`,
      category: 'polish',
      confidence: 0.95,
    });
  }

  // --- strengths + weaknesses -------------------------------------------
  const strengths: string[] = [];
  if (wow >= 80) strengths.push('Hero / first paint pops.');
  if (demo >= 80) strengths.push('Demo is graspable in one screen.');
  if (ambition >= 75)
    strengths.push('Technical depth is visible (README, file tree, multi-layer project).');
  if (novelty >= 70) strengths.push('Idea reads as more than a CRUD app.');
  if (polish >= 85) strengths.push('Surface is clean for the time spent.');

  const weaknesses: string[] = [];
  if (wow < 60) weaknesses.push('Wow factor is muted.');
  if (demo < 60) weaknesses.push('Demo is not obvious in one screen.');
  if (ambition < 50) weaknesses.push('Technical ambition is hard to see.');
  if (errorCount > 0)
    weaknesses.push(
      `${errorCount} runtime error${errorCount === 1 ? '' : 's'} visible in the demo.`,
    );

  // --- priority fixes ----------------------------------------------------
  const priorityFixes: PriorityFix[] = [];
  if (wow < 70) {
    priorityFixes.push({
      title: 'Make the hero pop',
      description:
        'Add a confident headline, a strong visual, or a single one-line value prop. The 30-second wow is the biggest lever.',
      effort: 'low',
      impact: 'high',
    });
  }
  if (demo < 70) {
    priorityFixes.push({
      title: 'Tighten the demo triangle',
      description:
        'Make sure the hero screen shows: what it is (headline), why it matters (body), what to do next (CTA link).',
      effort: 'low',
      impact: 'high',
    });
  }
  if (ambition < 60 && (!files || !files.readme)) {
    priorityFixes.push({
      title: 'Surface the technical depth',
      description:
        'Add a README that explains the architecture, the data model, or the interesting technical decisions. Judges reward depth.',
      effort: 'medium',
      impact: 'medium',
    });
  }
  if (novelty < 60) {
    priorityFixes.push({
      title: 'Pull the novelty lever',
      description:
        'Name the specific audience in plain language and frame the action as a verb. Avoid generic positioning.',
      effort: 'low',
      impact: 'medium',
    });
  }
  if (errorCount > 0) {
    priorityFixes.push({
      title: 'Resolve runtime errors before the demo',
      description:
        'Any visible runtime error is a guaranteed deduction. Triage and fix before the live demo.',
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
  };
};

/* -------------------------------------------------------------------------- */
/* Summary                                                                    */
/* -------------------------------------------------------------------------- */

const summarize = (a: Analysis, evidence: EvidenceBundle): string => {
  const source = evidence.metadata.source;
  const target = evidence.metadata.input.label;
  const level =
    a.overall >= 85
      ? 'podium-worthy'
      : a.overall >= 70
        ? 'demo-ready'
        : a.overall >= 50
          ? 'rough cut'
          : 'not ready';
  return (
    `Hackathon judge review of ${source} target "${target}" is ${level} ` +
    `(score ${a.overall}/100, confidence ${a.confidence.toFixed(2)}). ` +
    `${a.strengths.length} strength${a.strengths.length === 1 ? '' : 's'}, ` +
    `${a.weaknesses.length} weakness${a.weaknesses.length === 1 ? '' : 'es'}, ` +
    `${a.priorityFixes.length} priority fix${a.priorityFixes.length === 1 ? '' : 'es'}.`
  );
};

/* -------------------------------------------------------------------------- */
/* Reviewer object                                                            */
/* -------------------------------------------------------------------------- */

const judgeReviewer: Reviewer = {
  id: 'judge',
  descriptor,
  rubric,

  validate(output: ReviewerOutput): { ok: true } | { ok: false; reason: string } {
    if (output.reviewer !== 'judge') {
      return { ok: false, reason: `Expected reviewer 'judge', got '${output.reviewer}'.` };
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
        reviewer: 'judge',
        kind: 'aborted',
        message: 'Judge reviewer run was aborted before start.',
        retriable: false,
      };
      throw new Error(err.message);
    }

    const analysis = analyze(ctx.evidence);
    const output: ReviewerOutput = {
      reviewer: 'judge',
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

    const validate = judgeReviewer.validate;
    if (!validate) {
      throw new Error('Judge reviewer is missing its validate() implementation.');
    }
    const validation = validate(output);
    if (!validation.ok) {
      const err: ReviewerError = {
        reviewer: 'judge',
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
  return judgeReviewer.run(ctx, options);
}

export const createJudgeReviewer: ReviewerFactory = (_deps) => judgeReviewer;

export { judgeReviewer };

const judgeModule: ReviewerModule = {
  reviewer: judgeReviewer,
  REVIEWER_ID,
  runReviewer,
};

export default judgeModule;
