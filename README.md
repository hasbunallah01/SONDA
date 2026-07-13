<p align="center">
  <a href="https://github.com/hasbunallah01/SONDA">
    <img src="public/logos/sonda-logo.png" alt="SONDA Logo" width="280" />
  </a>
</p>

<h1 align="center">SONDA</h1>

<p align="center">
  <strong>An Autonomous AI Product Launch Jury</strong>
</p>

<p align="center">
  <em>Explore your product before your users do.</em>
</p>

<p align="center">
  <a href="https://github.com/hasbunallah01/SONDA/stargazers"><img src="https://img.shields.io/github/stars/hasbunallah01/SONDA?style=for-the-badge&color=6366f1" alt="Stars" /></a>
  <a href="https://github.com/hasbunallah01/SONDA/network/members"><img src="https://img.shields.io/github/forks/hasbunallah01/SONDA?style=for-the-badge&color=8b5cf6" alt="Forks" /></a>
  <a href="https://github.com/hasbunallah01/SONDA/blob/main/LICENSE"><img src="https://img.shields.io/github/license/hasbunallah01/SONDA?style=for-the-badge&color=06b6d4" alt="License" /></a>
  <a href="https://github.com/hasbunallah01/SONDA/issues"><img src="https://img.shields.io/github/issues/hasbunallah01/SONDA?style=for-the-badge&color=0ea5e9" alt="Issues" /></a>
  <a href="https://vercel.com"><img src="https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel" alt="Deployed on Vercel" /></a>
</p>

<p align="center">
  <a href="#overview">Overview</a> ·
  <a href="#problem">Problem</a> ·
  <a href="#solution">Solution</a> ·
  <a href="#key-features">Features</a> ·
  <a href="#review-types">Review Types</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#why-sonda">Why SONDA?</a> ·
  <a href="#tech-stack">Tech Stack</a> ·
  <a href="#getting-started">Getting Started</a> ·
  <a href="#roadmap">Roadmap</a> ·
  <a href="#contributing">Contributing</a>
</p>

---

## Overview

**SONDA** is an autonomous AI product launch jury. Instead of chatting with an AI, you submit your product for investigation.

SONDA autonomously explores the product, gathers evidence, evaluates it from multiple expert perspectives, and returns **one trusted launch verdict**.

SONDA is not a chatbot.
It is an **autonomous AI platform for evaluating launch readiness**.

> *"Explore your product before your users do."*

---

## Problem

Launching a product is stressful. Founders, indie hackers, and teams ship into the unknown:

- **Is the product actually ready?**
- **What does the user experience feel like?**
- **Will a hackathon judge be impressed?**
- **Will an investor take it seriously?**
- **Are there critical bugs hiding in plain sight?**

You can ask a friend, hire a consultant, or post on a forum — but those are slow, biased, and inconsistent. A website audit tool tells you about SEO, not about *whether your product is ready to launch*.

You need a **jury**, not a tool.

---

## Solution

SONDA acts as a panel of autonomous experts that investigates your product end-to-end and renders a verdict:

- **QA Engineer** — does it work?
- **UX Designer** — is it usable?
- **Marketing Expert** — is the story clear?
- **Investor** — is it fundable?
- **Hackathon Judge** — is it impressive?
- **First-Time User** — is it intuitive?

Each expert autonomously investigates, collects evidence, scores the product, and writes notes. A verdict engine then aggregates the findings into a single **Launch Verdict** with a score, status, strengths, weaknesses, and priority fixes.

All you do is **submit the URL or ZIP**. SONDA does the rest.

---

## Key Features

- 🤖 **Autonomous Multi-Agent Jury** — six specialized AI reviewers working in parallel
- 🔍 **Multi-Source Investigation** — public websites, GitHub repos, ZIP uploads, private sites
- 📊 **Unified Evidence Pipeline** — every input source produces a normalized evidence bundle
- 🎯 **Single Launch Verdict** — one trusted go/no-go signal, with full reasoning
- 🎨 **Premium Investigation UI** — live timeline showing each expert at work
- ⚡ **Built for Scale** — modular architecture, easy to add new sources and reviewers
- 🔒 **Privacy-Aware** — explicit gating for private sources, no execution of uploaded code
- 🧩 **Extensible** — new reviewers, new sources, new rules — drop-in modules

---

## Supported Review Types

| Priority | Type             | Status         | Input                  |
| -------- | ---------------- | -------------- | ---------------------- |
| 1️⃣       | Public Website   | ✅ Functional  | `https://example.com`  |
| 2️⃣       | GitHub Repository| ✅ Functional  | `https://github.com/...` |
| 3️⃣       | Local ZIP Project| ✅ Functional  | `.zip` upload          |
| 4️⃣       | Private Website  | 🚧 Scaffolded  | URL + credentials + 2FA |

### ✅ Public Website Review

- Browser exploration
- Screenshot capture
- Lighthouse analysis
- Accessibility analysis
- Content extraction
- Evidence generation

### ✅ GitHub Repository Review

- Repository structure
- README quality
- Documentation depth
- Architecture organization
- Project completeness
- Startup readiness signals

> Private repositories are out of scope for the MVP.

### ✅ Local Project ZIP Review

- Folder structure analysis
- Documentation review
- Frontend / backend organization
- Project completeness check
- Startup readiness signal

> Uploaded projects are **never executed** in the MVP. Only static inspection.
> Architecture is designed to support runtime analysis later.

### 🚧 Private Website Review

- Full UI and form (URL, username, password, optional 2FA, notes)
- Playwright authentication architecture prepared
- Username/password flow scheduled for post-MVP

---

## Architecture

SONDA uses a **unified evidence pipeline**. Every review source — public website, GitHub repo, ZIP upload, private site — funnels into the same normalized **Evidence Bundle** before reaching the AI reviewers.

```
            ┌─────────────────────┐
            │   Public Website    │──┐
            └─────────────────────┘  │
            ┌─────────────────────┐  │
            │  GitHub Repository  │──┤
            └─────────────────────┘  │
            ┌─────────────────────┐  │   ┌──────────────────┐
            │    ZIP Upload       │──┼──▶│ Evidence Bundle  │
            └─────────────────────┘  │   └──────────────────┘
            ┌─────────────────────┐  │           │
            │  Private Website    │──┘           │
            └─────────────────────┘              │
                                                 ▼
                                  ┌──────────────────────────┐
                                  │       Review Engine      │
                                  └──────────────────────────┘
                                                 │
        ┌────────────┬────────────┬──────────────┼──────────────┬────────────┐
        ▼            ▼            ▼              ▼              ▼            ▼
   ┌─────────┐  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
   │   QA    │  │   UX    │  │Marketing │  │ Investor │  │  Judge   │  │First User│
   └─────────┘  └─────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘
        │            │            │              │              │            │
        └────────────┴────────────┴──────────────┴──────────────┴────────────┘
                                                 │
                                                 ▼
                                  ┌──────────────────────────┐
                                  │     Verdict Engine       │
                                  └──────────────────────────┘
                                                 │
                                                 ▼
                                  ┌──────────────────────────┐
                                  │   SONDA Launch Verdict   │
                                  └──────────────────────────┘
```

Adding a new review source is a matter of implementing a new `EvidenceCollector` — the rest of the pipeline stays untouched.

---

## Why the Name SONDA?

> **A sonde is a scientific probe sent ahead into the atmosphere, ocean, or space — before humans arrive.**

It measures conditions, discovers problems, and sends information back so people can make informed decisions.

SONDA applies the same philosophy to software.

Instead of sending a scientific probe into the environment, **SONDA sends an autonomous AI probe through a website, repository, or project — before users arrive.**

It explores, investigates, tests, evaluates, and returns with **one trusted launch verdict**.

> 🛰️ Scientists send a *sonde* before making important decisions.
> 🛰️ Builders send *SONDA* before launching important products.

---

## Tech Stack

**Frontend**
- [Next.js](https://nextjs.org/) (App Router)
- [React](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/) (strict)
- [Tailwind CSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Lucide Icons](https://lucide.dev/)

**Backend**
- Next.js Route Handlers
- [Playwright](https://playwright.dev/) (browser automation)
- [OpenAI API](https://openai.com/) (reasoning)

**Data**
- [PostgreSQL](https://www.postgresql.org/)
- [Prisma ORM](https://www.prisma.io/)
- [Neon](https://neon.tech/) (serverless Postgres)

**Infrastructure**
- [Vercel](https://vercel.com/) (deployment)
- Serverless + Edge functions

**Developer Experience**
- ESLint, Prettier, Husky, lint-staged
- EditorConfig
- Path aliases (`@/*`)
- Strict TypeScript

---

## Repository Structure

```
SONDA/
├── app/                    # Next.js App Router (pages, routes, layouts)
│   ├── (marketing)/        # Landing, pricing, etc.
│   ├── (app)/              # Review, running, results
│   ├── api/                # Route handlers
│   ├── error.tsx
│   ├── not-found.tsx
│   ├── loading.tsx
│   └── layout.tsx
├── components/             # Reusable UI primitives
│   └── ui/                 # shadcn/ui components
├── features/               # Feature modules
│   ├── website-review/
│   ├── github-review/
│   ├── zip-review/
│   ├── private-review/
│   ├── review-engine/
│   └── verdict-engine/
├── agents/                 # AI reviewer implementations
│   ├── qa/
│   ├── ux/
│   ├── marketing/
│   ├── investor/
│   ├── judge/
│   └── first-user/
├── prompts/                # Prompt templates per reviewer
├── services/               # External service clients
├── lib/                    # Generic utilities
├── hooks/                  # React hooks
├── types/                  # Shared types
├── styles/                 # Global styles
├── prisma/                 # Prisma schema & migrations
├── public/                 # Static assets, logos, OG images
├── docs/                   # Internal documentation
├── scripts/                # Operational scripts
├── tests/                  # Tests
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## Getting Started

### Prerequisites

- Node.js **20+**
- pnpm **9+** (or npm / yarn)
- PostgreSQL (or a Neon connection string)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/hasbunallah01/SONDA.git
cd SONDA

# 2. Install dependencies
pnpm install

# 3. Set up environment variables
cp .env.example .env.local
# then fill in the values (see below)

# 4. Generate Prisma client
pnpm prisma generate

# 5. Run the development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see SONDA in action.

### Environment Variables

Create a `.env.local` from `.env.example`:

```env
# OpenAI — used by every AI reviewer
OPENAI_API_KEY=

# Postgres connection (Neon recommended)
DATABASE_URL=

# NextAuth secret (when auth is added)
NEXTAUTH_SECRET=

# Optional: GitHub token for higher rate limits on repo analysis
GITHUB_TOKEN=
```

> 🚨 **Never commit secrets.** `.env*` is git-ignored by default.

### Scripts

| Command            | Description                              |
| ------------------ | ---------------------------------------- |
| `pnpm dev`         | Start the dev server                     |
| `pnpm build`       | Production build                         |
| `pnpm start`       | Run the production build                 |
| `pnpm lint`        | Run ESLint                               |
| `pnpm format`      | Run Prettier                             |
| `pnpm typecheck`   | TypeScript strict check                  |
| `pnpm prisma:gen`  | Generate Prisma client                   |
| `pnpm prisma:mig`  | Run Prisma migrations                    |

---

## Development Roadmap

- [x] Production scaffold
- [x] Landing / Review / Running / Results / 404 / Error / Loading pages
- [x] Four review-type input forms (Public, GitHub, ZIP, Private)
- [x] Modular agent + prompt placeholders
- [x] Unified Evidence Bundle type system
- [x] Premium UI foundation (shadcn/ui + Tailwind)
- [ ] Real Playwright browser exploration
- [ ] Real Lighthouse + a11y analysis
- [ ] Real GitHub repo parser
- [ ] Real ZIP inspector (no execution)
- [ ] Real OpenAI-powered reviewers
- [ ] Verdict Engine
- [ ] Persistent review history (Postgres + Prisma)
- [ ] Authentication (NextAuth)
- [ ] Team / org reviews
- [ ] Public launch verdict sharing pages
- [ ] Custom reviewer packs

---

## Screenshots

> Placeholder — real screenshots land after the next sprint.

| Landing | Review | Running | Results |
| ------- | ------ | ------- | ------- |
| TBD     | TBD    | TBD     | TBD     |

---

## Demo

A live demo will be linked here once deployed to Vercel.

---

## Future Plans

- **Real evidence collectors** for every source
- **Verdict Engine v2** with weighted scoring & custom rules
- **Reviewer marketplace** — let teams define their own jurors
- **Continuous reviews** — re-run SONDA on every deploy
- **Public verdict pages** — shareable launch reports
- **Integrations** — Vercel, GitHub Actions, Linear, Notion
- **Team mode** — multi-product review dashboards

---

## Contributing

Contributions are welcome and appreciated.

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-thing`)
3. Commit your changes (`git commit -m 'feat: add amazing thing'`)
4. Push the branch (`git push origin feat/amazing-thing`)
5. Open a Pull Request

Please read [`CONTRIBUTING.md`](./CONTRIBUTING.md) (coming soon) for guidelines.

---

## License

Released under the [MIT License](./LICENSE).

---

## Acknowledgements

- Inspired by **Cursor**, **Linear**, **Vercel**, and **Notion** for design philosophy
- Built with ❤️ by the SONDA team and contributors
- Logo and branding © SONDA

---

<p align="center">
  <sub>SONDA — explore your product before your users do.</sub>
</p>
