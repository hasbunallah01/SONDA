/**
 * types/evidence — The contract every source must satisfy.
 *
 * The whole point of SONDA's architecture is that *every* review source
 * (public website, GitHub repo, ZIP, private site) ultimately produces
 * a normalized `EvidenceBundle` that the reviewer agents consume.
 *
 * Adding a new source = implementing a new collector that produces one
 * of these bundle variants. Nothing else in the pipeline needs to change.
 */

export type ReviewSource = 'website' | 'github' | 'zip' | 'private';

export type EvidenceBundleBase = {
  id: string;
  source: ReviewSource;
  submittedAt: string; // ISO
  input: {
    label: string; // human-readable, e.g. "https://example.com"
    url?: string;
  };
  meta: {
    title?: string;
    description?: string;
    language?: string;
    imageUrl?: string;
  };
};

export type WebsiteEvidenceBundle = EvidenceBundleBase & {
  source: 'website';
  data: {
    screenshots: string[];
    lighthouse?: Record<string, unknown>;
    accessibility?: Record<string, unknown>;
    content?: {
      headings: string[];
      body: string;
      links: { href: string; text: string }[];
    };
  };
};

export type GithubEvidenceBundle = EvidenceBundleBase & {
  source: 'github';
  data: {
    owner: string;
    repo: string;
    stars?: number;
    languageStats?: Record<string, number>;
    fileTree?: string[];
    readme?: string;
    license?: string;
  };
};

export type ZipEvidenceBundle = EvidenceBundleBase & {
  source: 'zip';
  data: {
    filename: string;
    sizeBytes: number;
    fileCount: number;
    detectedFrameworks: string[];
    topLevel: string[];
    hasReadme: boolean;
    hasLicense: boolean;
  };
};

export type PrivateEvidenceBundle = EvidenceBundleBase & {
  source: 'private';
  data: {
    // Same shape as WebsiteEvidenceBundle['data'] after authentication.
    screenshots: string[];
    lighthouse?: Record<string, unknown>;
    accessibility?: Record<string, unknown>;
    content?: {
      headings: string[];
      body: string;
      links: { href: string; text: string }[];
    };
  };
};

export type EvidenceBundle =
  WebsiteEvidenceBundle | GithubEvidenceBundle | ZipEvidenceBundle | PrivateEvidenceBundle;
