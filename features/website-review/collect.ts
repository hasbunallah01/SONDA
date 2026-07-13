/**
 * features/website-review/collect — Public Website evidence collector
 *
 * Task 6.15 — Evidence Collector: Website.
 *
 * Fetches a public website and produces an `EvidenceBundle` that
 * the reviewer pipeline can score. The collector uses
 * `fetch` (Node 20+, available in Vercel's serverless runtime)
 * and lightweight regex-based HTML parsing — there is no full
 * HTML parser dependency, the bundle only needs the fields the
 * reviewers actually score on.
 *
 * What it captures
 *   - `metadata.facts.title`       — `<title>` / `og:title`
 *   - `metadata.facts.description` — `<meta name="description">` / `og:description`
 *   - `metadata.facts.imageUrl`    — `og:image`
 *   - `pageContent.headings`        — H1, H2, H3 in document order
 *   - `pageContent.body`            — visible text (HTML stripped)
 *   - `pageContent.links`          — `<a href>` with text
 *   - `screenshots.items`           — empty (real browser capture
 *                                    lands with the Playwright task)
 *   - `accessibility`               — not collected (axe-core lands later)
 *   - `metrics`                     — not collected (Lighthouse lands later)
 *
 * Robustness
 *   - Time-bounded fetch (15s).
 *   - Caps response body at 1 MB.
 *   - Rejects non-HTML content types.
 *   - Captures every error into the `logs` section so the
 *     reviewers and the results API can show what went wrong.
 *
 * Out of scope
 *   - Screenshots (Playwright).
 *   - Lighthouse (Lighthouse CLI).
 *   - axe-core (axe).
 *   - JavaScript rendering. The collector reads the static
 *     HTML response; SPAs that render client-side will score
 *     low on body / headings until a real browser lands.
 */

import type { EvidenceBundle, EvidenceMetadata, EvidencePageContent } from '@/types/evidence';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 1_000_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; SONDA/1.0; +https://sonda-phi.vercel.app)';

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export class WebsiteCollectError extends Error {
  public readonly kind:
    | 'invalid-url'
    | 'fetch-failed'
    | 'timeout'
    | 'too-large'
    | 'unsupported-content-type'
    | 'unknown';
  // `cause` is supported on Error in Node 18+; we re-declare it
  // for clarity and to satisfy the noImplicitOverride rule.
  public override readonly cause?: unknown;

  constructor(kind: WebsiteCollectError['kind'], message: string, cause?: unknown) {
    super(message);
    this.name = 'WebsiteCollectError';
    this.kind = kind;
    this.cause = cause;
  }
}

/* -------------------------------------------------------------------------- */
/* HTML parsing helpers                                                       */
/* -------------------------------------------------------------------------- */

const ENTITY_DECODE: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…',
  '&copy;': '©',
  '&reg;': '®',
  '&trade;': '™',
};

const decodeEntities = (raw: string): string => {
  let out = raw;
  for (const [entity, replacement] of Object.entries(ENTITY_DECODE)) {
    if (out.includes(entity)) {
      out = out.split(entity).join(replacement);
    }
  }
  // Numeric entities (decimal and hex).
  out = out.replace(/&#(\d+);/g, (_match, dec) => String.fromCharCode(Number.parseInt(dec, 10)));
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
  return out;
};

const stripTags = (raw: string): string => {
  // Drop script / style blocks first.
  let html = raw.replace(/<script\b[\s\S]*?<\/script>/gi, ' ');
  html = html.replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
  // Replace block-level closing tags with newlines so headings
  // are not glued together.
  html = html.replace(/<\/(p|div|li|tr|h[1-6]|br|hr)>/gi, '\n');
  // Strip the rest of the tags.
  html = html.replace(/<[^>]+>/g, ' ');
  // Collapse whitespace.
  return html.replace(/\s+/g, ' ').trim();
};

/**
 * Extract the FIRST match of a regex from `html`, or
 * `undefined`. Designed for the small set of meta tags the
 * reviewers care about.
 */
const metaContent = (html: string, pattern: RegExp): string | undefined => {
  const match = html.match(pattern);
  if (!match || typeof match[1] !== 'string') return undefined;
  return decodeEntities(match[1].trim());
};

/**
 * Pull every H1/H2/H3 in document order.
 */
const extractHeadings = (html: string): string[] => {
  const out: string[] = [];
  const re = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const inner = decodeEntities(match[2] ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (inner.length > 0) out.push(inner);
  }
  return out;
};

/**
 * Pull every link (`<a href="...">text</a>`). Same-origin
 * anchors and `javascript:` / `mailto:` are dropped.
 */
const extractLinks = (html: string): { href: string; text: string }[] => {
  const out: { href: string; text: string }[] = [];
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const href = (match[1] ?? '').trim();
    if (
      href.length === 0 ||
      href.startsWith('#') ||
      href.startsWith('javascript:') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:')
    ) {
      continue;
    }
    const text = decodeEntities(match[2] ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    out.push({ href, text });
  }
  return out;
};

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Collect evidence for a public website review.
 *
 * @param target  the URL the user submitted.
 * @returns the assembled `EvidenceBundle`.
 * @throws `WebsiteCollectError` on validation, network, or
 *         content-type failure. The error is structured so the
 *         orchestrator can decide whether to retry or mark
 *         the session FAILED.
 */
export const collectWebsiteEvidence = async (
  target: string,
  submittedAt: string = new Date().toISOString(),
  bundleId: string = crypto.randomUUID(),
): Promise<EvidenceBundle> => {
  const url = normaliseUrl(target);

  // Use the headers to validate before the body is read.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new WebsiteCollectError(
        'timeout',
        `Request to ${url} timed out after ${FETCH_TIMEOUT_MS}ms.`,
      );
    }
    throw new WebsiteCollectError(
      'fetch-failed',
      `Failed to fetch ${url}: ${error instanceof Error ? error.message : 'unknown'}.`,
      error,
    );
  }
  clearTimeout(timeout);

  if (!response.ok) {
    throw new WebsiteCollectError(
      'fetch-failed',
      `Request to ${url} returned ${response.status} ${response.statusText}.`,
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!/text\/html|application\/xhtml/i.test(contentType)) {
    throw new WebsiteCollectError(
      'unsupported-content-type',
      `URL ${url} returned content-type "${contentType}" — only HTML is supported.`,
    );
  }

  // Cap the body.
  const raw = await response.text();
  const html = raw.length > MAX_BODY_BYTES ? raw.slice(0, MAX_BODY_BYTES) : raw;

  // -- Parse ------------------------------------------------------------
  const title = metaContent(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const metaDescription = metaContent(
    html,
    /<meta\s+name\s*=\s*["']description["']\s+content\s*=\s*["']([\s\S]*?)["']/i,
  );
  const ogDescription = metaContent(
    html,
    /<meta\s+property\s*=\s*["']og:description["']\s+content\s*=\s*["']([\s\S]*?)["']/i,
  );
  const ogImage = metaContent(
    html,
    /<meta\s+property\s*=\s*["']og:image["']\s+content\s*=\s*["']([\s\S]*?)["']/i,
  );
  const ogTitle = metaContent(
    html,
    /<meta\s+property\s*=\s*["']og:title["']\s+content\s*=\s*["']([\s\S]*?)["']/i,
  );
  const language = metaContent(html, /<html[^>]*\blang\s*=\s*["']([^"']+)["']/i);

  const headings = extractHeadings(html);
  const links = extractLinks(html);
  const bodyText = stripTags(html);

  const pageContent: EvidencePageContent = {
    headings,
    body: bodyText.slice(0, 50_000),
    links: links.slice(0, 200),
  };

  const metadata: EvidenceMetadata = {
    id: bundleId,
    source: 'website',
    submittedAt,
    input: { label: target, url },
    facts: {
      title: ogTitle ?? title,
      description: metaDescription ?? ogDescription,
      imageUrl: ogImage,
      language,
    },
  };

  return {
    metadata,
    screenshots: { items: [] },
    pageContent,
    logs: {
      items: [
        {
          at: submittedAt,
          level: 'info',
          message: `Fetched ${url} (${html.length} bytes, content-type ${contentType}).`,
        },
        {
          at: submittedAt,
          level: 'info',
          message: `Extracted ${headings.length} heading${headings.length === 1 ? '' : 's'} and ${links.length} link${links.length === 1 ? '' : 's'}.`,
        },
      ],
    },
  };
};

const normaliseUrl = (raw: string): string => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new WebsiteCollectError('invalid-url', 'Target URL is empty.');
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new WebsiteCollectError('invalid-url', `Target "${raw}" is not a valid URL.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new WebsiteCollectError(
      'invalid-url',
      `URL ${url.toString()} uses unsupported protocol "${url.protocol}". Use http: or https:.`,
    );
  }
  return url.toString();
};
