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

## Shared contract (Task 6.3.2)

All types and interfaces live in two files:

| File                 | What it contains                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `agents/types.ts`    | Identity, inputs, outputs, scoring structure, persistence mapping.                             |
| `agents/contract.ts` | The `Reviewer` interface every agent implements, plus `ReviewerModule` and `ReviewerRegistry`. |

### Reviewer identity

```ts
import type { ReviewerId, ReviewerRole, ReviewerDescriptor } from '@/agents/types';

export type ReviewerId = 'qa' | 'ux' | 'marketing' | 'investor' | 'judge' | 'first-user';
export const REVIEWER_ROLES: Readonly<Record<ReviewerId, ReviewerRole>> = {
  qa: 'QA Engineer',
  ux: 'UX Designer',
  marketing: 'Marketing / GTM Expert',
  investor: 'Investor / Funding Lens',
  judge: 'Hackathon Judge',
  'first-user': 'First-time User',
};
```

### Inputs

```ts
import type { ReviewerContext, ReviewerRunOptions } from '@/agents/types';

export type ReviewerContext = {
  evidence: EvidenceBundle;
  sessionId: string;
  reviewer: ReviewerId;
  runId: string;
  locale?: string;
  maxTokens?: number;
  temperature?: number;
  priorOutputs?: ReadonlyArray<ReviewerOutput>;
  signal?: AbortSignal;
};

export type ReviewerRunOptions = {
  maxTokens?: number;
  temperature?: number;
  locale?: string;
  timeoutMs?: number;
};
```

### Outputs

```ts
import type { ReviewerOutput, PriorityFix, ReviewerFinding, ReviewerError } from '@/agents/types';

export type PriorityFix = {
  title: string;
  description: string;
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
};

export type ReviewerFinding = {
  title: string;
  detail: string;
  category?: string;
  confidence?: number;
};

export type ReviewerOutput = {
  reviewer: ReviewerId;
  score: number; // 0–100
  confidence: number; // 0–1
  summary: string;
  strengths: string[];
  weaknesses: string[];
  priorityFixes: PriorityFix[];
  rubricScores?: ReadonlyArray<RubricScore>;
  findings?: ReadonlyArray<ReviewerFinding>;
  schemaVersion: 1;
};
```

### Scoring structure

Every reviewer declares a `ReviewerRubric` (a list of weighted `RubricItem` axes) and emits `RubricScore`s alongside its `ReviewerOutput`. The verdict engine folds rubric scores into the per-reviewer overall score.

```ts
import type {
  ReviewerRubric,
  RubricItem,
  RubricScore,
  ReviewerScore,
  ScoreLevel,
  scoreLevel,
} from '@/agents/types';

export type RubricItem = {
  id: string; // 'clarity', 'accessibility', ...
  label: string; // 'Clarity of value prop'
  description?: string;
  weight: number; // 0–1; weights within a rubric must sum to 1
};

export type ReviewerRubric = ReadonlyArray<RubricItem>;
export type RubricScore = { rubricId: string; score: number; note?: string };
export type ReviewerScore = {
  overall: number; // 0–100
  breakdown?: ReadonlyArray<RubricScore>;
  level: 'excellent' | 'good' | 'fair' | 'poor';
};

//  ≥ 85  → 'excellent'
//  ≥ 70  → 'good'
//  ≥ 50  → 'fair'
//  < 50  → 'poor'
const level: ScoreLevel = scoreLevel(72); // 'good'
```

### Contract (the `Reviewer` interface)

```ts
import type {
  Reviewer,
  ReviewerFactory,
  ReviewerModule,
  ReviewerRegistry,
  ReviewerMap,
  ReviewerProgress,
} from '@/agents/contract';

export interface Reviewer {
  readonly id: ReviewerId;
  readonly descriptor: ReviewerDescriptor;
  readonly rubric: ReviewerRubric;
  validate?(output: ReviewerOutput): { ok: true } | { ok: false; reason: string };
  run(ctx: ReviewerContext, options?: ReviewerRunOptions): Promise<ReviewerOutput>;
}

export type ReviewerFactory<Deps = unknown> = (deps?: Deps) => Reviewer;
export type ReviewerModule = {
  reviewer: Reviewer;
  REVIEWER_ID: ReviewerId;
  runReviewer: (ctx: ReviewerContext, options?: ReviewerRunOptions) => Promise<ReviewerOutput>;
};
export type ReviewerRegistry = ReadonlyArray<ReviewerModule>;
export type ReviewerMap = Readonly<Record<ReviewerId, ReviewerModule>>;
export type ReviewerProgress = {
  reviewer: ReviewerId;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: number;
  endedAt?: number;
  message?: string;
  error?: ReviewerError;
};
```

### Persistence mapping

The DB row shape and the `prisma.reviewerResult.create` input are typed here so reviewers and the verdict engine don't import from `@prisma/client` directly:

```ts
import type { ReviewerResultRow, ReviewerResultInput } from '@/agents/types';

export type ReviewerResultRow = {
  id: string;
  sessionId: string;
  reviewer: ReviewerId;
  score: number;
  confidence: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  priorityFixes: PriorityFix[];
  createdAt: Date;
  updatedAt: Date;
};

export type ReviewerResultInput = Omit<ReviewerResultRow, 'id' | 'createdAt' | 'updatedAt'>;
```

## Pattern

Every agent exports a `ReviewerModule` from `agents/<name>/index.ts`. The shape is:

```ts
// agents/<name>/index.ts
import type {
  Reviewer,
  ReviewerModule,
  ReviewerContext,
  ReviewerOutput,
  ReviewerRunOptions,
} from '@/agents';

const reviewer: Reviewer = {
  id: 'qa',
  descriptor: { id: 'qa', role: 'QA Engineer', description: '...', defaultWeight: 0.2 },
  rubric: [
    { id: 'reliability', label: 'Reliability', weight: 0.5 },
    { id: 'coverage', label: 'Test coverage', weight: 0.5 },
  ],
  async run(_ctx: ReviewerContext, _opts?: ReviewerRunOptions): Promise<ReviewerOutput> {
    // TODO: real implementation
    return {
      reviewer: 'qa',
      score: 0,
      confidence: 0,
      summary: 'QA reviewer not yet implemented.',
      strengths: [],
      weaknesses: [],
      priorityFixes: [],
      schemaVersion: 1,
    };
  },
};

export const REVIEWER_ID = 'qa' as const;
export async function runReviewer(
  ctx: ReviewerContext,
  options?: ReviewerRunOptions,
): Promise<ReviewerOutput> {
  return reviewer.run(ctx, options);
}

const module: ReviewerModule = { reviewer, REVIEWER_ID, runReviewer };
export default module;
```

> No agents are implemented in this task. Only placeholders conforming to the new contract.
