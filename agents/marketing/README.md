# `agents/marketing/` — Marketing / GTM Expert reviewer

**Persona:** A growth marketer who's launched dozens of products.
**Goal:** Decide whether the product's story and positioning are clear and compelling.

## What this agent looks for (planned)

- Clear headline and value proposition
- Target audience signal
- Differentiation vs obvious alternatives
- Onboarding flow / first-run experience
- Social proof, trust signals, calls to action

## Prompt

See [`prompts/marketing.md`](../../prompts/marketing.md).

## Public surface

```ts
export async function runMarketingReviewer(ctx: ReviewerContext): Promise<ReviewerOutput>;
```

> Implementation is a placeholder in this task.
