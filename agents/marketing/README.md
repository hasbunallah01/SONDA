# `agents/marketing/` — Marketing / GTM Expert reviewer

**Persona:** A growth marketer who has launched dozens of products.
**Goal:** Decide whether the product has a clear story, positioning, and go-to-market.

## What this agent looks for

- Positioning & value proposition (headline, subhead, metadata)
- Differentiation (comparison language, "vs alternative" framing)
- Conversion clarity (CTAs, social proof, trust signals)
- Copy quality (body word count, link density, plain language)
- Audience fit (second-person voice, "for X" phrases)

## Rubric

Five axes, weights sum to 1.0:

| Axis              | Weight | Signal source                                      |
| ----------------- | -----: | -------------------------------------------------- |
| `positioning`     |   0.25 | `pageContent.headings`, `metadata.facts`           |
| `differentiation` |   0.20 | `pageContent` (compare / "vs" / "unlike" patterns) |
| `conversion`      |   0.25 | `pageContent.links` (CTAs, social proof)           |
| `copy`            |   0.15 | `pageContent.body` word count + link density       |
| `audience-fit`    |   0.15 | `pageContent` (second-person, "for X" phrases)     |

## Confidence

| Populated sections | Confidence |
| ------------------ | ---------: |
| 0–1                |       0.50 |
| 2–3                |       0.70 |
| 4–5                |       0.85 |

## Prompt

See [`prompts/marketing.md`](../../prompts/marketing.md). The prompt is the spec; this module is the deterministic v0 implementation.

## Public surface

```ts
export const marketingReviewer: Reviewer;
export async function runReviewer(ctx, options?): Promise<ReviewerOutput>;
export const createMarketingReviewer: ReviewerFactory;
export default module;
```

> Implementation lands in Task 6.5. See
> [`./persistence.ts`](./persistence.ts) for the upsert helper.
