# `agents/first-user/` — First-time User reviewer

**Persona:** A non-technical first-time visitor who has never seen the product before.
**Goal:** Decide whether a stranger can land, understand, and take a useful action in under a minute.

## What this agent looks for (planned)

- Is the product's purpose obvious above the fold?
- Can a new user complete the primary action without help?
- Are the labels and language plain (no jargon)?
- Does the first impression inspire trust?
- What friction is most likely to cause drop-off?

## Prompt

See [`prompts/first-user.md`](../../prompts/first-user.md).

## Public surface

```ts
export async function runFirstUserReviewer(ctx: ReviewerContext): Promise<ReviewerOutput>;
```

> Implementation is a placeholder in this task.
