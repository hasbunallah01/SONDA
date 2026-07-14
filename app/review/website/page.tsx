/**
 * app/review/website/page.tsx — Public Website review form.
 *
 * The reference's "Review a Public Website" screen: back link, two-line
 * indigo title, a compact form card (Website URL + Review Goal + Start
 * Investigation) with a decorative illustration beside it, and the
 * "What SONDA will analyze" list preserved below.
 *
 * While the (synchronous) POST runs, the page swaps to the animated
 * "Investigating your product…" panel so the jury feels alive, then
 * routes to /review/:id when the verdict lands.
 *
 * Functional behaviour — validation, normalization, the createReview
 * call, error handling, and redirect — is unchanged.
 */

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ReviewFormLayout } from '@/components/review/form-layout';
import { InvestigationProgress } from '@/components/review/investigation-progress';
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

/** Presentational only — the goal frames the investigation for the user. */
const REVIEW_GOALS = [
  'Launch Readiness',
  'UX Deep Dive',
  'Marketing & Positioning',
  'Investor Readiness',
] as const;

const EXAMPLE_URL = 'https://your-product.com';

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
  const [goal, setGoal] = React.useState<string>(REVIEW_GOALS[0]);
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
    // Pipeline ran synchronously. Either way (COMPLETED or FAILED) the
    // results page is the right destination — it renders the verdict
    // when ready and the failure state when not.
    router.push(`/review/${result.id}`);
  };

  // Stable ids for aria-describedby / aria-labelledby wiring.
  const inputId = React.useId();
  const helperId = `${inputId}-helper`;
  const goalId = React.useId();
  const titleId = React.useId();
  const liveRegionId = React.useId();

  /* Investigation screen — shown while the synchronous POST runs. */
  if (isSubmitting && submittedUrl) {
    return (
      <main className="relative w-full bg-background px-5 py-12 text-text-primary sm:px-8 sm:py-16">
        <div className="mx-auto w-full max-w-3xl">
          <InvestigationProgress source="website" target={submittedUrl} />
        </div>
        <div aria-live="polite" className="sr-only" id={liveRegionId} role="status">
          {`Investigation started for ${submittedUrl}. Redirecting when the verdict is ready.`}
        </div>
      </main>
    );
  }

  return (
    <ReviewFormLayout illustrationIcon={Globe} titleId={titleId} titleSubject="Public Website">
      <form
        noValidate
        aria-labelledby={titleId}
        className="flex flex-col gap-5"
        onSubmit={handleSubmit}
      >
        {/* Website URL */}
        <div className="flex flex-col gap-2">
          <label className="text-caption font-semibold text-text-primary" htmlFor={inputId}>
            Website URL
          </label>
          <div className="relative">
            <Globe
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            />
            <Input
              autoFocus
              aria-describedby={helperId}
              aria-invalid={trimmed.length > 0 && !isValid ? true : undefined}
              autoComplete="url"
              className="pl-10"
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
          </div>
          <p className="text-caption text-text-muted" id={helperId}>
            Public pages only — gated content is handled by the Private Website option.
          </p>
        </div>

        {/* Review goal */}
        <div className="flex flex-col gap-2">
          <label className="text-caption font-semibold text-text-primary" htmlFor={goalId}>
            Review Goal
          </label>
          <Select value={goal} onValueChange={setGoal}>
            <SelectTrigger aria-label="Review goal" id={goalId} size="lg">
              <SelectValue placeholder="Launch Readiness" />
            </SelectTrigger>
            <SelectContent>
              {REVIEW_GOALS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Submit */}
        <Button
          aria-label="Start SONDA investigation"
          className="mt-1 w-full"
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

        <p className="text-caption leading-relaxed text-text-muted">
          SONDA will explore your product like real users and deliver an expert launch verdict.
        </p>
      </form>

      {/* Submit error */}
      {submitError ? (
        <div
          aria-live="assertive"
          className="mt-6 flex items-start gap-3 rounded-xl border border-error/30 bg-error/5 p-4 text-caption text-text-primary"
          role="alert"
        >
          <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-error" />
          <p>
            <span className="font-semibold">Could not start the review.</span> {submitError}
          </p>
        </div>
      ) : null}

      {/* What SONDA will analyze */}
      <section aria-label="What SONDA will analyze" className="mt-12">
        <h2 className="font-display text-caption font-semibold uppercase tracking-widest text-text-muted">
          What SONDA will analyze
        </h2>
        <ul className="mt-4 flex flex-col gap-3">
          {ANALYSIS_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.title} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"
                >
                  <Icon className="h-4 w-4" strokeWidth={2} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-caption font-semibold text-text-primary">{item.title}</span>
                  <span className="mt-0.5 text-caption leading-snug text-text-muted">
                    {item.description}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </ReviewFormLayout>
  );
};

export default WebsiteReviewPage;
