# `agents/judge/` — Hackathon Judge reviewer

**Persona:** A veteran hackathon judge who has watched thousands of demos.
**Goal:** Score the product as a hackathon submission.

## What this agent looks for

- 30-second wow factor (hero, first paint, headline)
- Demo-ability (headline / body / CTA triangle)
- Technical ambition (README, license, file tree, language breadth)
- Polish (accessibility, performance, clean logs)
- Novelty (specific audience, action-verb framing, non-trivial stack)

## Rubric

Five axes, weights sum to 1.0:

| Axis           | Weight | Signal source                                      |
| -------------- | -----: | -------------------------------------------------- |
| `wow`          |   0.25 | `screenshots`, `pageContent.headings[0]`, OG image |
| `demo-ability` |   0.20 | `pageContent` (headline + body + link triangle)    |
| `ambition`     |   0.20 | `files` (tree, README, license, extensions)        |
| `polish`       |   0.15 | `accessibility`, `metrics.performance`, logs       |
| `novelty`      |   0.20 | audience phrases, action verbs, less-common stacks |

## Confidence

| Populated sections | Confidence |
| ------------------ | ---------: |
| 0–1                |       0.50 |
| 2–3                |       0.70 |
| 4–5                |       0.85 |

## Prompt

See [`prompts/judge.md`](../../prompts/judge.md). The prompt is the spec; this module is the deterministic v0 implementation.

## Public surface

```ts
export const judgeReviewer: Reviewer;
export async function runReviewer(ctx, options?): Promise<ReviewerOutput>;
export const createJudgeReviewer: ReviewerFactory;
export default module;
```

> Implementation lands in Task 6.8. See
> [`./persistence.ts`](./persistence.ts) for the upsert helper.
