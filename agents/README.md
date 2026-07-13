# `agents/` — AI reviewers

SONDA's jury is composed of **autonomous AI agents**, one per reviewer perspective. Each agent:

1. Receives a normalized **Evidence Bundle** (no source-specific data).
2. Loads its prompt from `prompts/<reviewer>.md`.
3. Calls the LLM (placeholder for now).
4. Returns a structured `ReviewerOutput` (score, summary, strengths, weaknesses, fixes).

## Current agents

| Folder        | Role                    | Prompt                  |
| ------------- | ----------------------- | ----------------------- |
| `qa/`         | QA Engineer             | `prompts/qa.md`         |
| `ux/`         | UX Designer             | `prompts/ux.md`         |
| `marketing/`  | Marketing / GTM Expert  | `prompts/marketing.md`  |
| `investor/`   | Investor / Funding Lens | `prompts/investor.md`   |
| `judge/`      | Hackathon Judge         | `prompts/judge.md`      |
| `first-user/` | First-time User         | `prompts/first-user.md` |

## Pattern

Every agent exposes a single async function with the same signature:

```ts
// agents/<name>/index.ts
export type ReviewerContext = {
  evidence: EvidenceBundle;
  // future: prior reviewer outputs, calibration data, etc.
};

export type ReviewerOutput = {
  reviewer: 'qa' | 'ux' | 'marketing' | 'investor' | 'judge' | 'first-user';
  score: number; // 0–100
  confidence: number; // 0–1
  summary: string;
  strengths: string[];
  weaknesses: string[];
  priorityFixes: string[];
};

export async function runReviewer(ctx: ReviewerContext): Promise<ReviewerOutput> {
  // TODO: real implementation
  return placeholderOutput(ctx);
}
```

> No agents are implemented in this task. Only placeholders.
