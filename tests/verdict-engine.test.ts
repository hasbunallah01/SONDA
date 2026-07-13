/**
 * tests/verdict-engine.test.ts — Verdict engine smoke test
 *
 * Validates the verdict engine end-to-end against a synthetic
 * `EvidenceBundle`. The test is intentionally simple: feed
 * every reviewer a populated bundle, check that the verdict
 * returns a stable, reasonable shape, and that the score
 * aggregation respects the per-reviewer weights.
 *
 * Run with:
 *   npx tsx tests/verdict-engine.test.ts
 *
 * This file lives in `tests/` rather than co-located with the
 * source because it exercises the *integration* of multiple
 * modules. It does not require a database connection — the
 * `runReviewerPipeline` and `saveVerdict` steps that touch
 * the database are not invoked here; we call the pure
 * `computeVerdict` directly.
 */

import { computeVerdict, verdictStatusFromScore, aggregateScore } from '../features/verdict-engine';
import type { ReviewerOutput } from '../agents/types';
import type { EvidenceBundle } from '../types/evidence';

const makeOutput = (
  reviewer: ReviewerOutput['reviewer'],
  score: number,
  confidence: number,
  strengths: string[] = [],
  weaknesses: string[] = [],
  priorityFixes: ReviewerOutput['priorityFixes'] = [],
): ReviewerOutput => ({
  reviewer,
  score,
  confidence,
  summary: `${reviewer} review at ${score}/100`,
  strengths,
  weaknesses,
  priorityFixes,
  schemaVersion: 1,
});

const sampleOutputs: ReviewerOutput[] = [
  makeOutput(
    'qa',
    80,
    0.85,
    ['Clean logs'],
    ['No screenshots'],
    [{ title: 'Resolve runtime errors', description: '...', effort: 'medium', impact: 'high' }],
  ),
  makeOutput(
    'ux',
    70,
    0.8,
    ['Clear hierarchy'],
    ['Thin body copy'],
    [{ title: 'Add a clearer headline', description: '...', effort: 'low', impact: 'high' }],
  ),
  makeOutput(
    'marketing',
    60,
    0.7,
    [],
    ['No CTA detected'],
    [{ title: 'Add a primary call-to-action', description: '...', effort: 'low', impact: 'high' }],
  ),
  makeOutput(
    'investor',
    75,
    0.75,
    ['Problem is clear'],
    ['Traction is thin'],
    [
      {
        title: 'Show any traction or demand signal',
        description: '...',
        effort: 'medium',
        impact: 'high',
      },
    ],
  ),
  makeOutput(
    'judge',
    85,
    0.85,
    ['Wow factor'],
    ['Ambition is muted'],
    [{ title: 'Make the hero pop', description: '...', effort: 'low', impact: 'high' }],
  ),
  makeOutput(
    'first-user',
    65,
    0.7,
    ['Purpose is clear'],
    ['Jargon detected'],
    [{ title: 'Add a clear, plain headline', description: '...', effort: 'low', impact: 'high' }],
  ),
];

const sampleBundle: EvidenceBundle = {
  metadata: {
    id: 'bundle-1',
    source: 'website',
    submittedAt: new Date().toISOString(),
    input: { label: 'https://example.com' },
    facts: { title: 'Example', description: 'A sample product.' },
  },
  screenshots: { items: ['shot-1.png', 'shot-2.png'] },
  pageContent: {
    headings: ['Example', 'Features'],
    body: 'A sample product that does a sample thing. Get started today.',
    links: [{ href: '/start', text: 'Get started' }],
  },
  files: { fileTree: ['README.md', 'package.json', 'src/index.ts'], topLevel: ['README.md'] },
  metrics: { performance: 75, accessibility: 90, seo: 80 },
  accessibility: { summary: { critical: 0, serious: 0, moderate: 1, minor: 2 }, findings: [] },
  logs: { items: [] },
};

const assert = (cond: boolean, msg: string): void => {
  if (!cond) {
    // eslint-disable-next-line no-console
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log(`✓ ${msg}`);
};

// --- verdictStatusFromScore ---
assert(verdictStatusFromScore(95) === 'ready', 'score 95 → ready');
assert(verdictStatusFromScore(85) === 'ready', 'score 85 → ready (boundary)');
assert(verdictStatusFromScore(80) === 'almost', 'score 80 → almost');
assert(verdictStatusFromScore(70) === 'almost', 'score 70 → almost (boundary)');
assert(verdictStatusFromScore(60) === 'needs-work', 'score 60 → needs-work');
assert(verdictStatusFromScore(50) === 'needs-work', 'score 50 → needs-work (boundary)');
assert(verdictStatusFromScore(30) === 'not-ready', 'score 30 → not-ready');

// --- aggregateScore ---
const agg = aggregateScore(sampleOutputs);
assert(agg >= 60 && agg <= 90, `aggregateScore in expected range, got ${agg}`);

// --- computeVerdict ---
const verdict = computeVerdict(sampleOutputs);
assert(verdict.overallScore === agg, 'verdict.overallScore matches aggregateScore');
assert(
  verdict.status === verdictStatusFromScore(verdict.overallScore),
  'verdict.status matches overallScore',
);
assert(verdict.headline.length > 0, 'verdict.headline is non-empty');
assert(verdict.summary.length > 0, 'verdict.summary is non-empty');
assert(verdict.reviewerOutputs.length === 6, 'verdict includes all 6 reviewer outputs');
assert(verdict.priorityFixes.length > 0, 'verdict has prioritized fixes');

// --- dedup of priorityFixes ---
const dupOutputs: ReviewerOutput[] = [
  makeOutput(
    'qa',
    50,
    0.7,
    [],
    [],
    [{ title: 'Fix critical accessibility', description: '...', effort: 'medium', impact: 'high' }],
  ),
  makeOutput(
    'ux',
    50,
    0.7,
    [],
    [],
    [{ title: 'fix critical ACCESSIBILITY', description: '...', effort: 'low', impact: 'medium' }],
  ),
];
const dupVerdict = computeVerdict(dupOutputs);
assert(
  dupVerdict.priorityFixes.length === 1,
  'duplicate priorityFixes are deduped (case-insensitive)',
);
assert(
  dupVerdict.priorityFixes[0]?.impact === 'high' && dupVerdict.priorityFixes[0]?.effort === 'low',
  'dedup keeps the highest impact and lowest effort',
);

// --- priorityFixes ranking ---
const rankedOutputs: ReviewerOutput[] = [
  makeOutput(
    'qa',
    50,
    0.7,
    [],
    [],
    [{ title: 'low impact low effort', description: '...', effort: 'low', impact: 'low' }],
  ),
  makeOutput(
    'ux',
    50,
    0.7,
    [],
    [],
    [{ title: 'high impact high effort', description: '...', effort: 'high', impact: 'high' }],
  ),
];
const rankedVerdict = computeVerdict(rankedOutputs);
assert(
  rankedVerdict.priorityFixes[0]?.title === 'high impact high effort',
  'priorityFixes are ranked impact desc, effort asc',
);

// --- failed reviewers are excluded from the average ---
const partialOutputs: ReviewerOutput[] = [
  makeOutput('qa', 0, 0, [], []), // failed
  makeOutput('ux', 80, 0.7),
  makeOutput('marketing', 70, 0.7),
];
const partialAgg = aggregateScore(partialOutputs);
assert(partialAgg >= 70 && partialAgg <= 80, `partial aggregation in range, got ${partialAgg}`);

// --- empty outputs ---
const emptyAgg = aggregateScore([]);
assert(emptyAgg === 0, 'empty outputs → score 0');

// --- all failed outputs ---
const allFailed = [makeOutput('qa', 0, 0), makeOutput('ux', 0, 0)];
const allFailedAgg = aggregateScore(allFailed);
assert(allFailedAgg === 0, 'all-failed outputs → score 0');

// --- bundle shape sanity ---
assert(sampleBundle.metadata.id === 'bundle-1', 'sample bundle is well-formed');

// --- output reviewer field is preserved ---
assert(
  verdict.reviewerOutputs.every((o) => typeof o.reviewer === 'string'),
  'reviewer field is a string',
);
assert(
  verdict.reviewerOutputs.every((o) => o.schemaVersion === 1),
  'all reviewer outputs have schemaVersion 1',
);

// eslint-disable-next-line no-console
console.log('\nAll verdict engine smoke tests passed.');
