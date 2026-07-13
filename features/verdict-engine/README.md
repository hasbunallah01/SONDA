# `features/verdict-engine/` — Verdict aggregation

Takes the array of `ReviewerOutput`s and produces the final **SONDA Launch Verdict** — a single, trustworthy signal for the user.

## Responsibilities (planned)

- Weights and aggregates reviewer scores into a single overall score.
- Determines launch status: `Ready to Launch` / `Almost There` / `Needs Work` / `Not Ready`.
- Deduplicates and prioritizes fixes across reviewers.
- Surfaces top strengths and weaknesses.
- Writes a human-readable verdict summary.

## Inputs

```ts
{
  evidence: EvidenceBundle;
  reviewerOutputs: ReviewerOutput[];
}
```

## Outputs

```ts
type Verdict = {
  overallScore: number; // 0–100
  status: 'ready' | 'almost' | 'needs-work' | 'not-ready';
  headline: string; // one-liner
  summary: string; // paragraph
  topStrengths: string[]; // <= 5
  topWeaknesses: string[]; // <= 5
  priorityFixes: PriorityFix[]; // ranked
  reviewerOutputs: ReviewerOutput[];
};
```

## Placeholders

This task only sets up the directory.
