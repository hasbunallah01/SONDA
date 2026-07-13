# `agents/qa/` — QA Engineer reviewer

**Persona:** A senior QA engineer with 10+ years shipping production web apps.
**Goal:** Decide whether the product is technically sound — does it work, is it stable, are there obvious bugs.

## What this agent looks for

- Whether the core pages render with expected content
- Runtime errors and warnings captured in the analyzer logs
- Lighthouse performance (when present in the evidence bundle)
- WCAG-aligned accessibility violations (axe-core style counts)
- Visible error handling (inferred from log signal)

## Rubric

Five axes, weights sum to 1.0:

| Axis             | Weight | Signal source                             |
| ---------------- | -----: | ----------------------------------------- |
| `functionality`  |   0.25 | screenshots, page content, file tree      |
| `stability`      |   0.20 | `logs.items` filtered by level            |
| `performance`    |   0.20 | `metrics.performance` (Lighthouse)        |
| `accessibility`  |   0.25 | `accessibility.summary` (axe-core counts) |
| `error-handling` |   0.10 | presence / absence of error-level logs    |

## Confidence

Confidence scales with how many sections of the `EvidenceBundle` are populated (capped at 0.85 because the current implementation is deterministic and does not use an LLM).

| Populated sections | Confidence |
| ------------------ | ---------: |
| 0–1                |       0.50 |
| 2–3                |       0.70 |
| 4–5                |       0.85 |

## Prompt

See [`prompts/qa.md`](../../prompts/qa.md). The prompt is the spec; this module is the deterministic v0 implementation. A future LLM-backed variant will land via `createQaReviewer` and consume the same prompt.

## Public surface

```ts
// Object-shaped contract (see agents/contract.ts#Reviewer).
export const qaReviewer: Reviewer;

// Legacy function entry point kept for the reviewer registry.
export async function runReviewer(
  ctx: ReviewerContext,
  options?: ReviewerRunOptions,
): Promise<ReviewerOutput>;

// ReviewerFactory for DI of future LLM clients.
export const createQaReviewer: ReviewerFactory;

// ReviewerModule the orchestrator consumes at registration time.
export default module;
```

> Implementation lands in Task 6.3.3. See
> [`./persistence.ts`](./persistence.ts) for the upsert helper
> the orchestrator uses to save a `ReviewerResult` row.
