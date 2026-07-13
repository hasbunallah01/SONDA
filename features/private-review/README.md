# `features/private-review/` — Private Website Review (post-MVP)

Reviews an **authenticated website** using Playwright, with support for credentials and 2FA.

## What it does (planned)

- Accepts URL, username, password, optional 2FA code, optional notes.
- Stores credentials in a short-lived, encrypted session (not at rest).
- Authenticates via Playwright with a headless browser.
- Continues the same evidence collection as `website-review`, but on the authenticated surface.

## Inputs

```ts
{
  kind: 'private';
  url: string;
  username: string;
  password: string;
  twoFactorCode?: string;
  notes?: string;
}
```

## Security notes

- Credentials are never logged or persisted in plaintext.
- Sessions are scoped to a single review run and torn down on completion.
- An audit trail of authentication attempts is recorded with the review.

## Status

🚧 **Scaffolded in the MVP.** Username/password flow is scheduled for the post-MVP phase. The UI form and Playwright authentication architecture are prepared in the next phase.
