# `prompts/` — LLM prompt templates

Each reviewer has its own prompt file (`.md`) that is loaded at runtime by the corresponding agent in `agents/<name>/`.

## Why `.md` files?

- Easy to read, review, and iterate on in GitHub.
- Plain-text diffs.
- Versioned alongside code.

## Convention

- Top of file: **role** and **mission** for the reviewer.
- Middle: **what the evidence bundle contains** and what the reviewer should look for.
- Bottom: **output contract** (JSON shape the LLM must return).

> All prompts in this folder are placeholders. Real prompts will be authored in the next phase.
