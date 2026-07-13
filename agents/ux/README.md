# `agents/ux/` — UX Designer reviewer

**Persona:** A product designer who has shipped consumer-grade apps used by millions. Cares about clarity, hierarchy, and the user's first ten seconds.
**Goal:** Decide whether the product is usable, clear, and visually crafted.

## What this agent looks for

- Clarity of the value proposition (headline + body copy)
- Visual hierarchy (heading count, body density)
- Primary-action usability (CTAs, links)
- Cross-surface consistency (multiple viewports vs single)
- Craft (accessibility, Lighthouse scores, log noise)

## Rubric

Five axes, weights sum to 1.0:

| Axis          | Weight | Signal source                                    |
| ------------- | -----: | ------------------------------------------------ |
| `clarity`     |   0.25 | `pageContent.body`, `pageContent.headings`       |
| `hierarchy`   |   0.20 | `pageContent.headings`                           |
| `usability`   |   0.20 | `pageContent.links`, `screenshots`               |
| `consistency` |   0.15 | `screenshots` (count)                            |
| `craft`       |   0.20 | `accessibility.summary`, `metrics.accessibility` |

## Confidence

Confidence scales with how many sections of the `EvidenceBundle` are populated (capped at 0.85 because the current implementation is deterministic and does not use an LLM).

| Populated sections | Confidence |
| ------------------ | ---------: |
| 0–1                |       0.50 |
| 2–3                |       0.70 |
| 4–5                |       0.85 |

## Prompt

See [`prompts/ux.md`](../../prompts/ux.md). The prompt is the spec; this module is the deterministic v0 implementation. A future LLM-backed variant will land via `createUxReviewer` and consume the same prompt.

## Public surface

```ts
// Object-shaped contract (see agents/contract.ts#Reviewer).
export const uxReviewer: Reviewer;

// Legacy function entry point kept for the reviewer registry.
export async function runReviewer(
  ctx: ReviewerContext,
  options?: ReviewerRunOptions,
): Promise<ReviewerOutput>;

// ReviewerFactory for DI of future LLM clients.
export const createUxReviewer: ReviewerFactory;

// ReviewerModule the orchestrator consumes at registration time.
export default module;
```

> Implementation lands in Task 6.4. See
> [`./persistence.ts`](./persistence.ts) for the upsert helper
> the orchestrator uses to save a `ReviewerResult` row.
