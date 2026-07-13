/**
 * features/zip-review/collect — ZIP / archive evidence collector
 *
 * Task 6.17 — Evidence Collector: ZIP.
 *
 * Fetches a ZIP archive (URL), extracts it in-memory with
 * `jszip`, and produces an `EvidenceBundle` for the reviewer
 * pipeline.
 *
 * What it captures
 *   - `files.fileTree`     — every blob path in the archive
 *   - `files.topLevel`     — root-level entries (files + dirs)
 *   - `files.readme`       — README / README.md content, when present
 *   - `files.license`      — LICENSE / LICENSE.md / COPYING, when present
 *   - `metadata.facts.title`       — `package.json` `name`, when present
 *   - `metadata.facts.description` — `package.json` `description`, when present
 *   - `metadata.facts.language`    — `package.json` `language`, when present
 *   - `metrics.extra.fileCount`    — total blob count
 *   - `screenshots.items`          — empty
 *   - `pageContent`                — not collected
 *   - `accessibility`              — not collected
 *
 * Constraints
 *   - The ZIP must be reachable by HTTP(S) from the running
 *     Vercel function. Local uploads are a future task.
 *   - The archive body is capped at 25 MB to keep the
 *     serverless function within memory.
 *   - File contents are read with a 200 KB per-file cap so a
 *     single huge file cannot blow up the bundle.
 *
 * Out of scope
 *   - Local uploads (multipart form data).
 *   - Non-ZIP archives (`.tar.gz`, `.7z`, etc.).
 */

import JSZip from 'jszip';
import type {
  EvidenceBundle,
  EvidenceFiles,
  EvidenceMetadata,
  EvidenceMetrics,
} from '@/types/evidence';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const FETCH_TIMEOUT_MS = 20_000;
const MAX_ARCHIVE_BYTES = 25_000_000; // 25 MB
const MAX_FILE_BYTES = 200_000; // 200 KB
const MAX_TREE_ENTRIES = 500;
const USER_AGENT = 'sonda-collector (+https://sonda-phi.vercel.app)';

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export class ZipCollectError extends Error {
  public readonly kind:
    'invalid-url' | 'fetch-failed' | 'timeout' | 'too-large' | 'parse-failed' | 'unknown';
  public override readonly cause?: unknown;

  constructor(kind: ZipCollectError['kind'], message: string, cause?: unknown) {
    super(message);
    this.name = 'ZipCollectError';
    this.kind = kind;
    this.cause = cause;
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const normaliseUrl = (raw: string): string => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new ZipCollectError('invalid-url', 'Target ZIP URL is empty.');
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ZipCollectError('invalid-url', `Target "${raw}" is not a valid URL.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ZipCollectError(
      'invalid-url',
      `URL ${url.toString()} uses unsupported protocol "${url.protocol}". Use http: or https:.`,
    );
  }
  return url.toString();
};

const isProbablyText = (bytes: Uint8Array): boolean => {
  // Heuristic: if the first 512 bytes contain a NUL byte, treat as binary.
  const limit = Math.min(512, bytes.length);
  for (let i = 0; i < limit; i++) {
    if (bytes[i] === 0) return false;
  }
  return true;
};

const readmeCandidates = [
  'README.md',
  'README.MD',
  'readme.md',
  'README',
  'README.txt',
  'README.rst',
  'Readme.md',
];

const licenseCandidates = [
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'LICENSE.MD',
  'License',
  'COPYING',
  'COPYING.md',
];

const topLevelName = (path: string): string => {
  const idx = path.indexOf('/');
  return idx === -1 ? path : path.slice(0, idx);
};

const isUnderTopLevel = (path: string): boolean => !path.includes('/');

const safeReadString = async (zip: JSZip, path: string): Promise<string | undefined> => {
  const entry = zip.file(path);
  if (!entry) return undefined;
  const bytes = await entry.async('uint8array');
  if (!isProbablyText(bytes)) return undefined;
  const slice = bytes.length > MAX_FILE_BYTES ? bytes.slice(0, MAX_FILE_BYTES) : bytes;
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(slice);
  } catch {
    return undefined;
  }
};

/**
 * Find the first existing path from a candidate list.
 */
const pickFirst = async (
  zip: JSZip,
  candidates: string[],
): Promise<{ path: string; content: string } | undefined> => {
  for (const candidate of candidates) {
    if (zip.file(candidate)) {
      const content = await safeReadString(zip, candidate);
      if (typeof content === 'string') {
        return { path: candidate, content };
      }
    }
  }
  return undefined;
};

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Collect evidence for a ZIP-archive review.
 *
 * @param target  the URL pointing to a `.zip` archive.
 * @returns the assembled `EvidenceBundle`.
 */
export const collectZipEvidence = async (
  target: string,
  submittedAt: string = new Date().toISOString(),
  bundleId: string = crypto.randomUUID(),
): Promise<EvidenceBundle> => {
  const url = normaliseUrl(target);

  // 1. Fetch the archive with a hard cap.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ZipCollectError('timeout', `Request to ${url} timed out.`);
    }
    throw new ZipCollectError(
      'fetch-failed',
      `Failed to fetch ${url}: ${error instanceof Error ? error.message : 'unknown'}.`,
      error,
    );
  }
  clearTimeout(timeout);

  if (!response.ok) {
    throw new ZipCollectError(
      'fetch-failed',
      `Request to ${url} returned ${response.status} ${response.statusText}.`,
    );
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_ARCHIVE_BYTES) {
    throw new ZipCollectError(
      'too-large',
      `Archive is ${buffer.byteLength} bytes; max supported is ${MAX_ARCHIVE_BYTES}.`,
    );
  }

  // 2. Parse.
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (error) {
    throw new ZipCollectError(
      'parse-failed',
      `Failed to parse ZIP archive: ${error instanceof Error ? error.message : 'unknown'}.`,
      error,
    );
  }

  // 3. Build the file tree (every blob path).
  const allPaths: string[] = [];
  zip.forEach((relativePath, entry) => {
    if (!entry.dir) allPaths.push(relativePath);
  });
  const fileTree = allPaths.slice(0, MAX_TREE_ENTRIES);
  const topLevel = Array.from(new Set(allPaths.map(topLevelName))).filter(isUnderTopLevel);

  // 4. README.
  const readme = await pickFirst(zip, readmeCandidates);

  // 5. License.
  const license = await pickFirst(zip, licenseCandidates);

  // 6. package.json metadata (if present at the root).
  let title: string | undefined;
  let description: string | undefined;
  let language: string | undefined;
  const pkgEntry = zip.file('package.json');
  if (pkgEntry) {
    const raw = await safeReadString(zip, 'package.json');
    if (raw) {
      try {
        const pkg = JSON.parse(raw) as Record<string, unknown>;
        if (typeof pkg['name'] === 'string') title = pkg['name'];
        if (typeof pkg['description'] === 'string') description = pkg['description'];
        if (typeof pkg['language'] === 'string') language = pkg['language'];
      } catch {
        // ignore parse errors in package.json
      }
    }
  }

  const files: EvidenceFiles = {
    fileTree,
    topLevel,
    readme: readme?.content,
    license: license?.content ?? license?.path,
  };

  const metrics: EvidenceMetrics = {
    extra: {
      fileCount: allPaths.length,
      archiveBytes: buffer.byteLength,
    },
  };

  const metadata: EvidenceMetadata = {
    id: bundleId,
    source: 'zip',
    submittedAt,
    input: { label: target, url },
    facts: {
      title,
      description,
      language,
    },
  };

  return {
    metadata,
    screenshots: { items: [] },
    files,
    metrics,
    logs: {
      items: [
        {
          at: submittedAt,
          level: 'info',
          message: `Fetched ${url} (${buffer.byteLength} bytes).`,
        },
        {
          at: submittedAt,
          level: 'info',
          message: `Extracted ${allPaths.length} file${allPaths.length === 1 ? '' : 's'}; tree capped at ${MAX_TREE_ENTRIES}.`,
        },
        {
          at: submittedAt,
          level: readme ? 'info' : 'warn',
          message: readme
            ? `README captured from ${readme.path} (${readme.content.length} chars).`
            : 'No README found in the archive.',
        },
      ],
    },
  };
};
