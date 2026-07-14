/**
 * tests/source-aware.test.ts — Source-aware reviewer invariants
 *
 * Runs every registered reviewer against a synthetic ZIP
 * bundle and a synthetic GitHub bundle, and verifies that:
 *
 *   1. The reviewer produces a well-formed output (shape
 *      sanity, the same as `tests/reviewers.test.ts`).
 *   2. The reviewer's `priorityFixes` and `findings` do NOT
 *      contain any banned website-specific token (e.g.
 *      "hero", "CTA", "above the fold", "landing page").
 *   3. The reviewer's `summary` mentions the source label
 *      ("ZIP archive" or "GitHub repository"), not the raw
 *      source id ("zip" / "github").
 *
 * This is the regression test for Task 3.4 — it locks in
 * the guarantee that ZIP and GitHub reviews never produce
 * website-specific recommendations.
 *
 * Run with:
 *   npx tsx tests/source-aware.test.ts
 *
 * No database connection required — we call the `run`
 * method directly, bypassing the per-reviewer persistence
 * helper.
 */

import { reviewerRegistry } from '../agents/registry';
import {
  bannedTokensForSource,
  containsBannedToken,
  isCodeSource,
  sourceLabel,
} from '../agents/_lib/source';
import type { EvidenceBundle } from '../types/evidence';

const assert = (cond: boolean, msg: string): void => {
  if (!cond) {
    // eslint-disable-next-line no-console
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log(`✓ ${msg}`);
};

/**
 * Build a representative ZIP-archive bundle. No page
 * content, no screenshots, no accessibility, no Lighthouse
 * metrics — only `files` (tree + README + license) and
 * `metrics.extra` (file count + archive bytes).
 */
const makeZipBundle = (): EvidenceBundle => ({
  metadata: {
    id: 'zip-bundle-1',
    source: 'zip',
    submittedAt: new Date().toISOString(),
    input: {
      label: 'https://example.com/sample.zip',
      url: 'https://example.com/sample.zip',
    },
    facts: {
      title: 'sample-project',
      description: 'A sample project that demonstrates the ZIP-archive review path.',
      language: 'TypeScript',
    },
  },
  screenshots: { items: [] },
  files: {
    fileTree: [
      'README.md',
      'package.json',
      'src/index.ts',
      'src/lib/util.ts',
      'src/lib/parser.ts',
      'tests/util.test.ts',
      'tests/parser.test.ts',
      '.github/workflows/ci.yml',
      'tsconfig.json',
      '.eslintrc.json',
    ],
    topLevel: [
      'README.md',
      'package.json',
      'src',
      'tests',
      '.github',
      'tsconfig.json',
      '.eslintrc.json',
    ],
    readme:
      '# sample-project\n\n' +
      'A sample project that demonstrates the ZIP-archive review path.\n\n' +
      '## Install\n\n' +
      '```bash\nnpm install\n```\n\n' +
      '## Usage\n\n' +
      '```bash\nnpm start\n```\n\n' +
      '## Who is it for\n\n' +
      'For developers who need a small, focused utility.\n\n' +
      '## License\n\n' +
      'MIT\n',
    license: 'MIT',
  },
  metrics: {
    extra: {
      fileCount: 10,
      archiveBytes: 24_576,
    },
  },
  logs: {
    items: [
      {
        at: new Date().toISOString(),
        level: 'info',
        message: 'Fetched the archive (24576 bytes).',
      },
      {
        at: new Date().toISOString(),
        level: 'info',
        message: 'Extracted 10 files.',
      },
      {
        at: new Date().toISOString(),
        level: 'info',
        message: 'README captured.',
      },
    ],
  },
});

/**
 * Build a representative GitHub-repository bundle. Same
 * shape as the ZIP bundle, plus a `metrics.stars` count and
 * a `metadata.facts.imageUrl` for the social preview.
 */
const makeGithubBundle = (): EvidenceBundle => ({
  metadata: {
    id: 'github-bundle-1',
    source: 'github',
    submittedAt: new Date().toISOString(),
    input: {
      label: 'https://github.com/example/sample-repo',
      url: 'https://github.com/example/sample-repo',
    },
    facts: {
      title: 'example/sample-repo',
      description: 'A sample repo that demonstrates the GitHub review path.',
      language: 'TypeScript',
      imageUrl: 'https://example.com/avatar.png',
    },
  },
  screenshots: { items: [] },
  files: {
    fileTree: [
      'README.md',
      'LICENSE',
      'package.json',
      'src/index.ts',
      'src/lib/util.ts',
      'tests/util.test.ts',
      '.github/workflows/ci.yml',
      'tsconfig.json',
    ],
    topLevel: ['README.md', 'LICENSE', 'package.json', 'src', 'tests', '.github', 'tsconfig.json'],
    readme:
      '# sample-repo\n\n' +
      'A sample repo that demonstrates the GitHub review path.\n\n' +
      '## Install\n\n' +
      '```bash\nnpm install\n```\n\n' +
      '## Usage\n\n' +
      '```bash\nnpm start\n```\n\n' +
      'Used by 50+ developers in our community.\n\n' +
      '## License\n\n' +
      'MIT\n',
    license: 'MIT',
  },
  metrics: {
    stars: 42,
    extra: {
      forks: 7,
      openIssues: 2,
    },
  },
  logs: {
    items: [
      {
        at: new Date().toISOString(),
        level: 'info',
        message: 'Fetched repo metadata from GitHub.',
      },
      {
        at: new Date().toISOString(),
        level: 'info',
        message: 'README captured.',
      },
    ],
  },
});

/**
 * Walk a `ReviewerOutput` and assert that no `priorityFix`
 * title / description, `finding` title / detail, or
 * `summary` contains any banned token for the source.
 */
const assertNoBannedTokens = (
  source: 'github' | 'zip',
  reviewerId: string,
  output: {
    summary: string;
    priorityFixes: Array<{ title: string; description: string }>;
    findings?: ReadonlyArray<{ title: string; detail: string }>;
  },
): void => {
  const banned = bannedTokensForSource(source);
  // Sanity check on the helper itself: it must surface at
  // least the headline tokens for code sources.
  if (source === 'github' || source === 'zip') {
    assert(banned.includes('hero'), 'banned-token list includes "hero" for code sources');
    assert(banned.includes('cta'), 'banned-token list includes "cta" for code sources');
    assert(
      banned.includes('landing page'),
      'banned-token list includes "landing page" for code sources',
    );
  }

  // Check summary.
  for (const token of banned) {
    assert(
      !containsBannedToken(output.summary, source),
      `${reviewerId} (${source}): summary does not contain banned token "${token}" — got: "${output.summary}"`,
    );
  }

  // Check priorityFixes.
  for (const fix of output.priorityFixes) {
    for (const token of banned) {
      assert(
        !containsBannedToken(fix.title, source),
        `${reviewerId} (${source}): priorityFix title does not contain banned token "${token}" — got: "${fix.title}"`,
      );
      assert(
        !containsBannedToken(fix.description, source),
        `${reviewerId} (${source}): priorityFix description does not contain banned token "${token}" — got: "${fix.description}"`,
      );
    }
  }

  // Check findings (when present).
  if (output.findings) {
    for (const finding of output.findings) {
      for (const token of banned) {
        assert(
          !containsBannedToken(finding.title, source),
          `${reviewerId} (${source}): finding title does not contain banned token "${token}" — got: "${finding.title}"`,
        );
        assert(
          !containsBannedToken(finding.detail, source),
          `${reviewerId} (${source}): finding detail does not contain banned token "${token}" — got: "${finding.detail}"`,
        );
      }
    }
  }
};

const main = async (): Promise<void> => {
  assert(isCodeSource('github'), 'isCodeSource("github") is true');
  assert(isCodeSource('zip'), 'isCodeSource("zip") is true');
  assert(!isCodeSource('website'), 'isCodeSource("website") is false');
  assert(!isCodeSource('private'), 'isCodeSource("private") is false');

  const zipBundle = makeZipBundle();
  const githubBundle = makeGithubBundle();

  for (const entry of reviewerRegistry) {
    const reviewer = entry.reviewer;
    const reviewerId = reviewer.id;

    // --- ZIP bundle --------------------------------------------------
    const zipOut = await reviewer.run({
      evidence: zipBundle,
      sessionId: 'test-session-zip',
      reviewer: reviewerId,
      runId: 'test-run-zip',
    });
    assert(zipOut.reviewer === reviewerId, `${reviewerId} (zip): reviewer field matches`);
    assert(
      zipOut.score >= 0 && zipOut.score <= 100,
      `${reviewerId} (zip): score in 0-100, got ${zipOut.score}`,
    );
    assert(
      zipOut.confidence >= 0 && zipOut.confidence <= 1,
      `${reviewerId} (zip): confidence in 0-1, got ${zipOut.confidence}`,
    );
    assert(
      zipOut.summary.includes(sourceLabel('zip')),
      `${reviewerId} (zip): summary mentions source label "${sourceLabel('zip')}" — got: "${zipOut.summary}"`,
    );
    assertNoBannedTokens('zip', reviewerId, zipOut);

    // --- GitHub bundle -----------------------------------------------
    const ghOut = await reviewer.run({
      evidence: githubBundle,
      sessionId: 'test-session-github',
      reviewer: reviewerId,
      runId: 'test-run-github',
    });
    assert(ghOut.reviewer === reviewerId, `${reviewerId} (github): reviewer field matches`);
    assert(
      ghOut.score >= 0 && ghOut.score <= 100,
      `${reviewerId} (github): score in 0-100, got ${ghOut.score}`,
    );
    assert(
      ghOut.confidence >= 0 && ghOut.confidence <= 1,
      `${reviewerId} (github): confidence in 0-1, got ${ghOut.confidence}`,
    );
    assert(
      ghOut.summary.includes(sourceLabel('github')),
      `${reviewerId} (github): summary mentions source label "${sourceLabel('github')}" — got: "${ghOut.summary}"`,
    );
    assertNoBannedTokens('github', reviewerId, ghOut);
  }

  // eslint-disable-next-line no-console
  console.log('\nAll source-aware invariants passed.');
};

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Test failed:', err);
  process.exit(1);
});
