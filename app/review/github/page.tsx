/**
 * app/review/github/page.tsx — GitHub Repository review form.
 *
 * Same layout family as the Public Website intake (reference screen 2):
 * back link, two-line indigo title, compact form card + decorative
 * illustration, analysis list below. While the synchronous POST runs the
 * page swaps to the animated investigation panel.
 *
 * Functional behaviour — validation, the createReview call, error
 * handling, and redirect — is unchanged.
 */

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Github,
  Layers,
  Loader2,
  Rocket,
  TreePine,
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
  title: string;
  description: string;
  icon: LucideIcon;
}

const ANALYSIS_ITEMS: AnalysisItem[] = [
  {
    title: 'Repository structure',
    description: 'Folder layout, top-level boundaries, and how discoverable the code is.',
    icon: TreePine,
  },
  {
    title: 'README quality',
    description: 'Whether the front page sells the project to a first-time visitor.',
    icon: BookOpen,
  },
  {
    title: 'Documentation',
    description: 'Inline docs, contributor guides, and the path from clone to running.',
    icon: Layers,
  },
  {
    title: 'Project organization',
    description: 'Naming, grouping, and consistency across the codebase.',
    icon: Layers,
  },
  {
    title: 'Architecture quality',
    description: 'Boundaries, abstractions, and the signals of a maintainable system.',
    icon: TreePine,
  },
  {
    title: 'Startup readiness',
    description: 'A single Ship / Refine / Hold decision backed by the evidence above.',
    icon: Rocket,
  },
];

/** Presentational only — frames the investigation for the user. */
const REVIEW_GOALS = [
  'Launch Readiness',
  'Code Quality Deep Dive',
  'Docs & Onboarding',
  'Investor Readiness',
] as const;

const EXAMPLE_URL = 'https://github.com/user/project';

// Match a github.com (or www.github.com) URL pointing at /<owner>/<repo>.
// We deliberately stop at the owner/repo segment so query params, tree
// paths, and trailing slashes are accepted but ignored.
const GITHUB_REPO_PATTERN = /^https?:\/\/(www\.)?github\.com\/[\w.-]+\/[\w.-]+(?:\/.*)?\/?$/i;

const isLikelyGitHubRepoUrl = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  return GITHUB_REPO_PATTERN.test(trimmed);
};

const GithubReviewPage: React.FC = () => {
  const router = useRouter();
  const [url, setUrl] = React.useState<string>('');
  const [goal, setGoal] = React.useState<string>(REVIEW_GOALS[0]);
  const [submittedUrl, setSubmittedUrl] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const trimmed = url.trim();
  const isValid = isLikelyGitHubRepoUrl(trimmed);
  const canSubmit = isValid && !isSubmitting;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmittedUrl(trimmed);
    const result = await createReview({ type: 'github', target: trimmed });
    if (!result.ok) {
      setIsSubmitting(false);
      setSubmitError(result.message);
      return;
    }
    router.push(`/review/${result.id}`);
  };

  // Stable ids for aria-describedby / aria-labelledby wiring.
  const inputId = React.useId();
  const helperId = `${inputId}-helper`;
  const goalId = React.useId();
  const titleId = React.useId();

  /* Investigation screen — shown while the synchronous POST runs. */
  if (isSubmitting && submittedUrl) {
    return (
      <main className="relative w-full bg-background px-5 py-12 text-text-primary sm:px-8 sm:py-16">
        <div className="mx-auto w-full max-w-3xl">
          <InvestigationProgress source="github" target={submittedUrl} />
        </div>
      </main>
    );
  }

  return (
    <ReviewFormLayout illustrationIcon={Github} titleId={titleId} titleSubject="GitHub Repository">
      <form
        noValidate
        aria-labelledby={titleId}
        className="flex flex-col gap-5"
        onSubmit={handleSubmit}
      >
        {/* Repository URL */}
        <div className="flex flex-col gap-2">
          <label className="text-caption font-semibold text-text-primary" htmlFor={inputId}>
            Repository URL
          </label>
          <div className="relative">
            <Github
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
            Public repositories only — paste the full{' '}
            <span className="font-mono">github.com/owner/repo</span> URL.
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
          SONDA will inspect your codebase like an expert reviewer and deliver a launch verdict.
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

export default GithubReviewPage;
