# `services/` — External service clients

Wrappers around third-party APIs and infrastructure. Each service exposes a small, typed surface and hides provider-specific concerns.

## Planned services

| Service         | Purpose                                                  |
| --------------- | -------------------------------------------------------- |
| `openai.ts`     | Thin client over the OpenAI Chat Completions API         |
| `playwright.ts` | Manages Playwright browser instances (private sites)     |
| `github.ts`     | GitHub REST API client (repos, READMEs, trees, metadata) |
| `lighthouse.ts` | Wrapper around Lighthouse audits                         |
| `storage.ts`    | Object storage (S3 / Vercel Blob) for evidence artifacts |
| `pusher.ts`     | Real-time updates to the running-review UI               |

> No services are implemented in this task.
