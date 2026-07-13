# SONDA — Brand & Design System

> **Status:** Task 3.1 — Visual foundation only.
> Components, pages, layouts, and animations land in later tasks.

This document is the single reference for SONDA's visual identity. **The SONDA logo (`public/logos/sonda-logo.png`) is the source of truth** — every color in this system was sampled from it.

---

## 1. Logo

Stored under `public/logos/`:

| File                                       | Use                                                            |
| ------------------------------------------ | -------------------------------------------------------------- |
| `sonda-icon-{16,32,48,64,128,256,512}.png` | Favicons, app icons, PWA                                       |
| `sonda-icon.png`                           | Default icon                                                   |
| `sonda-logo.png`                           | Full logo (icon + wordmark) — preferred for marketing surfaces |
| `sonda-logo@2x.png`                        | Retina variant                                                 |
| `sonda-logo-original.png`                  | Source artwork                                                 |
| `sonda-wordmark.png`                       | Text-only wordmark                                             |

> The wordmark is the **deep navy** `#000820` against white. The icon is an **indigo → cyan gradient** sweeping from the top of the "S" to the bottom tail.

---

## 2. Color Palette

### 2.1 Brand scale (raw, logo-derived)

These are the literal colors pulled from the logo. Use them only when the semantic tokens below don't fit (e.g. gradients, illustrations).

| Token                | Hex       | Source                          |
| -------------------- | --------- | ------------------------------- |
| `--brand-indigo-500` | `#5860F8` | Top of logo "S" — **primary**   |
| `--brand-indigo-600` | `#4848E8` | Logo mid-stop                   |
| `--brand-indigo-700` | `#2048D0` | Logo deep stop                  |
| `--brand-cyan-500`   | `#20C8E8` | Bottom of logo "S" — **accent** |
| `--brand-cyan-600`   | `#0891B2` | Accent hover                    |
| `--brand-navy-900`   | `#000820` | Wordmark color                  |
| `--brand-navy-800`   | `#0A0E27` | Slightly lighter navy           |

Full 50–900 ramps for indigo and 300–700 for cyan are available as `var(--brand-…)` and Tailwind utilities `bg-brand-indigo-500`, `bg-brand-cyan-500`, etc.

### 2.2 Semantic tokens (consume these in components)

All semantic tokens are HSL channel triplets so Tailwind's `hsl(var(--token))` works, and they automatically switch in dark mode.

| Role             | CSS variable         | Light              | Dark               |
| ---------------- | -------------------- | ------------------ | ------------------ |
| Primary          | `--primary`          | `#5860F8` (indigo) | `#9DA3FC` (lifted) |
| Primary Hover    | `--primary-hover`    | `#4848E8`          | `#B7BCFD`          |
| Secondary        | `--secondary`        | `#000820` (navy)   | `#F1F5F9` (lifted) |
| Accent           | `--accent`           | `#20C8E8` (cyan)   | `#5FE3F8`          |
| Background       | `--background`       | `#FFFFFF`          | `#06080F`          |
| Surface          | `--surface`          | `#F8FAFC`          | `#0A0F1F`          |
| Surface elevated | `--surface-elevated` | `#FFFFFF`          | `#111827`          |
| Muted            | `--muted`            | `#F1F5F9`          | `#1E293B`          |
| Border           | `--border`           | `#E2E8F0`          | `#1E293B`          |
| Success          | `--success`          | `#10B981`          | `#22C58E`          |
| Warning          | `--warning`          | `#F59E0B`          | `#F5A623`          |
| Error            | `--error`            | `#EF4444`          | `#F26B6B`          |
| Text Primary     | `--text-primary`     | `#0A0E27`          | `#F8FAFC`          |
| Text Secondary   | `--text-secondary`   | `#475569`          | `#B5BFCD`          |

### 2.3 Usage in code

```tsx
// Tailwind utilities (preferred)
<div className="bg-background text-text-primary border border-border">
  <h1 className="font-display text-h1">SONDA</h1>
  <p className="text-text-secondary">A premium AI product launch jury.</p>
  <span className="bg-gradient-brand bg-clip-text-brand text-transparent">
    Indigo → Cyan
  </span>
</div>

// Raw CSS
.hero {
  background: linear-gradient(135deg,
    hsl(var(--primary)) 0%,
    hsl(var(--accent)) 100%);
}
```

---

## 3. Typography

### 3.1 Fonts

Installed via `next/font/google` in `app/layout.tsx`. **Self-hosted** — no runtime requests to Google.

| Family             | CSS var          | Used for            | Weights loaded     |
| ------------------ | ---------------- | ------------------- | ------------------ |
| **Space Grotesk**  | `--font-display` | Display, H1–H6      | 500, 600, 700      |
| **Inter**          | `--font-sans`    | Body, UI, captions  | 400, 500, 600, 700 |
| **JetBrains Mono** | `--font-mono`    | Code, monospaced UI | 400, 500, 600      |

Tailwind utilities: `font-display`, `font-sans`, `font-mono`.

### 3.2 Type scale

Fluid `clamp(min, fluid, max)` — looks correct from 360 px mobile through 4K.

| Token     | Min   | Max   | CSS var          | Use                              |
| --------- | ----- | ----- | ---------------- | -------------------------------- |
| `display` | 48 px | 76 px | `--text-display` | Hero headlines, marketing splash |
| `h1`      | 36 px | 52 px | `--text-h1`      | Page titles                      |
| `h2`      | 30 px | 40 px | `--text-h2`      | Section titles                   |
| `h3`      | 24 px | 32 px | `--text-h3`      | Card / subsection titles         |
| `h4`      | 24 px | 24 px | `--text-h4`      | Sub-blocks                       |
| `h5`      | 20 px | 20 px | `--text-h5`      | Small headings                   |
| `h6`      | 18 px | 18 px | `--text-h6`      | Smallest heading                 |
| `body`    | 16 px | 16 px | `--text-body`    | Default body text                |
| `caption` | 14 px | 14 px | `--text-caption` | Helper text, labels              |
| `small`   | 13 px | 13 px | `--text-small`   | Dense UI                         |
| `xs`      | 12 px | 12 px | `--text-xs`      | Meta / overlines                 |

### 3.3 Usage

```tsx
<h1 className="font-display text-h1">An autonomous AI product launch jury</h1>
<p className="text-body text-text-secondary">Default body copy.</p>
<span className="text-caption text-text-muted">Helper text</span>
<code className="font-mono">const sonda = new Jury();</code>
```

Or use the matching semantic class names: `.display`, `.h1`–`.h6`, `.body`, `.caption`, `.small`, `.text-xs-meta`, `.code`.

---

## 4. Logo gradient

A drop-in gradient that mirrors the SONDA logo:

```css
background: linear-gradient(135deg, #5860f8 0%, #4848e8 45%, #20c8e8 100%);
```

Tailwind: `bg-gradient-brand` (full) or `bg-gradient-brand-soft` (subtle tint).

For text: `bg-gradient-brand bg-clip-text-brand text-transparent`.

---

## 5. Radii

| Token         | Value | Tailwind                 |
| ------------- | ----- | ------------------------ |
| `--radius-sm` | 8 px  | `rounded-sm`             |
| `--radius-md` | 10 px | `rounded-md`             |
| `--radius-lg` | 12 px | `rounded-lg` _(default)_ |
| `--radius-xl` | 16 px | `rounded-xl`             |
| `--radius`    | 12 px | `rounded`                |

---

## 6. Shadows

Brand-tinted (subtle indigo haze):

| Token                           | Use                          |
| ------------------------------- | ---------------------------- |
| `shadow-xs`                     | Hairline elevation           |
| `shadow-sm`                     | Cards at rest                |
| `shadow-md`                     | Cards on hover               |
| `shadow-lg`                     | Modals, popovers             |
| `shadow-xl`                     | Hero, marketing blocks       |
| `shadow-brand-sm` / `md` / `lg` | Primary CTAs and focus halos |

---

## 7. Dark mode

Two ways to trigger dark mode (both implemented in `globals.css`):

1. Add `class="dark"` (or `data-theme="dark"`) to `<html>`.
2. The user's OS preference (`prefers-color-scheme: dark`) — applied automatically unless `<html class="light">` is set.

The two paths converge on the same token set, so components don't care which is active.

---

## 8. What this task does NOT include

Per the task scope, the following are **out of scope** and belong to later tasks:

- Buttons, cards, badges, forms
- Layouts, navigation, footers
- Pages, route handlers
- Icons (Lucide is installed but unused here)
- Animations beyond what Tailwind's animate plugin already provided
- Backend, business logic, API routes

See `app/README.md` and `styles/README.md` for the directory conventions.
