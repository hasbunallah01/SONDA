/**
 * features/github-review/collect — GitHub Repository evidence collector
 *
 * Task 6.16 — Evidence Collector: GitHub.
 *
 * Fetches a public GitHub repository and produces an
 * `EvidenceBundle` for the reviewer pipeline. The collector
 * uses the unauthenticated GitHub REST API (rate limit: 60
 * requests / hour / IP — fine for a hackathon MVP).
 *
 * What it captures
 *   - `metadata.facts.title`       — `full_name` + `description`
 *   - `metadata.facts.description` — `description`
 *   - `metadata.facts.language`    — primary language from /languages
 *   - `metadata.facts.imageUrl`    — `owner.avatar_url`
 *   - `files.fileTree`             — top-level entries + a sample
 *                                    of the recursive tree (capped)
 *   - `files.topLevel`             — root-level entries only
 *   - `files.readme`               — decoded README content
 *   - `files.license`              — license SPDX id (when present)
 *   - `metrics.stars`              — `stargazers_count`
 *   - `metrics.extra.forks`        — `forks_count`
 *   - `metrics.extra.openIssues`   — `open_issues_count`
 *   - `screenshots.items`          — empty (no browser here)
 *   - `pageContent`                — not collected
 *   - `accessibility`              — not collected
 *
 * Out of scope
 *   - Authenticated requests (use the `GITHUB_TOKEN` env var when
 *     present; the collector already supports it).
 *   - Issue / PR analysis.
 *   - Source-file content (only tree + README by default).
 */

import type {
  EvidenceBundle,
  EvidenceFiles,
  EvidenceMetadata,
  EvidenceMetrics,
} from '@/types/evidence';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const FETCH_TIMEOUT_MS = 15_000;
const MAX_TREE_ENTRIES = 500;
const MAX_README_BYTES = 200_000; // 200 KB
const USER_AGENT = 'sonda-collector (+https://sonda-phi.vercel.app)';

const GITHUB_API = 'https://api.github.com';

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export class GithubCollectError extends Error {
  public readonly kind:
    'invalid-url' | 'fetch-failed' | 'timeout' | 'not-found' | 'rate-limited' | 'unknown';
  public override readonly cause?: unknown;

  constructor(kind: GithubCollectError['kind'], message: string, cause?: unknown) {
    super(message);
    this.name = 'GithubCollectError';
    this.kind = kind;
    this.cause = cause;
  }
}

/* -------------------------------------------------------------------------- */
/* GitHub API helpers                                                         */
/* -------------------------------------------------------------------------- */

const authHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = process.env['GITHUB_TOKEN'];
  if (token && token.length > 0) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

const fetchJson = async <T>(url: string): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: authHeaders(),
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new GithubCollectError('timeout', `GitHub request to ${url} timed out.`);
    }
    throw new GithubCollectError(
      'fetch-failed',
      `Failed to fetch ${url}: ${error instanceof Error ? error.message : 'unknown'}.`,
      error,
    );
  }
  clearTimeout(timeout);

  if (response.status === 404) {
    throw new GithubCollectError('not-found', `GitHub returned 404 for ${url}.`);
  }
  if (response.status === 403 || response.status === 429) {
    throw new GithubCollectError(
      'rate-limited',
      `GitHub rate-limited the request to ${url} (status ${response.status}).`,
    );
  }
  if (!response.ok) {
    throw new GithubCollectError(
      'fetch-failed',
      `GitHub request to ${url} returned ${response.status} ${response.statusText}.`,
    );
  }
  return (await response.json()) as T;
};

const fetchText = async (url: string): Promise<string> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: authHeaders(),
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new GithubCollectError('timeout', `GitHub text request to ${url} timed out.`);
    }
    throw new GithubCollectError(
      'fetch-failed',
      `Failed to fetch ${url}: ${error instanceof Error ? error.message : 'unknown'}.`,
      error,
    );
  }
  clearTimeout(timeout);

  if (!response.ok) {
    // For README we tolerate 404 (repo has no README) and other
    // errors — they will surface as `readme: undefined`.
    return '';
  }
  const text = await response.text();
  return text.length > MAX_README_BYTES ? text.slice(0, MAX_README_BYTES) : text;
};

const fromBase64 = (raw: string): string => {
  try {
    return Buffer.from(raw, 'base64').toString('utf-8');
  } catch {
    return '';
  }
};

/* -------------------------------------------------------------------------- */
/* URL parsing                                                                */
/* -------------------------------------------------------------------------- */

const parseRepoUrl = (raw: string): { owner: string; repo: string; canonical: string } => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new GithubCollectError('invalid-url', 'Target repository URL is empty.');
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    // Maybe `owner/repo` shorthand.
    const m = trimmed.match(/^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
    if (m && m[1] && m[2]) {
      return {
        owner: m[1],
        repo: m[2],
        canonical: `https://github.com/${m[1]}/${m[2]}`,
      };
    }
    throw new GithubCollectError('invalid-url', `Target "${raw}" is not a valid GitHub URL.`);
  }
  if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') {
    throw new GithubCollectError('invalid-url', `URL ${url.toString()} is not a github.com URL.`);
  }
  const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    throw new GithubCollectError(
      'invalid-url',
      `URL ${url.toString()} does not contain a repository.`,
    );
  }
  return {
    owner: parts[0],
    repo: parts[1].replace(/\.git$/, ''),
    canonical: `https://github.com/${parts[0]}/${parts[1].replace(/\.git$/, '')}`,
  };
};

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

type RepoResponse = {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  default_branch: string;
  language: string | null;
  license: { spdx_id: string | null } | null;
  owner: { avatar_url: string };
  topics?: string[];
};

type ContentsResponse = Array<{
  name: string;
  path: string;
  type: 'file' | 'dir';
  size?: number;
}>;

type TreeResponse = {
  tree: Array<{ path: string; type: 'blob' | 'tree' }>;
  truncated: boolean;
};

type LanguagesResponse = Record<string, number>;

type ReadmeResponse = {
  content: string; // base64
  encoding: 'base64';
  name: string;
  path: string;
};

/**
 * Collect evidence for a GitHub repository review.
 */
export const collectGithubEvidence = async (
  target: string,
  submittedAt: string = new Date().toISOString(),
  bundleId: string = crypto.randomUUID(),
): Promise<EvidenceBundle> => {
  const { owner, repo, canonical } = parseRepoUrl(target);
  const apiBase = `${GITHUB_API}/repos/${owner}/${repo}`;

  // 1. Repo metadata.
  const repoMeta = await fetchJson<RepoResponse>(apiBase);

  // 2. Top-level contents.
  let topLevel: string[] = [];
  try {
    const top = await fetchJson<ContentsResponse>(`${apiBase}/contents/`);
    topLevel = top.map((entry) => entry.name);
  } catch {
    topLevel = [];
  }

  // 3. Recursive tree (truncated by GitHub for large repos).
  let fileTree: string[] = [];
  try {
    const tree = await fetchJson<TreeResponse>(
      `${apiBase}/git/trees/${repoMeta.default_branch}?recursive=1`,
    );
    fileTree = tree.tree
      .filter((entry) => entry.type === 'blob')
      .map((entry) => entry.path)
      .slice(0, MAX_TREE_ENTRIES);
  } catch {
    fileTree = [];
  }

  // 4. Languages.
  let languages: LanguagesResponse = {};
  try {
    languages = await fetchJson<LanguagesResponse>(`${apiBase}/languages`);
  } catch {
    languages = {};
  }

  // 5. README.
  let readme: string | undefined;
  try {
    const readmeMeta = await fetchJson<ReadmeResponse>(`${apiBase}/readme`);
    if (readmeMeta.encoding === 'base64' && readmeMeta.content) {
      readme = fromBase64(readmeMeta.content);
    }
  } catch {
    readme = undefined;
  }

  // -- Assemble ---------------------------------------------------------
  const primaryLanguage =
    repoMeta.language ?? Object.entries(languages).sort((a, b) => b[1] - a[1])[0]?.[0] ?? undefined;

  const files: EvidenceFiles = {
    fileTree,
    topLevel,
    readme,
    license: repoMeta.license?.spdx_id ?? undefined,
  };

  const metrics: EvidenceMetrics = {
    stars: repoMeta.stargazers_count,
    extra: {
      forks: repoMeta.forks_count,
      openIssues: repoMeta.open_issues_count,
      defaultBranch: repoMeta.default_branch,
      languageCount: Object.keys(languages).length,
    },
  };

  const metadata: EvidenceMetadata = {
    id: bundleId,
    source: 'github',
    submittedAt,
    input: { label: canonical, url: canonical },
    facts: {
      title: repoMeta.full_name,
      description: repoMeta.description ?? undefined,
      language: primaryLanguage,
      imageUrl: repoMeta.owner.avatar_url,
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
          message: `Fetched GitHub repo ${owner}/${repo} (${repoMeta.stargazers_count} stars, ${fileTree.length} file${fileTree.length === 1 ? '' : 's'} in tree).`,
        },
        {
          at: submittedAt,
          level: readme ? 'info' : 'warn',
          message: readme
            ? `README captured (${readme.length} chars).`
            : 'No README captured for this repository.',
        },
      ],
    },
  };
};
