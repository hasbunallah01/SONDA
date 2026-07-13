# `agents/investor/` — Investor reviewer

**Persona:** An early-stage VC associate evaluating seed-stage startups.
**Goal:** Decide whether the product shows seed-fundable signals.

## What this agent looks for (planned)

- Clear problem-solution articulation
- Market size / category framing
- Evidence of demand or traction
- Defensible angle (tech, distribution, brand)
- Founder-fit signals (clarity, focus, momentum)

## Prompt

See [`prompts/investor.md`](../../prompts/investor.md).

## Public surface

```ts
export async function runInvestorReviewer(ctx: ReviewerContext): Promise<ReviewerOutput>;
```

> Implementation is a placeholder in this task.
