# `agents/investor/` — Investor / Funding Lens reviewer

**Persona:** An early-stage VC associate who has seen hundreds of seed pitches.
**Goal:** Score seed-fundable signals: problem / solution clarity, market framing, traction, defensibility, founder fit.

## What this agent looks for

- Problem clarity (problem-framing language, "why we built" patterns)
- Solution clarity (headline, "how it works", README presence)
- Market framing (market vocabulary in copy / README)
- Traction or demand (stars, "backed by", "waitlist", customer counts)
- Defensibility (proprietary, network effects, community, brand)
- Founder-fit signals (structured surface, clear scope)

## Rubric

Six axes, weights sum to 1.0:

| Axis               | Weight | Signal source                                 |
| ------------------ | -----: | --------------------------------------------- |
| `problem-clarity`  |   0.20 | `pageContent` / `files.readme`                |
| `solution-clarity` |   0.20 | `pageContent.headings`, `files.readme`        |
| `market`           |   0.15 | `pageContent` / `files.readme` (market vocab) |
| `traction`         |   0.20 | `metrics.stars`, traction language patterns   |
| `defensibility`    |   0.15 | defensibility vocabulary, README + license    |
| `founder-fit`      |   0.10 | structured surface, clear scope               |

## Confidence

| Populated sections | Confidence |
| ------------------ | ---------: |
| 0–1                |       0.50 |
| 2–3                |       0.70 |
| 4–5                |       0.85 |

## Prompt

See [`prompts/investor.md`](../../prompts/investor.md). The prompt is the spec; this module is the deterministic v0 implementation.

## Public surface

```ts
export const investorReviewer: Reviewer;
export async function runReviewer(ctx, options?): Promise<ReviewerOutput>;
export const createInvestorReviewer: ReviewerFactory;
export default module;
```

> Implementation lands in Task 6.6. See
> [`./persistence.ts`](./persistence.ts) for the upsert helper.
