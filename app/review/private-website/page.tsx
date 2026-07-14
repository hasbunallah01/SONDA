/**
 * app/review/private-website/page.tsx — Private Website review form.
 *
 * Same layout family as the other intakes (reference screen 2): back
 * link, two-line indigo title, form column + decorative illustration,
 * analysis list below. Credentials fields (username, password, optional
 * 2FA and notes) are preserved exactly. While the synchronous POST runs
 * the page swaps to the animated investigation panel.
 *
 * Functional behaviour — validation, the createReview call (target +
 * credentials + optional 2FA / notes), error handling, and redirect —
 * is unchanged. Credentials are only forwarded to the evidence
 * collector and never written to the session row.
 */

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Loader2, Lock, LogIn, Map, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ReviewFormLayout } from '@/components/review/form-layout';
import { InvestigationProgress } from '@/components/review/investigation-progress';
import { createReview } from '@/lib/review-api';

interface AnalysisItem {
  /** Short title shown in bold. */
  title: string;
  /** One-line description of what SONDA will look for. */
  description: string;
  /** Lucide icon component. Decorative (aria-hidden). */
  icon: LucideIcon;
}

const ANALYSIS_ITEMS: AnalysisItem[] = [
  {
    title: 'Authenticated browser sessions',
    description: 'Sign in once, then navigate as a real user — across every page behind the gate.',
    icon: ShieldCheck,
  },
  {
    title: 'Login flow testing',
    description: 'Watch what the form, captcha, and 2FA steps actually do to a first-time login.',
    icon: LogIn,
  },
  {
    title: 'Private application review',
    description: 'Review authenticated product surfaces, dashboards, and member-only journeys.',
    icon: Lock,
  },
  {
    title: 'User journey analysis',
    description: 'Map the path from login to core action and score it for clarity and friction.',
    icon: Map,
  },
];

const EXAMPLE_URL = 'https://staging.example.com';
const EXAMPLE_USERNAME = 'reviewer@yourteam.com';
const EXAMPLE_2FA = '123 456';
const EXAMPLE_NOTES =
  'Staging account with read-only access. Avoid checkout, profile changes, or any destructive action.';

const isLikelyUrl = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  // Permit either a bare domain (example.com) or a fully qualified URL.
  const pattern = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/.*)?$/i;
  return pattern.test(trimmed);
};

const PrivateWebsiteReviewPage: React.FC = () => {
  const router = useRouter();
  const [url, setUrl] = React.useState<string>('');
  const [username, setUsername] = React.useState<string>('');
  const [password, setPassword] = React.useState<string>('');
  const [twoFactor, setTwoFactor] = React.useState<string>('');
  const [notes, setNotes] = React.useState<string>('');
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // Non-empty is the only check we do — never validate password
  // rules, never log, never echo the values back.
  const urlTrimmed = url.trim();
  const usernameTrimmed = username.trim();
  const passwordTrimmed = password.trim();
  const isValid =
    isLikelyUrl(urlTrimmed) && usernameTrimmed.length > 0 && passwordTrimmed.length > 0;
  const canSubmit = isValid && !isSubmitting;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    const result = await createReview({
      type: 'private',
      target: urlTrimmed,
      username: usernameTrimmed,
      password: passwordTrimmed,
      twoFactorCode: twoFactor.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    if (!result.ok) {
      setIsSubmitting(false);
      setSubmitError(result.message);
      return;
    }
    router.push(`/review/${result.id}`);
  };

  // Stable ids for aria-describedby / aria-labelledby wiring.
  const urlId = React.useId();
  const urlHelperId = `${urlId}-helper`;
  const usernameId = React.useId();
  const usernameHelperId = `${usernameId}-helper`;
  const passwordId = React.useId();
  const passwordHelperId = `${passwordId}-helper`;
  const twoFactorId = React.useId();
  const twoFactorHelperId = `${twoFactorId}-helper`;
  const notesId = React.useId();
  const notesHelperId = `${notesId}-helper`;
  const titleId = React.useId();
  const liveRegionId = React.useId();

  /* Investigation screen — shown while the synchronous POST runs. */
  if (isSubmitting) {
    return (
      <main className="relative w-full bg-background px-5 py-12 text-text-primary sm:px-8 sm:py-16">
        <div className="mx-auto w-full max-w-3xl">
          <InvestigationProgress source="private-website" target={urlTrimmed} />
        </div>
        <div aria-live="polite" className="sr-only" id={liveRegionId} role="status">
          Investigation started. Redirecting when the verdict is ready.
        </div>
      </main>
    );
  }

  return (
    <ReviewFormLayout illustrationIcon={Lock} titleId={titleId} titleSubject="Private Website">
      <form
        noValidate
        aria-labelledby={titleId}
        className="flex flex-col gap-5"
        onSubmit={handleSubmit}
      >
        {/* Website URL */}
        <div className="flex flex-col gap-2">
          <label className="text-caption font-semibold text-text-primary" htmlFor={urlId}>
            Website URL
          </label>
          <div className="relative">
            <Lock
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            />
            <Input
              autoFocus
              aria-describedby={urlHelperId}
              aria-invalid={urlTrimmed.length > 0 && !isLikelyUrl(urlTrimmed) ? true : undefined}
              autoComplete="url"
              className="pl-10"
              id={urlId}
              inputMode="url"
              invalid={urlTrimmed.length > 0 && !isLikelyUrl(urlTrimmed)}
              name="url"
              placeholder={EXAMPLE_URL}
              size="lg"
              spellCheck={false}
              type="url"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                if (submitError) setSubmitError(null);
              }}
            />
          </div>
          <p className="text-caption text-text-muted" id={urlHelperId}>
            Paste the staging or private URL — including <span className="font-mono">https://</span>
            . Public pages should use the standard Website option instead.
          </p>
        </div>

        {/* Username */}
        <div className="flex flex-col gap-2">
          <label className="text-caption font-semibold text-text-primary" htmlFor={usernameId}>
            Username
          </label>
          <Input
            aria-describedby={usernameHelperId}
            autoComplete="username"
            id={usernameId}
            name="username"
            placeholder={EXAMPLE_USERNAME}
            size="lg"
            type="email"
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              if (submitError) setSubmitError(null);
            }}
          />
          <p className="text-caption text-text-muted" id={usernameHelperId}>
            Use a review-only account whenever possible. The standard email field is fine even if
            the login form expects something else.
          </p>
        </div>

        {/* Password */}
        <div className="flex flex-col gap-2">
          <label className="text-caption font-semibold text-text-primary" htmlFor={passwordId}>
            Password
          </label>
          <Input
            aria-describedby={passwordHelperId}
            autoComplete="current-password"
            id={passwordId}
            name="password"
            placeholder="••••••••"
            size="lg"
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              if (submitError) setSubmitError(null);
            }}
          />
          <p className="text-caption text-text-muted" id={passwordHelperId}>
            The password field uses the browser&apos;s native{' '}
            <span className="font-mono">type=&quot;password&quot;</span> behaviour. SONDA does not
            read, store, or transmit this value on this page.
          </p>
        </div>

        {/* Optional 2FA code */}
        <div className="flex flex-col gap-2">
          <label className="text-caption font-semibold text-text-primary" htmlFor={twoFactorId}>
            2FA code <span className="font-normal text-text-muted">(optional)</span>
          </label>
          <Input
            aria-describedby={twoFactorHelperId}
            autoComplete="one-time-code"
            id={twoFactorId}
            inputMode="numeric"
            name="twoFactor"
            placeholder={EXAMPLE_2FA}
            size="lg"
            type="text"
            value={twoFactor}
            onChange={(event) => {
              setTwoFactor(event.target.value);
              if (submitError) setSubmitError(null);
            }}
          />
          <p className="text-caption text-text-muted" id={twoFactorHelperId}>
            Optional. Leave empty if your review account does not use two-factor authentication, or
            if the code is generated dynamically during the session.
          </p>
        </div>

        {/* Optional notes */}
        <div className="flex flex-col gap-2">
          <label className="text-caption font-semibold text-text-primary" htmlFor={notesId}>
            Notes <span className="font-normal text-text-muted">(optional)</span>
          </label>
          <Textarea
            aria-describedby={notesHelperId}
            id={notesId}
            maxRows={8}
            name="notes"
            placeholder={EXAMPLE_NOTES}
            size="md"
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
              if (submitError) setSubmitError(null);
            }}
          />
          <p className="text-caption text-text-muted" id={notesHelperId}>
            Optional. Tell SONDA which account to use, which paths to focus on, and which areas to
            avoid (e.g. checkout, profile changes, destructive actions).
          </p>
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
          SONDA only forwards credentials to the evidence collector and never writes them to the
          database.
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

export default PrivateWebsiteReviewPage;
