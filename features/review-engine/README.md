# `features/review-engine/` — Review orchestration

The **brain of SONDA**. Takes a review request of any source kind, runs the right evidence collector, dispatches the reviewer agents, and returns a `ReviewSession`.

## Responsibilities (planned)

- Accepts a `ReviewRequest` and persists a `ReviewSession`.
- Picks the right `EvidenceCollector` for the source kind.
- Streams progress events (`Preparing investigation`, `Collecting evidence`, ...) to the running-review UI.
- Runs the agent jury in sequence (or in parallel where safe).
- Persists intermediate results for resumability.

## Inputs

A discriminated union by source kind:

```ts
type ReviewRequest =
  | { kind: 'website'; url: string }
  | { kind: 'github'; url: string }
  | { kind: 'zip'; file: File }
  | {
      kind: 'private';
      url: string;
      username: string;
      password: string;
      twoFactorCode?: string;
      notes?: string;
    };
```

## Outputs

```ts
type ReviewSession = {
  id: string;
  status: 'pending' | 'collecting' | 'reviewing' | 'verdict' | 'done' | 'failed';
  evidence: EvidenceBundle;
  reviewerOutputs: ReviewerOutput[];
  verdict?: Verdict;
  createdAt: Date;
  updatedAt: Date;
};
```

## Placeholders

This task only sets up the directory.
