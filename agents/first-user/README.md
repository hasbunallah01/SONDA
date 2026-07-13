# `agents/first-user/` — First-time User reviewer

**Persona:** A non-technical first-time visitor with 30 seconds to decide if they care.
**Goal:** Score the product from the cold-start, first-impression perspective.

## What this agent looks for

- Purpose clarity (headline obvious above the fold?)
- Plain language (jargon-free copy)
- First-action reachability (clear CTA / link in one click)
- First-impression trust (clean surface, no runtime errors)
- Bounce risk (friction that drives a new visitor away)

## Rubric

Five axes, weights sum to 1.0:

| Axis             | Weight | Signal source                                  |
| ---------------- | -----: | ---------------------------------------------- |
| `purpose`        |   0.25 | `pageContent.headings`, `metadata.facts`       |
| `plain-language` |   0.15 | `pageContent` (jargon detection)               |
| `first-action`   |   0.25 | `pageContent.links` (CTAs)                     |
| `trust`          |   0.15 | metadata, social-proof links, log errors       |
| `bounce-risk`    |   0.20 | inverse — high signals of friction lower score |

## Confidence

| Populated sections | Confidence |
| ------------------ | ---------: |
| 0–1                |       0.50 |
| 2–3                |       0.70 |
| 4–5                |       0.85 |

## Prompt

See [`prompts/first-user.md`](../../prompts/first-user.md). The prompt is the spec; this module is the deterministic v0 implementation.

## Public surface

```ts
export const firstUserReviewer: Reviewer;
export async function runReviewer(ctx, options?): Promise<ReviewerOutput>;
export const createFirstUserReviewer: ReviewerFactory;
export default module;
```

> Implementation lands in Task 6.7. See
> [`./persistence.ts`](./persistence.ts) for the upsert helper.
