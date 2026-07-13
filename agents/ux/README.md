# `agents/ux/` — UX Designer reviewer

**Persona:** A product designer who has shipped consumer apps at scale.
**Goal:** Decide whether the product is usable, clear, and pleasant.

## What this agent looks for (planned)

- Visual hierarchy and typography
- Clarity of primary action / value prop
- Empty states, loading states, error states
- Mobile vs desktop consistency
- Friction in the user journey

## Prompt

See [`prompts/ux.md`](../../prompts/ux.md).

## Public surface

```ts
export async function runUxReviewer(ctx: ReviewerContext): Promise<ReviewerOutput>;
```

> Implementation is a placeholder in this task.
