# `features/verdict-engine/` — Verdict aggregation

Takes the array of `ReviewerOutput`s produced by the reviewer pipeline and returns a single, trustworthy **SONDA Launch Verdict** — the final signal the user sees on the results page.

## What it does

- Aggregates per-reviewer scores into a single 0–100 overall score, weighted by each reviewer's `defaultWeight`.
- Determines launch status: `ready` / `almost` / `needs-work` / `not-ready` (rendered as **Launch Ready** / **Almost There** / **Needs Work** / **Not Ready**).
- Deduplicates and prioritizes `priorityFixes` across reviewers (impact desc, effort asc).
- Surfaces the top 5 strengths and 5 weaknesses, rolled up across the jury.
- Builds a one-line headline and a multi-sentence summary.

## Inputs

```ts
{
  outputs: ReadonlyArray<ReviewerOutput>;
}
```

`ReviewerOutput` is the application-side shape from `agents/types.ts`. The `EvidenceBundle` is **not** required at this stage — the verdict engine only consumes the structured reviewer outputs.

## Outputs

```ts
import type { Verdict, VerdictStatus } from '@/types/review';

type Verdict = {
  overallScore: number; // 0–100, weighted average
  status: 'ready' | 'almost' | 'needs-work' | 'not-ready';
  headline: string; // e.g. "Launch Ready — score 87/100"
  summary: string; // multi-sentence, includes per-reviewer breakdown
  topStrengths: string[]; // ≤ 5, rolled up across reviewers
  topWeaknesses: string[]; // ≤ 5, rolled up across reviewers
  priorityFixes: PriorityFix[]; // ranked, deduped, ≤ 7
  reviewerOutputs: ReviewerOutput[]; // all 6 outputs, verbatim
};
```

## Status thresholds

| Range        | Status       | User-facing label |
| ------------ | ------------ | ----------------- |
| `score ≥ 85` | `ready`      | Launch Ready      |
| `score ≥ 70` | `almost`     | Almost There      |
| `score ≥ 50` | `needs-work` | Needs Work        |
| `score < 50` | `not-ready`  | Not Ready         |

## Public API

```ts
import {
  computeVerdict,
  aggregateScore,
  verdictStatusFromScore,
  VERDICT_THRESHOLDS,
  VERDICT_LABELS,
} from '@/features/verdict-engine';
```

- `computeVerdict(outputs)` — full aggregation. Returns a `Verdict`.
- `aggregateScore(outputs)` — weighted average only.
- `verdictStatusFromScore(score)` — pure score → status mapping.
- `VERDICT_THRESHOLDS` — the numeric thresholds, exported for the UI.
- `VERDICT_LABELS` — the user-facing labels.

## Weighting

Each reviewer has a `defaultWeight` (see `agents/types.ts#ReviewerDescriptor`). The verdict engine uses the static map in `features/verdict-engine/index.ts#DEFAULT_DESCRIPTORS`. Failed reviewers (score = 0, confidence = 0) are excluded from the average.

| Reviewer   | Weight |
| ---------- | -----: |
| QA         |   0.20 |
| UX         |   0.20 |
| Marketing  |   0.15 |
| Investor   |   0.15 |
| Judge      |   0.15 |
| First-User |   0.15 |

Weights sum to 1.00. Adding a new reviewer = one new entry in `DEFAULT_DESCRIPTORS`.

## Persistence

The `Verdict` is persisted to the `review_results` table by `services/verdict.ts`, not by this module. The verdict engine is pure (no I/O, no time-of-day) and is fully covered by the smoke test in `tests/verdict-engine.test.ts`.

## Out of scope (per task)

- No LLM commentary. The summary is templated.
- No per-session weight overrides. Weights are static.
- No streaming. `computeVerdict` is a single synchronous call.
