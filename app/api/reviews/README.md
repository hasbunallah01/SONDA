# `app/api/reviews/` — Review session API

The first REST endpoint of the SONDA backend. Persists the user's intake and returns a session id the frontend can later poll for status / results.

## Endpoints

| Method | Path           | Purpose                                          |
| ------ | -------------- | ------------------------------------------------ |
| POST   | `/api/reviews` | Create a new `ReviewSession` (status `PENDING`). |

## Request

```http
POST /api/reviews
Content-Type: application/json

{
  "type": "website",
  "target": "https://example.com"
}
```

| Field    | Type   | Notes                                                                      |
| -------- | ------ | -------------------------------------------------------------------------- |
| `type`   | string | One of `website`, `github`, `zip`, `private`.                              |
| `target` | string | The URL or artifact reference. Per-source validation lives in the feature. |

## Response

**201 Created**

```json
{
  "id": "ckxxxxxxxxxxxxxxxx",
  "status": "PENDING",
  "type": "WEBSITE",
  "createdAt": "2026-07-13T17:50:40.000Z"
}
```

**400 Bad Request** — body failed Zod validation. The `details` array lists per-field issues.

**500 Internal Server Error** — persistence failed. The user-facing message is generic; the server console has the full stack.

## What's _not_ in this task

- No auth, no `userId` extraction.
- No background worker / orchestrator.
- No analyzer (browser, GitHub, ZIP, private).
- No AI reviewer.

The session is created and left in `PENDING`. The next task (the review engine) will pick it up.
