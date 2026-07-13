/**
 * app/review/private-website/page.tsx — Private Website review form.
 *
 * Sibling of /review/website, /review/github, and /review/zip: same layout,
 * same accessibility wiring. The intake here is a private website URL
 * plus the credentials SONDA needs to log in.
 *
 * The form POSTs to /api/reviews with the credentials; the API forwards
 * them to the evidence collector which applies HTTP Basic Auth on the
 * first request. Credentials are never written to the session row or
 * to disk — they live in the request body for the duration of the
 * pipeline only.
 *
 * Design
 *  - Mirrors the other review pages: back link → eyebrow / title /
 *    description → form card → info card.
 *  - Form fields: Website URL, Username, Password, Optional 2FA Code,
 *    Optional Notes (textarea). All inputs use the existing Input /
 *    Textarea primitives.
 *
 * Accessibility
 *  - Wrapped in a semantic <main>.
 *  - The <form> is a real <form>; every field has an associated
 *    <label> and aria-describedby pointing at the helper text.
 *  - Password field uses a native type="password" input.
 *  - On submit we call event.preventDefault() and POST to the API.
 *  - An aria-live region announces the in-flight state.
 *
 * Out of scope
 *  - Session-cookie / SSO / 2FA-aware auth flows.
 *  - Credential storage beyond the request lifetime.
 *  - Security guarantees beyond TLS.
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
  Loader2,
  Lock,
  LogIn,
  Map,
  ShieldCheck,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
            Private website
          </p>
          <h1
            className="mt-3 font-display text-h1 font-semibold leading-tight tracking-tight sm:text-display"
            id={titleId}
          >
            Review a Private Website
          </h1>
          <p className="mt-4 text-body leading-relaxed text-text-secondary sm:text-lg">
            Provide secure access details so SONDA can explore authenticated products.
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
                <Lock className="h-5 w-5" strokeWidth={2} />
              </span>
              <span
                aria-hidden="true"
                className="font-display text-caption font-semibold uppercase tracking-widest text-text-muted"
              >
                Step 1 · Provide access
              </span>
            </div>
            <CardTitle as="h2" className="mt-4 text-h4">
              Private Website Access
            </CardTitle>
            <CardDescription className="text-body leading-relaxed text-text-secondary">
              Provide the URL and credentials SONDA needs to log in. Use a review-only account
              whenever possible. Credentials are forwarded to the evidence collector and never
              written to the session row.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              noValidate
              aria-labelledby={titleId}
              className="flex flex-col gap-5"
              onSubmit={handleSubmit}
            >
              {/* Website URL */}
              <div className="flex flex-col gap-2">
                <label
                  className="font-display text-caption font-semibold text-text-primary"
                  htmlFor={urlId}
                >
                  Website URL
                </label>
                <Input
                  autoFocus
                  aria-describedby={urlHelperId}
                  aria-invalid={
                    urlTrimmed.length > 0 && !isLikelyUrl(urlTrimmed) ? true : undefined
                  }
                  autoComplete="url"
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
                <p className="text-caption text-text-muted" id={urlHelperId}>
                  Paste the staging or private URL — including{' '}
                  <span className="font-mono">https://</span>. Public pages should use the standard
                  Website option instead.
                </p>
              </div>

              {/* Username */}
              <div className="flex flex-col gap-2">
                <label
                  className="font-display text-caption font-semibold text-text-primary"
                  htmlFor={usernameId}
                >
                  Username
                </label>
                <Input
                  aria-describedby={usernameHelperId}
                  aria-invalid={
                    usernameTrimmed.length > 0 && usernameTrimmed.length === 0 ? true : undefined
                  }
                  autoComplete="username"
                  id={usernameId}
                  invalid={usernameTrimmed.length > 0 && usernameTrimmed.length === 0}
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
                  Use a review-only account whenever possible. The standard email field is fine even
                  if the login form expects something else.
                </p>
              </div>

              {/* Password */}
              <div className="flex flex-col gap-2">
                <label
                  className="font-display text-caption font-semibold text-text-primary"
                  htmlFor={passwordId}
                >
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
                  <span className="font-mono">type=&quot;password&quot;</span> behaviour. SONDA does
                  not read, store, or transmit this value on this page.
                </p>
              </div>

              {/* Optional 2FA code */}
              <div className="flex flex-col gap-2">
                <label
                  className="font-display text-caption font-semibold text-text-primary"
                  htmlFor={twoFactorId}
                >
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
                  Optional. Leave empty if your review account does not use two-factor
                  authentication, or if the code is generated dynamically during the session.
                </p>
              </div>

              {/* Optional notes */}
              <div className="flex flex-col gap-2">
                <label
                  className="font-display text-caption font-semibold text-text-primary"
                  htmlFor={notesId}
                >
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
                  Optional. Tell SONDA which account to use, which paths to focus on, and which
                  areas to avoid (e.g. checkout, profile changes, destructive actions).
                </p>
              </div>

              <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-caption text-text-muted">
                  SONDA only forwards credentials to the evidence collector and never writes them to
                  the database.
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
        {isSubmitting ? (
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
              <span className="font-semibold">Investigation in progress.</span> SONDA is
              authenticating and exploring the site. You will be redirected to the verdict in a
              moment.
            </p>
          </div>
        ) : null}

        {/* Local acknowledgement for screen readers. */}
        <div aria-live="polite" className="sr-only" id={liveRegionId} role="status">
          {isSubmitting ? 'Investigation started. Redirecting…' : ''}
        </div>

        {/* Info card — what SONDA will analyze once the flow ships. */}
        <Card className="mt-8" noHover={true}>
          <CardHeader>
            <CardTitle as="h2" className="text-h5">
              What SONDA will analyze
            </CardTitle>
            <CardDescription className="text-body leading-relaxed text-text-secondary">
              The jury runs a full authenticated session against the four capabilities below. Use a
              review-only account so destructive actions are off-limits.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul aria-label="Planned capabilities" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

export default PrivateWebsiteReviewPage;
