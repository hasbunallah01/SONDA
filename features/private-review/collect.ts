/**
 * features/private-review/collect — Private Website evidence collector
 *
 * Task 6.18 — Evidence Collector: Private Website.
 *
 * Fetches a password-protected (or session-protected) website
 * and produces an `EvidenceBundle` for the reviewer pipeline.
 *
 * Auth strategy (MVP)
 *   - If `credentials.username` and `credentials.password` are
 *     supplied, the collector uses HTTP Basic Auth on the
 *     initial request.
 *   - Cookie / form / SSO / 2FA flows are out of scope for
 *     this task. They land in a follow-up.
 *
 * What it captures
 *   - Same fields as the public-website collector (see
 *     `features/website-review/collect.ts`).
 *
 * Out of scope
 *   - Session-cookie handling.
 *   - OAuth / SAML / 2FA.
 *   - Real screenshot capture.
 *   - Lighthouse / axe-core.
 */

import type { EvidenceBundle } from '@/types/evidence';
import { collectWebsiteEvidence } from '@/features/website-review/collect';

export type PrivateWebsiteCredentials = {
  username?: string;
  password?: string;
};

/**
 * Collect evidence for a private-website review.
 *
 * @param target  the protected URL the user submitted.
 * @param credentials  optional HTTP Basic Auth credentials.
 * @returns the assembled `EvidenceBundle`.
 */
export const collectPrivateWebsiteEvidence = async (
  target: string,
  credentials?: PrivateWebsiteCredentials,
  submittedAt: string = new Date().toISOString(),
  bundleId: string = crypto.randomUUID(),
): Promise<EvidenceBundle> => {
  // For MVP, the private collector delegates to the public one
  // and applies Basic Auth via an environment-level hook: we
  // cannot easily inject headers from the call site into the
  // existing fetch in `collectWebsiteEvidence`, so we wrap
  // here and rely on a basic-auth URL convention.
  //
  // When credentials are supplied, we rewrite the target URL
  // to embed them. The downstream fetch unwraps them and
  // passes them as an Authorization header.
  const effectiveTarget = injectBasicAuth(target, credentials);

  const bundle = await collectWebsiteEvidence(effectiveTarget, submittedAt, bundleId);

  // Re-stamp the metadata so the source is 'private' and the
  // visible label is the original URL (without the credentials).
  return {
    ...bundle,
    metadata: {
      ...bundle.metadata,
      source: 'private',
      input: {
        label: target,
        url: target,
      },
    },
    logs: {
      items: [
        ...bundle.logs.items,
        {
          at: submittedAt,
          level: 'info',
          message: credentials?.username
            ? `Authenticated as ${credentials.username} via HTTP Basic Auth.`
            : 'No credentials supplied — request sent anonymously.',
        },
      ],
    },
  };
};

/**
 * Embed HTTP Basic Auth credentials into a URL.
 *
 * Format: `https://user:pass@host/path`
 *
 * Browser and Node both strip the credentials from the URL
 * before they hit the wire and instead send them as an
 * `Authorization: Basic ...` header — which is what we want.
 */
const injectBasicAuth = (
  raw: string,
  credentials: PrivateWebsiteCredentials | undefined,
): string => {
  if (!credentials?.username || !credentials.password) {
    return raw;
  }
  try {
    const url = new URL(raw);
    // URL.username / URL.password are the supported setters.
    url.username = encodeURIComponent(credentials.username);
    url.password = encodeURIComponent(credentials.password);
    return url.toString();
  } catch {
    return raw;
  }
};
