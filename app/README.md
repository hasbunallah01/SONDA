# `app/` — Next.js App Router

This directory uses the **Next.js App Router** (introduced in Next.js 13+). Each folder represents a route segment, and `page.tsx` files define the UI for a route.

## Layout philosophy

- **Route groups** (folders wrapped in parentheses) are used to organize pages by intent (e.g. `(marketing)` for the landing site, `(app)` for the product experience) without affecting the URL.
- **`layout.tsx`** files wrap children and are the right place for shared chrome (nav, footer, providers).
- **`loading.tsx`**, **`error.tsx`**, **`not-found.tsx`** are React Server Component conventions for streaming, error boundaries, and 404s.

## Future structure (planned)

```
app/
├── (marketing)/         # Landing, public-facing pages
├── (app)/               # Product experience (review, running, results)
├── api/                 # Route handlers
├── layout.tsx           # Root layout (providers, fonts, metadata)
├── globals.css          # Tailwind + design tokens
├── loading.tsx          # Global loading boundary
├── error.tsx            # Global error boundary
└── not-found.tsx        # 404 page
```

> No pages are implemented in this task. They will be added in the next phase.
