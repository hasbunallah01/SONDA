# `features/github-review/` — GitHub Repository Review

Reviews a **public GitHub repository** end-to-end and produces a normalized **Evidence Bundle**.

## What it does (planned)

- Validates the input URL (`https://github.com/<owner>/<repo>`).
- Fetches repo metadata, languages, file tree.
- Fetches and parses `README.md`, `LICENSE`, contributing guides.
- Samples key files to assess structure and quality.
- Bundles everything into a `GithubEvidenceBundle`.

## Inputs

```ts
{
  kind: 'github';
  url: string; // https://github.com/<owner>/<repo>
}
```

## Constraints

- Public repos only. Private repos are explicitly out of scope for the MVP.

## Placeholders

This task only sets up the directory. Implementation lands in the next phase.
