/**
 * tests/pipeline.test.ts — End-to-end pipeline smoke test
 *
 * Drives the entire review pipeline against a real public
 * website (https://example.com) and a real GitHub repo
 * (https://github.com/vercel/next.js). Verifies:
 *
 *   - Session is created in PENDING.
 *   - Status transitions to RUNNING and then COMPLETED.
 *   - Evidence is collected and persisted on the session.
 *   - All 6 reviewers produce a result.
 *   - The verdict is persisted with status 'ready' /
 *     'almost' / 'needs-work' / 'not-ready'.
 *   - The result of runReview() is `{ ok: true, ... }`.
 *
 * This test requires:
 *   - A valid DATABASE_URL (uses .env.local).
 *   - Network access to https://example.com and api.github.com.
 *
 * Run with: `npx tsx tests/pipeline.test.ts`
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { prisma, ReviewType, ReviewStatus, ReviewerType } from '../lib/db';
import { runReview } from '../services/review-orchestrator';
import { computeVerdict, VERDICT_LABELS } from '../features/verdict-engine';

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
  if (!process.env['DATABASE_URL']) {
    // eslint-disable-next-line no-console
    console.error('DATABASE_URL is not set; skipping pipeline test.');
    process.exit(1);
  }

  // ----- Test 1: Website review ------------------------------------------
  // eslint-disable-next-line no-console
  console.log('\n=== Test 1: Public Website (https://example.com) ===');

  const webSession = await prisma.reviewSession.create({
    data: {
      type: ReviewType.WEBSITE,
      status: ReviewStatus.PENDING,
      target: 'https://example.com',
    },
  });
  assert(webSession.id.length > 0, 'web session created');
  assert(webSession.status === 'PENDING', 'web session starts PENDING');

  const webResult = await runReview(webSession.id);
  assert(webResult.ok === true, 'web runReview returns ok=true');
  assert(webResult.status === 'COMPLETED', 'web session ends COMPLETED');

  const webFinal = await prisma.reviewSession.findUnique({
    where: { id: webSession.id },
    include: { reviewerResults: true, result: true },
  });
  assert(webFinal !== null, 'web session is in DB after run');
  assert(webFinal?.status === 'COMPLETED', 'web session status is COMPLETED in DB');
  assert(
    webFinal?.evidence !== null && webFinal?.evidence !== undefined,
    'web evidence is persisted',
  );
  const webEvidence = webFinal?.evidence as { metadata?: { source?: string } } | null;
  assert(webEvidence?.metadata?.source === 'website', 'web evidence source is "website"');

  const webReviewerResults = webFinal?.reviewerResults ?? [];
  assert(
    webReviewerResults.length === 6,
    `web has 6 reviewer results, got ${webReviewerResults.length}`,
  );

  const webReviewerIds = new Set(webReviewerResults.map((r) => r.reviewer));
  const expectedReviewers: ReviewerType[] = [
    ReviewerType.QA,
    ReviewerType.UX,
    ReviewerType.MARKETING,
    ReviewerType.INVESTOR,
    ReviewerType.JUDGE,
    ReviewerType.FIRST_USER,
  ];
  for (const r of expectedReviewers) {
    assert(webReviewerIds.has(r), `web has reviewer ${r}`);
  }

  assert(webFinal?.result !== null && webFinal?.result !== undefined, 'web verdict is persisted');
  const webVerdict = webFinal?.result;
  assert(typeof webVerdict?.overallScore === 'number', 'web verdict has overallScore');
  assert(
    webVerdict?.overallScore !== undefined &&
      webVerdict.overallScore >= 0 &&
      webVerdict.overallScore <= 100,
    `web verdict score in 0-100, got ${webVerdict?.overallScore}`,
  );
  const webVerdictStatus = webVerdict?.verdict;
  assert(
    webVerdictStatus === 'ready' ||
      webVerdictStatus === 'almost' ||
      webVerdictStatus === 'needs-work' ||
      webVerdictStatus === 'not-ready',
    `web verdict status is valid, got ${webVerdictStatus}`,
  );
  // eslint-disable-next-line no-console
  console.log(
    `  → web verdict: ${webVerdict?.overallScore}/100 (${VERDICT_LABELS[webVerdictStatus as keyof typeof VERDICT_LABELS]})`,
  );

  // ----- Test 2: GitHub review -------------------------------------------
  // eslint-disable-next-line no-console
  console.log('\n=== Test 2: GitHub Repository (https://github.com/vercel/next.js) ===');

  const ghSession = await prisma.reviewSession.create({
    data: {
      type: ReviewType.GITHUB,
      status: ReviewStatus.PENDING,
      target: 'https://github.com/vercel/next.js',
    },
  });

  const ghResult = await runReview(ghSession.id);
  assert(ghResult.ok === true, 'github runReview returns ok=true');
  assert(ghResult.status === 'COMPLETED', 'github session ends COMPLETED');

  const ghFinal = await prisma.reviewSession.findUnique({
    where: { id: ghSession.id },
    include: { reviewerResults: true, result: true },
  });
  assert(
    ghFinal?.evidence !== null && ghFinal?.evidence !== undefined,
    'github evidence is persisted',
  );
  const ghEvidence = ghFinal?.evidence as {
    metadata?: { source?: string };
    files?: { fileTree?: string[]; readme?: string };
    metrics?: { stars?: number };
  } | null;
  assert(ghEvidence?.metadata?.source === 'github', 'github evidence source is "github"');
  assert(
    (ghEvidence?.files?.fileTree?.length ?? 0) > 0,
    `github has fileTree, got ${ghEvidence?.files?.fileTree?.length ?? 0} entries`,
  );
  assert((ghEvidence?.files?.readme?.length ?? 0) > 0, 'github has README content');
  assert(
    typeof ghEvidence?.metrics?.stars === 'number' && ghEvidence.metrics.stars > 1000,
    `github has stars > 1000, got ${ghEvidence?.metrics?.stars}`,
  );

  const ghReviewerResults = ghFinal?.reviewerResults ?? [];
  assert(
    ghReviewerResults.length === 6,
    `github has 6 reviewer results, got ${ghReviewerResults.length}`,
  );

  const ghVerdict = ghFinal?.result;
  assert(ghVerdict !== null, 'github verdict is persisted');
  // eslint-disable-next-line no-console
  console.log(
    `  → github verdict: ${ghVerdict?.overallScore}/100 (${VERDICT_LABELS[ghVerdict?.verdict as keyof typeof VERDICT_LABELS]})`,
  );

  // ----- Test 3: Verdict engine pure (re-derive from outputs) ------------
  // eslint-disable-next-line no-console
  console.log('\n=== Test 3: Verdict engine determinism ===');

  const webOutputs = webReviewerResults.map((r) => ({
    reviewer: (
      {
        [ReviewerType.QA]: 'qa',
        [ReviewerType.UX]: 'ux',
        [ReviewerType.MARKETING]: 'marketing',
        [ReviewerType.INVESTOR]: 'investor',
        [ReviewerType.JUDGE]: 'judge',
        [ReviewerType.FIRST_USER]: 'first-user',
      } as const
    )[r.reviewer],
    score: r.score,
    confidence: r.confidence,
    summary: r.summary,
    strengths: r.strengths,
    weaknesses: r.weaknesses,
    priorityFixes: r.priorityFixes as Parameters<typeof computeVerdict>[0][number]['priorityFixes'],
    schemaVersion: 1 as const,
  }));

  const recomputed = computeVerdict(webOutputs);
  assert(
    recomputed.overallScore === webVerdict?.overallScore,
    'recomputed verdict matches persisted',
  );
  assert(
    recomputed.status === webVerdictStatus,
    `recomputed status matches persisted, ${recomputed.status} vs ${webVerdictStatus}`,
  );

  // ----- Test 4: Failure path --------------------------------------------
  // eslint-disable-next-line no-console
  console.log('\n=== Test 4: Failure path (invalid target) ===');

  const failSession = await prisma.reviewSession.create({
    data: {
      type: ReviewType.WEBSITE,
      status: ReviewStatus.PENDING,
      target: 'not-a-valid-url',
    },
  });
  const failResult = await runReview(failSession.id);
  assert(failResult.ok === false, 'invalid-URL runReview returns ok=false');
  assert(failResult.status === 'FAILED', 'invalid-URL session ends FAILED');

  const failFinal = await prisma.reviewSession.findUnique({ where: { id: failSession.id } });
  assert(failFinal?.status === 'FAILED', 'invalid-URL session status is FAILED in DB');

  // eslint-disable-next-line no-console
  console.log('\n=== All pipeline tests passed ===');
};

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Pipeline test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
