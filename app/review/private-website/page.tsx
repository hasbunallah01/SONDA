/**
 * app/review/private-website/page.tsx — Private Website review form scaffold.
 *
 * Sibling of /review/website, /review/github, and /review/zip: same layout,
 * same submit-no-op behaviour, same accessibility wiring. The intake here
 * is a private website URL plus the credentials SONDA would need to log in.
 *
 * This page is a frontend-only SCAFFOLD:
 *  - The form is rendered with the same look and feel as the other review
 *    pages so the user can preview what private reviews will look like.
 *  - The "Coming soon" Badge is surfaced prominently in the form header
 *    and the submit button is disabled until later tasks wire up the
 *    real authenticated browser session flow.
 *  - No credentials are stored, sent, logged, or otherwise handled. The
 *    field state lives only in component state and is never sent to any
 *    backend, analytics, or third party. The page intentionally does
 *    not run credential validation, password rules, or even length
 *    checks beyond "non-empty" — this is a UI scaffold, not a credential
 *    intake.
 *
 * Design
 *  - Mirrors the other review pages: back link → eyebrow / title /
 *    description → form card → info card.
 *  - Form fields: Website URL, Username, Password, Optional 2FA Code,
 *    Optional Notes (textarea). All inputs use the existing Input /
 *    Textarea primitives, the primary-soft icon tile, and the same
 *    max-width container.
 *  - A "Coming soon" Badge in the form header makes the disabled state
 *    honest without making the page look broken.
 *
 * Accessibility
 *  - Wrapped in a semantic <main>.
 *  - The <form> is a real <form>; every field has an associated
 *    <label> and aria-describedby pointing at the helper text.
 *  - Password field uses a native type="password" input — that is the
 *    OS-level signal for the field, not a credential handling decision.
 *  - On submit we call event.preventDefault() to keep this static.
 *  - An aria-live region announces the local acknowledgement so screen
 *    readers hear the change (only fires when the user does manage to
 *    submit, which is not currently possible since the submit button
 *    is disabled — kept in for parity with the sibling pages).
 *
 * Out of scope (per task)
 *  - No backend, no API, no Playwright, no real authenticated sessions.
 *  - No credential storage, no credential validation, no logging.
 *  - No security guarantees implied by the form layout.
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft, ArrowRight, Lock, LogIn, Map, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

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
  const [url, setUrl] = React.useState<string>('');
  const [username, setUsername] = React.useState<string>('');
  const [password, setPassword] = React.useState<string>('');
  const [twoFactor, setTwoFactor] = React.useState<string>('');
  const [notes, setNotes] = React.useState<string>('');
  const [submitted, setSubmitted] = React.useState<boolean>(false);

  // "Non-empty" is the only check we do — this is a scaffold, not a
  // credential intake. Never validate password rules, never log, never
  // send.
  const urlTrimmed = url.trim();
  const usernameTrimmed = username.trim();
  const passwordTrimmed = password.trim();
  const isValid =
    isLikelyUrl(urlTrimmed) && usernameTrimmed.length > 0 && passwordTrimmed.length > 0;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!isValid) return;
    // Frontend only — acknowledge locally; the real flow is wired up in
    // a later task. Credentials are intentionally not stored, sent, or
    // logged anywhere.
    setSubmitted(true);
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
            <div className="flex items-center justify-between gap-3">
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
              <Badge aria-label="Status: Coming soon" variant="secondary">
                Coming soon
              </Badge>
            </div>
            <CardTitle as="h2" className="mt-4 text-h4">
              Private Website Access
            </CardTitle>
            <CardDescription className="text-body leading-relaxed text-text-secondary">
              This form is a frontend scaffold for the upcoming authenticated review flow. The
              fields below are shown for layout only — credentials are not stored, sent, or used in
              any way on this page.
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
                    if (submitted) setSubmitted(false);
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
                    if (submitted) setSubmitted(false);
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
                    if (submitted) setSubmitted(false);
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
                    if (submitted) setSubmitted(false);
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
                    if (submitted) setSubmitted(false);
                  }}
                />
                <p className="text-caption text-text-muted" id={notesHelperId}>
                  Optional. Tell SONDA which account to use, which paths to focus on, and which
                  areas to avoid (e.g. checkout, profile changes, destructive actions).
                </p>
              </div>

              <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-caption text-text-muted">
                  The submit button is disabled while this flow is in scaffold.
                </p>
                <Button
                  disabled
                  aria-label="Start SONDA investigation"
                  className="w-full sm:w-auto"
                  size="lg"
                  type="submit"
                  variant="primary"
                >
                  Start Investigation
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Local acknowledgement — silent until the user submits. */}
        <div aria-live="polite" className="sr-only" id={liveRegionId} role="status">
          {submitted ? 'Investigation queued.' : ''}
        </div>

        {/* Info card — what SONDA will analyze once the flow ships. */}
        <Card className="mt-8" noHover={true}>
          <CardHeader>
            <CardTitle as="h2" className="text-h5">
              What this flow will support
            </CardTitle>
            <CardDescription className="text-body leading-relaxed text-text-secondary">
              Once the private-website review ships, the jury will run a full authenticated session
              against the four capabilities below.
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
