# `features/` — Feature modules

Each folder under `features/` is a **vertical slice** of SONDA's product surface: it owns its own components, hooks, services, and types.

```
features/
├── website-review/      # Public website reviews (Playwright, Lighthouse, a11y)
├── github-review/       # GitHub repository analysis
├── zip-review/          # Uploaded ZIP project analysis (no execution)
├── private-review/      # Authenticated private-website reviews (post-MVP)
├── review-engine/       # Orchestrates evidence collection across sources
└── verdict-engine/      # Aggregates reviewer outputs into the final verdict
```

## Why vertical slices?

- A new feature can be built, tested, and removed in isolation.
- Cross-cutting concerns (design system, agents) stay in their own top-level folders.
- Scaling from one source to many doesn't require touching the rest of the codebase.

## Module anatomy (planned)

```
features/<name>/
├── components/          # UI specific to this feature
├── hooks/               # Feature-specific React hooks
├── services/            # Business logic (input validation, orchestration)
├── types/               # Local types
├── schemas/             # Zod schemas for inputs
├── index.ts             # Public surface — what the rest of the app imports
└── README.md            # What this feature does
```
