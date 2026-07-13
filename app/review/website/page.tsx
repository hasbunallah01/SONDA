/**
 * app/review/website/page.tsx — Public Website review form (frontend only).
 *
 * The first concrete step in the SONDA flow: ask the user for a public
 * website URL and (in this static build) acknowledge the submission
 * client-side. No API call is made — selecting a review type and
 * submitting a URL is intentionally a no-op until later tasks wire up
 * the backend and the review engine.
 *
 * Layout
 *  - Centered max-w container with the same eyebrow / title / description
 *    header used on the landing sections, so the page feels native.
 *  - Two stacked cards: a form card on top, a small "what SONDA
 *    analyzes" info card below it. Same Card primitive, same surface.
 *
 * Design
 *  - Premium minimal: hairline borders, surface-elevated background,
 *    single primary CTA, no fake progress or animations.
 *  - The form uses the existing Input primitive and a primary Button
 *    sized to match the field on mobile (full width) and to sit inline
 *    on larger screens.
 *
 * Accessibility
 *  - Wrapped in a semantic <main>.
 *  - The <form> is a real <form>; the URL field has an associated
 *    <label> and an aria-describedby pointing at the helper text.
 *  - On submit we call event.preventDefault() to keep this static.
 *  - An aria-live region announces the local "investigation queued"
 *    message so screen readers hear the change.
 *
 * Out of scope (per task)
 *  - No API calls, no backend, no Playwright, no real scanning.
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Globe,
  Loader2,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

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
    title: 'User experience',
    description: 'How a first-time visitor actually moves through the product.',
    icon: Sparkles,
  },
  {
    title: 'Technical issues',
    description: 'Broken flows, missing states, performance red flags, and rough edges.',
    icon: Wrench,
  },
  {
    title: 'Accessibility',
    description: 'Keyboard reach, contrast, semantics, and inclusive design basics.',
    icon: ShieldCheck,
  },
  {
    title: 'Marketing clarity',
    description: 'Whether the story, positioning, and hook are doing real work.',
    icon: Globe,
  },
  {
    title: 'Launch readiness',
    description: 'A single Ship / Refine / Hold decision backed by the evidence above.',
    icon: CheckCircle2,
  },
];

const EXAMPLE_URL = 'https://example.com';

const isLikelyUrl = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  // Permit either a bare domain (example.com) or a fully qualified URL.
  const pattern = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/.*)?$/i;
  return pattern.test(trimmed);
};

const normalizeUrl = (value: string): string => {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const WebsiteReviewPage: React.FC = () => {
  const router = useRouter();
  const [url, setUrl] = React.useState<string>('');
  const [submittedUrl, setSubmittedUrl] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const trimmed = url.trim();
  const isValid = isLikelyUrl(trimmed);
  const canSubmit = isValid && !isSubmitting;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!isValid || isSubmitting) return;
    const normalized = normalizeUrl(trimmed);
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmittedUrl(normalized);
    const result = await createReview({ type: 'website', target: normalized });
    if (!result.ok) {
      setIsSubmitting(false);
      setSubmitError(result.message);
      return;
    }
    // Pipeline ran synchronously. Either way (COMPLETED or
    // FAILED) the results page is the right destination — it
    // renders the verdict when ready and the failure state
    // when not.
    router.push(`/review/${result.id}`);
  };

  // Stable id for aria-describedby / aria-labelledby wiring.
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

        {/* Page header — same pattern as the landing sections. */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-display text-caption font-semibold uppercase tracking-widest text-text-secondary">
            Public website
          </p>
          <h1
            className="mt-3 font-display text-h1 font-semibold leading-tight tracking-tight sm:text-display"
            id={titleId}
          >
            Review a Public Website
          </h1>
          <p className="mt-4 text-body leading-relaxed text-text-secondary sm:text-lg">
            Give SONDA a website to explore before your users do.
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
                <Globe className="h-5 w-5" strokeWidth={2} />
              </span>
              <span
                aria-hidden="true"
                className="font-display text-caption font-semibold uppercase tracking-widest text-text-muted"
              >
                Step 1 · Submit URL
              </span>
            </div>
            <CardTitle as="h2" className="mt-4 text-h4">
              Website URL
            </CardTitle>
            <CardDescription className="text-body leading-relaxed text-text-secondary">
              SONDA will navigate the URL like a first-time visitor and collect evidence from every
              reachable page.
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
                  Website URL
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
                  }}
                />
                <p className="text-caption text-text-muted" id={helperId}>
                  Paste a full URL including <span className="font-mono">https://</span>. Public
                  pages only — gated content is handled by the Private Website option.
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

        {/* Local acknowledgement — silent until the user submits. */}
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
              <span className="font-semibold">Investigation in progress.</span> SONDA is exploring{' '}
              <span className="break-all font-mono">{submittedUrl}</span>. You will be redirected to
              the verdict in a moment.
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
              The jury scores your product against five focused dimensions before returning a single
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
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default WebsiteReviewPage;
