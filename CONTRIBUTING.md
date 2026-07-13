# Contributing to SONDA

Thanks for your interest in contributing. SONDA is in its early days and every contribution helps shape the product.

## Ground rules

- Be respectful. Disagree on ideas, not people.
- Keep PRs small and focused.
- Match the existing code style (Prettier + ESLint handle the rest).
- Don't commit secrets, `.env` files, or generated assets.

## Development

```bash
pnpm install
cp .env.example .env.local   # fill in any keys you need
pnpm dev
```

Useful scripts:

```bash
pnpm lint         # ESLint
pnpm format       # Prettier write
pnpm type-check   # tsc --noEmit
```

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new feature
- `fix:` — bug fix
- `chore:` — tooling, deps, config
- `docs:` — docs only
- `refactor:` — no behavior change
- `test:` — tests
- `style:` — formatting only

## Pull requests

1. Fork the repo and create a feature branch.
2. Make your change.
3. Run `pnpm lint`, `pnpm format`, `pnpm type-check` locally.
4. Open a PR with a clear description of the change.

## Reporting bugs

Open an issue using the **Bug report** template. Include reproduction steps, expected vs actual, and screenshots if relevant.

## Feature requests

Open an issue using the **Feature request** template. Describe the problem first, then the solution.
