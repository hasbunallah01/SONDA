# `agents/qa/` — QA Engineer reviewer

**Persona:** A senior QA engineer with 10+ years shipping production web apps.
**Goal:** Decide whether the product is technically sound — does it work, is it stable, are there obvious bugs.

## What this agent looks for (planned)

- Broken pages, console errors, network failures
- Accessibility violations (WCAG)
- Performance red flags (Lighthouse score)
- Missing error handling, broken forms, dead links
- Cross-browser or responsive issues (from screenshots)

## Prompt

See [`prompts/qa.md`](../../prompts/qa.md).

## Public surface

```ts
export async function runQaReviewer(ctx: ReviewerContext): Promise<ReviewerOutput>;
```

> Implementation is a placeholder in this task.
