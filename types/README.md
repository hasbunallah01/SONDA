# `types/` — Shared TypeScript types

Cross-cutting types that more than one feature or service depends on. Feature-local types live inside the feature folder.

## Planned

- `evidence.ts` — `EvidenceBundle` and its parts (the contract every source must satisfy)
- `review.ts` — `ReviewerOutput`, `Verdict`, etc.
- `review-source.ts` — `'website' | 'github' | 'zip' | 'private'`
- `api.ts` — common API response envelopes
