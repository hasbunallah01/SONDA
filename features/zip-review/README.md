# `features/zip-review/` — Local ZIP Project Review

Reviews an **uploaded ZIP archive** containing a project and produces a normalized **Evidence Bundle**.

## What it does (planned)

- Accepts a `.zip` upload (size & extension validation).
- Extracts to a sandboxed temp directory.
- Walks the file tree, detects frameworks (Next.js, Vite, Rails, etc.).
- Reads top-level docs (`README.md`, `LICENSE`, etc.).
- Inspects folder structure, config files, key directories.
- Bundles everything into a `ZipEvidenceBundle`.

## Constraints

- The MVP **must not execute** uploaded code. Only static inspection.
- Architecture is designed so runtime analysis can be added later behind a clear safety boundary.

## Inputs

```ts
{
  kind: 'zip';
  file: File; // .zip
}
```

## Placeholders

This task only sets up the directory. Implementation lands in the next phase.
