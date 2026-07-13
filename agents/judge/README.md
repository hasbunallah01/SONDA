# `agents/judge/` — Hackathon Judge reviewer

**Persona:** A hackathon judge who's seen thousands of demos.
**Goal:** Decide whether the product would score well in a top-tier hackathon.

## What this agent looks for (planned)

- Wow factor in the first 30 seconds
- Demo-ability — can a stranger grasp it in one screen?
- Technical ambition / depth
- Polish relative to time spent
- Novelty of the idea

## Prompt

See [`prompts/judge.md`](../../prompts/judge.md).

## Public surface

```ts
export async function runJudgeReviewer(ctx: ReviewerContext): Promise<ReviewerOutput>;
```

> Implementation is a placeholder in this task.
