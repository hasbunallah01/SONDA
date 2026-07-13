# `features/website-review/` — Public Website Review

Reviews a **public website** end-to-end and produces a normalized **Evidence Bundle**.

## What it does (planned)

- Validates the input URL (`https://...`).
- Launches a headless browser via Playwright.
- Captures screenshots (hero, scroll positions, full page).
- Runs Lighthouse (performance, SEO, best practices).
- Runs accessibility analysis (axe).
- Extracts visible text content, metadata, links, forms.
- Bundles everything into a single `EvidenceBundle` for the reviewer pipeline.

## Inputs

```ts
{
  kind: 'website';
  url: string;
}
```

## Outputs

A `WebsiteEvidenceBundle` (extends `EvidenceBundle`) with:

- `screenshots: string[]` (URLs to stored images)
- `lighthouse: LighthouseReport`
- `accessibility: AccessibilityReport`
- `content: ExtractedContent`
- `meta: { title, description, favicon, ogImage, ... }`

## Placeholders

This task only sets up the directory. Implementation lands in the next phase.
