/**
 * app/review/zip/page.tsx — Local Project ZIP review form.
 *
 * Lets the user submit a public URL to a hosted ZIP file
 * (e.g. a GitHub release artifact, an S3 public link, a
 * deployment URL). The backend downloads + extracts the
 * archive in memory and runs the reviewer panel against
 * the file tree.
 *
 * This replaces the earlier drag-and-drop file picker
 * because Vercel serverless functions cap request bodies at
 * 4.5 MB and most real project ZIPs are far larger. A URL
 * intake is the only path that works at production scale.
 *
 * Design
 *  - Mirrors the website / github intake pages: back link
 *    → eyebrow / title / description → form card → info card.
 *  - Reuses the same Card, Input, and Button primitives.
 *
 * Accessibility
 *  - Wrapped in a semantic <main>.
 *  - The <form> is a real <form>; the URL field has an
 *    associated <label> and aria-describedby pointing at the
 *    helper text.
 *  - On submit we call event.preventDefault() and POST to
 *    the backend.
 *  - An aria-live region announces the in-flight state so
 *    screen readers hear the change.
 *
 * Out of scope
 *  - Direct file upload (Vercel body limit).
 *  - Resumable / chunked uploads.
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Boxes,
  FileArchive,
  FolderTree,
  Layers,
  Link as LinkIcon,
  Loader2,
  Rocket,
  ScrollText,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createReview } from '@/lib/review-api';

interface AnalysisItem {
  /** Short title shown in bold. */
  title: string;
  /** One-line description of what SONDA looks for. */
  description: string;
  /** Lucide icon component. Decorative (aria-hidden). */
  icon: LucideIcon;
}

const ANALYSIS_ITEMS: AnalysisItem[] = [
  {
    title: 'File tree',
    description: 'Top-level layout, naming, and discoverability of the project.',
    icon: FolderTree,
  },
  {
    title: 'README quality',
    description: 'Whether the front page sells the project to a first-time visitor.',
    icon: ScrollText,
  },
  {
    title: 'Dependencies',
    description: 'package.json (or equivalent) and the libraries the project pulls in.',
    icon: Boxes,
  },
  {
    title: 'Source structure',
    description: 'Folders, modules, and the signals of a maintainable codebase.',
    icon: Layers,
  },
  {
    title: 'Launch readiness',
    description: 'A single Ship / Refine / Hold decision backed by the evidence above.',
    icon: Rocket,
  },
];

const EXAMPLE_URL = 'https://example.com/my-project.zip';

const isLikelyZipUrl = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return /\.zip(\?.*)?$/i.test(url.pathname) || /\.zip(\?.*)?$/i.test(trimmed);
  } catch {
    return false;
  }
};

const ZipReviewPage: React.FC = () => {
  const router = useRouter();
  const [url, setUrl] = React.useState<string>('');
  const [submittedUrl, setSubmittedUrl] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const trimmed = url.trim();
  const isValid = isLikelyZipUrl(trimmed);
  const canSubmit = isValid && !isSubmitting;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmittedUrl(trimmed);
    const result = await createReview({ type: 'zip', target: trimmed });
    if (!result.ok) {
      setIsSubmitting(false);
      setSubmitError(result.message);
      return;
    }
    router.push(`/review/${result.id}`);
  };

  // Stable ids for aria wiring.
  const inputId = React.useId();
  const helperId = `${inputId}-helper`;
  const titleId = React.useId();
  const liveRegionId = React.useId();

  return (
    <main className="relative w-full bg-background px-6 py-20 text-text-primary sm:py-24">
      <div className="mx-auto w-full max-w-3xl">
        {/* Back link */}
        <div className="mb-8">
          <Button aria-label="Back to review setup" asChild={true} size="sm" variant="ghost">
            <Link href="/review">
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              <span>Back to review setup</span>
            </Link>
          </Button>
        </div>

        {/* Page header — same pattern as the other review pages. */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-display text-caption font-semibold uppercase tracking-widest text-text-secondary">
            Local project
          </p>
          <h1
            className="mt-3 font-display text-h1 font-semibold leading-tight tracking-tight sm:text-display"
            id={titleId}
          >
            Review a Local Project
          </h1>
          <p className="mt-4 text-body leading-relaxed text-text-secondary sm:text-lg">
            Point SONDA at a hosted ZIP and let the jury inspect your project structure.
          </p>
        </div>

        {/* Form card */}
        <Card className="mt-12">
          <CardHeader>
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary-soft text-primary"
              >
                <FileArchive className="h-5 w-5" strokeWidth={2} />
              </span>
              <span
                aria-hidden="true"
                className="font-display text-caption font-semibold uppercase tracking-widest text-text-muted"
              >
                Step 1 · Submit ZIP URL
              </span>
            </div>
            <CardTitle as="h2" className="mt-4 text-h4">
              Project ZIP URL
            </CardTitle>
            <CardDescription className="text-body leading-relaxed text-text-secondary">
              Paste the URL of a hosted ZIP file — a GitHub release artifact, an S3 public link, or
              any other reachable <span className="font-mono">.zip</span>. SONDA will download,
              extract, and review the project as the only source of truth.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              noValidate
              aria-labelledby={titleId}
              className="flex flex-col gap-4"
              onSubmit={handleSubmit}
            >
              <div className="flex flex-col gap-2">
                <label
                  className="font-display text-caption font-semibold text-text-primary"
                  htmlFor={inputId}
                >
                  ZIP URL
                </label>
                <Input
                  autoFocus
                  aria-describedby={helperId}
                  aria-invalid={trimmed.length > 0 && !isValid ? true : undefined}
                  autoComplete="url"
                  id={inputId}
                  inputMode="url"
                  invalid={trimmed.length > 0 && !isValid}
                  name="url"
                  placeholder={EXAMPLE_URL}
                  size="lg"
                  spellCheck={false}
                  type="url"
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    if (submittedUrl) setSubmittedUrl(null);
                    if (submitError) setSubmitError(null);
                  }}
                />
                <p className="text-caption text-text-muted" id={helperId}>
                  The URL must be reachable by SONDA and end in{' '}
                  <span className="font-mono">.zip</span>. Public links only — gated archives are
                  handled by the Private Website option.
                </p>
              </div>

              <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-caption text-text-muted">
                  You can review and adjust the URL before SONDA starts.
                </p>
                <Button
                  aria-label="Start SONDA investigation"
                  className="w-full sm:w-auto"
                  disabled={!canSubmit}
                  size="lg"
                  type="submit"
                  variant="primary"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                      Starting investigation…
                    </>
                  ) : (
                    <>
                      Start Investigation
                      <ArrowRight aria-hidden="true" className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Submit error */}
        {submitError ? (
          <div
            aria-live="assertive"
            className="mt-6 flex items-start gap-3 rounded-md border border-error/30 bg-error/5 p-4 text-caption text-text-primary"
            role="alert"
          >
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-error" />
            <p>
              <span className="font-semibold">Could not start the review.</span> {submitError}
            </p>
          </div>
        ) : null}

        {/* In-flight state */}
        <div aria-live="polite" className="sr-only" id={liveRegionId} role="status">
          {submittedUrl
            ? isSubmitting
              ? `Investigation started for ${submittedUrl}. Redirecting…`
              : `Investigation completed for ${submittedUrl}.`
            : ''}
        </div>
        {submittedUrl && !submitError && isSubmitting ? (
          <div
            aria-hidden="false"
            className="mt-6 flex items-start gap-3 rounded-md border border-primary/30 bg-primary-soft/60 p-4 text-caption text-text-primary"
            role="status"
          >
            <Loader2
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary"
            />
            <p>
              <span className="font-semibold">Investigation in progress.</span> SONDA is downloading
              and unpacking <span className="break-all font-mono">{submittedUrl}</span>. You will be
              redirected to the verdict in a moment.
            </p>
          </div>
        ) : null}

        {/* Info card — what SONDA will analyze. */}
        <Card className="mt-8" noHover={true}>
          <CardHeader>
            <CardTitle as="h2" className="text-h5">
              What SONDA will analyze
            </CardTitle>
            <CardDescription className="text-body leading-relaxed text-text-secondary">
              The jury scores your project against five focused dimensions before returning a single
              launch verdict.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul aria-label="Analysis dimensions" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {ANALYSIS_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <li
                    key={item.title}
                    className="flex items-start gap-3 rounded-md border border-border/60 bg-background/40 p-3"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary"
                    >
                      <Icon className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="font-display text-caption font-semibold text-text-primary">
                        {item.title}
                      </span>
                      <span className="mt-0.5 text-caption leading-snug text-text-secondary">
                        {item.description}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-6 flex items-start gap-2 rounded-md border border-border/60 bg-background/40 p-3 text-caption text-text-secondary">
              <LinkIcon aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                The URL must be reachable. SONDA fetches the archive in memory (up to 25 MB today)
                and never writes it to disk.
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default ZipReviewPage;
