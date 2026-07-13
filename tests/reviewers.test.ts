/**
 * tests/reviewers.test.ts — Reviewer smoke test
 *
 * Runs every registered reviewer against a synthetic
 * `EvidenceBundle` and validates that each one returns a
 * well-formed `ReviewerOutput`. This catches the obvious
 * shape regressions — wrong id, out-of-range score,
 * schemaVersion !== 1, missing fields.
 *
 * Run with:
 *   npx tsx tests/reviewers.test.ts
 *
 * No database connection required — we call the `run` method
 * directly, bypassing the per-reviewer persistence helper.
 */

import { reviewerRegistry } from '../agents/registry';
import type { EvidenceBundle } from '../types/evidence';

const bundle: EvidenceBundle = {
  metadata: {
    id: 'bundle-1',
    source: 'website',
    submittedAt: new Date().toISOString(),
    input: { label: 'https://example.com' },
    facts: {
      title: 'Example — a sample product',
      description: 'A sample product that does a sample thing.',
      language: 'en',
      imageUrl: 'https://example.com/og.png',
    },
  },
  screenshots: {
    items: ['shot-1.png', 'shot-2.png'],
    viewports: [
      { name: 'desktop', width: 1280, height: 800 },
      { name: 'mobile', width: 375, height: 812 },
    ],
  },
  pageContent: {
    headings: ['Example', 'A sample product', 'Features', 'Pricing'],
    body: 'A sample product that does a sample thing for a defined audience. Get started today.',
    links: [
      { href: '/start', text: 'Get started' },
      { href: '/features', text: 'Features' },
      { href: '/pricing', text: 'Pricing' },
    ],
  },
  files: {
    fileTree: ['README.md', 'package.json', 'src/index.ts', 'src/lib/util.ts'],
    topLevel: ['README.md', 'package.json', 'src'],
    readme: '# Example\n\nA sample product.',
    license: 'MIT',
  },
  metrics: { performance: 80, accessibility: 95, bestPractices: 90, seo: 85 },
  accessibility: {
    summary: { critical: 0, serious: 0, moderate: 1, minor: 2 },
    findings: [],
  },
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

const main = async (): Promise<void> => {
  // --- registry sanity ---
  assert(reviewerRegistry.length === 6, `registry has 6 reviewers, got ${reviewerRegistry.length}`);
  assert(
    reviewerRegistry.map((m) => m.REVIEWER_ID).join(',') ===
      'qa,ux,marketing,investor,judge,first-user',
    'registry order is qa,ux,marketing,investor,judge,first-user',
  );

  // --- run each reviewer against a populated bundle ---
  for (const entry of reviewerRegistry) {
    const reviewer = entry.reviewer;
    const out = await reviewer.run({
      evidence: bundle,
      sessionId: 'test-session',
      reviewer: reviewer.id,
      runId: 'test-run',
    });

    assert(out.reviewer === reviewer.id, `${reviewer.id}: reviewer field matches`);
    assert(out.score >= 0 && out.score <= 100, `${reviewer.id}: score in 0-100, got ${out.score}`);
    assert(
      out.confidence >= 0 && out.confidence <= 1,
      `${reviewer.id}: confidence in 0-1, got ${out.confidence}`,
    );
    assert(out.schemaVersion === 1, `${reviewer.id}: schemaVersion === 1`);
    assert(
      typeof out.summary === 'string' && out.summary.length > 0,
      `${reviewer.id}: summary is non-empty`,
    );
    assert(Array.isArray(out.strengths), `${reviewer.id}: strengths is an array`);
    assert(Array.isArray(out.weaknesses), `${reviewer.id}: weaknesses is an array`);
    assert(Array.isArray(out.priorityFixes), `${reviewer.id}: priorityFixes is an array`);

    if (out.rubricScores) {
      assert(
        out.rubricScores.length === reviewer.rubric.length,
        `${reviewer.id}: rubricScores length matches rubric`,
      );
      for (const rs of out.rubricScores) {
        assert(rs.score >= 0 && rs.score <= 100, `${reviewer.id}: rubric score in 0-100`);
      }
    }
  }

  // --- run with empty bundle (graceful degradation) ---
  const emptyBundle: EvidenceBundle = {
    metadata: {
      id: 'empty',
      source: 'website',
      submittedAt: new Date().toISOString(),
      input: { label: 'https://example.com' },
      facts: {},
    },
    screenshots: { items: [] },
    logs: { items: [] },
  };

  for (const entry of reviewerRegistry) {
    const reviewer = entry.reviewer;
    const out = await reviewer.run({
      evidence: emptyBundle,
      sessionId: 'test-session-empty',
      reviewer: reviewer.id,
      runId: 'test-run-empty',
    });
    assert(out.reviewer === reviewer.id, `${reviewer.id} (empty): reviewer field matches`);
    assert(out.score >= 0 && out.score <= 100, `${reviewer.id} (empty): score in 0-100`);
    assert(out.confidence > 0, `${reviewer.id} (empty): confidence is positive`);
  }

  // eslint-disable-next-line no-console
  console.log('\nAll reviewer smoke tests passed.');
};

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Test failed:', err);
  process.exit(1);
});
