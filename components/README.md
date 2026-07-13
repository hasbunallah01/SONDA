# `components/` — Reusable UI primitives

This directory holds **presentational, reusable components** that are not tied to a specific feature. Anything that depends on a particular feature's logic should live in `features/<feature>/components/` instead.

## Structure

```
components/
├── ui/                  # shadcn/ui generated primitives (Button, Card, etc.)
└── <other>.tsx          # Cross-feature shared components
```

## Rules of thumb

- ✅ Pure, presentational, prop-driven — easy to test and reuse.
- ✅ Composed from shadcn/ui primitives.
- ❌ No feature-specific business logic.
- ❌ No direct data fetching — features handle that.
