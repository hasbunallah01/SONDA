/**
 * app/review/[id]/page.tsx — Review results page.
 *
 * The destination of every form submission. Loads the session
 * by id, polls the API until the verdict lands, and renders:
 *
 *   - The session's target, source, and current status.
 *   - The headline verdict + overall score (large, color-coded).
 *   - The per-reviewer jury (6 reviewer cards).
 *   - The top strengths, weaknesses, and priority fixes.
 *   - An evidence summary (what SONDA actually saw).
 *
 * States
 *   - loading  → first GET in flight.
 *   - running  → PENDING / RUNNING in DB. Spinner + auto-poll.
 *   - failed   → FAILED in DB. Error message + retry CTA.
 *   - missing  → 404 from the API. Link back to /review.
 *   - completed → render the verdict.
 *
 * Polling
 *   - Every 2s while the session is in PENDING / RUNNING.
 *   - Stops on COMPLETED, FAILED, or 404.
 *   - SSR-safe: only starts polling after the initial client
 *     mount.
 *
 * Design
 *   - Reuses every primitive from `components/ui/`.
 *   - Same eyebrow / title / description header as the other
 *     review pages.
 *   - Honors the existing color tokens (success / warning / error /
 *     primary) for status badges and the verdict hero.
 *
 * Out of scope
 *   - Live progress streaming. Polling is good enough for the
 *     synchronous pipeline.
 *   - Re-running a single reviewer. Out of scope.
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  Github,
  Globe,
  Loader2,
  Lock,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Wrench,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { EvidenceBundle } from '@/types/evidence';

/* -------------------------------------------------------------------------- */
/* Wire types (mirror the API response)                                       */
/* -------------------------------------------------------------------------- */

type ReviewStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';

type VerdictStatus = 'ready' | 'almost' | 'needs-work' | 'not-ready';

type PriorityFix = {
  title: string;
  description: string;
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
};

type ReviewerResult = {
  id: string;
  reviewer: 'qa' | 'ux' | 'marketing' | 'investor' | 'judge' | 'first-user';
  reviewerRole: string;
  score: number;
  confidence: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  priorityFixes: PriorityFix[];
  failed: boolean;
};

type Verdict = {
  overallScore: number;
  status: VerdictStatus;
  headline: string;
  summary: string;
  topStrengths: string[];
  topWeaknesses: string[];
  priorityFixes: PriorityFix[];
};

type EvidenceSummary = EvidenceBundle;

type SessionData = {
  id: string;
  type: 'WEBSITE' | 'GITHUB' | 'ZIP' | 'PRIVATE_WEBSITE';
  status: ReviewStatus;
  target: string;
  createdAt: string;
  updatedAt: string;
  evidence: EvidenceSummary | null;
  reviewerResults: ReviewerResult[];
  verdict: Verdict | null;
};

type FetchState =
  | { kind: 'loading' }
  | { kind: 'running'; session: SessionData }
  | { kind: 'completed'; session: SessionData }
  | { kind: 'failed'; session: SessionData; reason: string }
  | { kind: 'missing' }
  | { kind: 'error'; message: string };

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const POLL_INTERVAL_MS = 2_000;

const VERDICT_META: Record<
  VerdictStatus,
  { label: string; tone: 'success' | 'primary' | 'warning' | 'error'; icon: LucideIcon }
> = {
  ready: { label: 'Launch Ready', tone: 'success', icon: CheckCircle2 },
  almost: { label: 'Almost There', tone: 'primary', icon: Sparkles },
  'needs-work': { label: 'Needs Work', tone: 'warning', icon: AlertCircle },
  'not-ready': { label: 'Not Ready', tone: 'error', icon: XCircle },
};

const REVIEWER_ICONS: Record<ReviewerResult['reviewer'], LucideIcon> = {
  qa: Wrench,
  ux: Sparkles,
  marketing: Globe,
  investor: Search,
  judge: Sparkles,
  'first-user': ShieldCheck,
};

const SOURCE_LABELS: Record<SessionData['type'], string> = {
  WEBSITE: 'Public website',
  GITHUB: 'GitHub repository',
  ZIP: 'Local project ZIP',
  PRIVATE_WEBSITE: 'Private website',
};

const SOURCE_ICONS: Record<SessionData['type'], LucideIcon> = {
  WEBSITE: Globe,
  GITHUB: Github,
  ZIP: Package,
  PRIVATE_WEBSITE: Lock,
};

/* -------------------------------------------------------------------------- */
/* Fetch + parse                                                              */
/* -------------------------------------------------------------------------- */

const fetchSession = async (id: string): Promise<FetchState> => {
  let response: Response;
  try {
    response = await fetch(`/api/reviews/${id}`, { cache: 'no-store' });
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : 'Network error',
    };
  }
  if (response.status === 404) {
    return { kind: 'missing' };
  }
  if (!response.ok) {
    return {
      kind: 'error',
      message: `Server returned ${response.status} ${response.statusText}.`,
    };
  }
  let body: SessionData;
  try {
    body = (await response.json()) as SessionData;
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : 'Failed to parse response',
    };
  }

  if (body.status === 'COMPLETED') {
    return { kind: 'completed', session: body };
  }
  if (body.status === 'FAILED') {
    // No `reason` field on the GET response, but the headline
    // is usually informative.
    return {
      kind: 'failed',
      session: body,
      reason: body.verdict?.summary ?? 'SONDA could not complete this review.',
    };
  }
  return { kind: 'running', session: body };
};

/* -------------------------------------------------------------------------- */
/* Subcomponents                                                              */
/* -------------------------------------------------------------------------- */

const StatusBadge: React.FC<{ status: ReviewStatus }> = ({ status }) => {
  if (status === 'COMPLETED') {
    return (
      <Badge dot aria-label="Status: completed" variant="success">
        Completed
      </Badge>
    );
  }
  if (status === 'FAILED') {
    return (
      <Badge dot aria-label="Status: failed" variant="error">
        Failed
      </Badge>
    );
  }
  if (status === 'RUNNING') {
    return (
      <Badge dot aria-label="Status: running" variant="primary">
        Running
      </Badge>
    );
  }
  return (
    <Badge dot aria-label="Status: pending" variant="secondary">
      Pending
    </Badge>
  );
};

const ScoreRing: React.FC<{ score: number; status: VerdictStatus }> = ({ score, status }) => {
  const meta = VERDICT_META[status];
  const ringColor =
    meta.tone === 'success'
      ? 'border-success/40 bg-success/5 text-success'
      : meta.tone === 'primary'
        ? 'border-primary/40 bg-primary-soft text-primary'
        : meta.tone === 'warning'
          ? 'border-warning/40 bg-warning/5 text-warning'
          : 'border-error/40 bg-error/5 text-error';
  return (
    <div
      aria-label={`Overall score ${score} out of 100, ${meta.label}`}
      className={[
        'inline-flex h-40 w-40 flex-col items-center justify-center rounded-full border-4',
        ringColor,
      ].join(' ')}
    >
      <span className="font-display text-5xl font-semibold leading-none">{score}</span>
      <span className="mt-1 font-display text-caption font-medium uppercase tracking-widest text-text-secondary">
        out of 100
      </span>
    </div>
  );
};

const ReviewerCard: React.FC<{ result: ReviewerResult }> = ({ result }) => {
  const Icon = REVIEWER_ICONS[result.reviewer] ?? ShieldCheck;
  const scoreTone =
    result.score >= 85
      ? 'text-success'
      : result.score >= 70
        ? 'text-primary'
        : result.score >= 50
          ? 'text-warning'
          : 'text-error';
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary-soft text-primary"
            >
              <Icon className="h-4 w-4" strokeWidth={2} />
            </span>
            <div>
              <CardTitle
                as="h3"
                className="text-caption font-semibold uppercase tracking-widest text-text-muted"
              >
                {result.reviewerRole}
              </CardTitle>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className={`font-display text-h3 font-semibold leading-none ${scoreTone}`}>
              {result.score}
            </span>
            <span className="mt-1 font-mono text-[10px] uppercase tracking-widest text-text-muted">
              conf {result.confidence.toFixed(2)}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-caption leading-relaxed text-text-secondary">{result.summary}</p>
        {result.failed ? (
          <p className="mt-3 inline-flex items-center gap-1.5 text-caption text-error">
            <XCircle aria-hidden="true" className="h-3.5 w-3.5" />
            This reviewer failed; its score is excluded from the average.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
};

const EvidenceSummaryCard: React.FC<{ evidence: EvidenceSummary }> = ({ evidence }) => {
  const items: { label: string; value: string }[] = [
    { label: 'Source', value: evidence.metadata.source },
    { label: 'Target', value: evidence.metadata.input.label },
  ];
  if (evidence.screenshots.items.length > 0) {
    items.push({
      label: 'Screenshots',
      value: `${evidence.screenshots.items.length} captured`,
    });
  }
  if (evidence.pageContent) {
    if (evidence.pageContent.headings.length > 0) {
      items.push({
        label: 'Headings',
        value: `${evidence.pageContent.headings.length}`,
      });
    }
    if (evidence.pageContent.body.length > 0) {
      items.push({
        label: 'Body copy',
        value: `${evidence.pageContent.body.length.toLocaleString()} chars`,
      });
    }
  }
  if (evidence.files) {
    if (evidence.files.fileTree.length > 0) {
      items.push({
        label: 'Files',
        value: `${evidence.files.fileTree.length}`,
      });
    }
    if (evidence.files.readme) {
      items.push({ label: 'README', value: 'captured' });
    }
    if (evidence.files.license) {
      items.push({ label: 'License', value: 'present' });
    }
  }
  if (typeof evidence.metrics?.stars === 'number') {
    items.push({
      label: 'GitHub stars',
      value: evidence.metrics.stars.toLocaleString(),
    });
  }
  if (evidence.metadata.facts.language) {
    items.push({ label: 'Language', value: evidence.metadata.facts.language });
  }

  return (
    <Card noHover={true}>
      <CardHeader>
        <CardTitle as="h2" className="text-h5">
          What SONDA saw
        </CardTitle>
        <CardDescription className="text-caption text-text-secondary">
          The evidence bundle that fed the jury.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-background/40 px-3 py-2"
            >
              <dt className="font-display text-caption font-semibold uppercase tracking-widest text-text-muted">
                {item.label}
              </dt>
              <dd className="truncate text-caption text-text-primary">{item.value}</dd>
            </div>
          ))}
        </dl>
        {evidence.logs.items.length > 0 ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-caption font-medium text-text-secondary hover:text-text-primary">
              Collector activity ({evidence.logs.items.length} log entries)
            </summary>
            <ul className="mt-3 space-y-1">
              {evidence.logs.items.slice(0, 6).map((log, idx) => (
                <li
                  key={`${idx}-${log.message}`}
                  className="rounded-md border border-border/40 bg-background/30 px-3 py-2 text-caption text-text-muted"
                >
                  <span className="mr-2 font-mono uppercase tracking-widest text-text-secondary">
                    {log.level}
                  </span>
                  {log.message}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
};

/* -------------------------------------------------------------------------- */
/* State renderers                                                            */
/* -------------------------------------------------------------------------- */

const LoadingView: React.FC = () => (
  <div
    aria-label="Loading review"
    className="flex flex-col items-center justify-center gap-4 py-20"
    role="status"
  >
    <Loader2 aria-hidden="true" className="h-10 w-10 animate-spin text-primary" />
    <p className="text-body text-text-secondary">Loading review…</p>
  </div>
);

const RunningView: React.FC<{ session: SessionData }> = ({ session }) => {
  const SourceIcon = SOURCE_ICONS[session.type];
  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary-soft text-primary"
              >
                <SourceIcon className="h-5 w-5" strokeWidth={2} />
              </span>
              <div>
                <CardTitle as="h2" className="text-h4">
                  {SOURCE_LABELS[session.type]}
                </CardTitle>
                <p className="mt-1 break-all font-mono text-caption text-text-secondary">
                  {session.target}
                </p>
              </div>
            </div>
            <StatusBadge status={session.status} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4 py-6" role="status">
            <Loader2 aria-hidden="true" className="h-8 w-8 animate-spin text-primary" />
            <p className="font-display text-h4 font-semibold text-text-primary">
              The jury is investigating
            </p>
            <p className="max-w-md text-center text-caption leading-relaxed text-text-secondary">
              SONDA is collecting evidence and running the reviewer panel. This page will update
              automatically when the verdict is ready — no need to refresh.
            </p>
          </div>
          <ul aria-label="Pipeline stages" className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <li className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-3 py-2 text-caption text-text-secondary">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary" />
              Collecting evidence
            </li>
            <li className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-3 py-2 text-caption text-text-secondary">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary" />
              Running the jury
            </li>
            <li className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-3 py-2 text-caption text-text-secondary">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary" />
              Computing the verdict
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

const CompletedView: React.FC<{ session: SessionData }> = ({ session }) => {
  const verdict = session.verdict;
  if (!verdict) {
    return (
      <Card>
        <CardContent>
          <p className="text-body text-text-secondary">
            SONDA completed this review but the verdict is missing. Please refresh.
          </p>
        </CardContent>
      </Card>
    );
  }
  const meta = VERDICT_META[verdict.status];
  const MetaIcon = meta.icon;
  const SourceIcon = SOURCE_ICONS[session.type];

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary-soft text-primary"
              >
                <SourceIcon className="h-5 w-5" strokeWidth={2} />
              </span>
              <div>
                <CardTitle as="h2" className="text-h4">
                  {SOURCE_LABELS[session.type]}
                </CardTitle>
                <p className="mt-1 break-all font-mono text-caption text-text-secondary">
                  {session.target}
                </p>
              </div>
            </div>
            <StatusBadge status={session.status} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-6 py-4">
            <ScoreRing score={verdict.overallScore} status={verdict.status} />
            <div className="flex flex-col items-center gap-2 text-center">
              <Badge dot aria-label={`Verdict: ${meta.label}`} variant={meta.tone}>
                <MetaIcon aria-hidden="true" className="h-3.5 w-3.5" />
                {meta.label}
              </Badge>
              <h3 className="mt-1 font-display text-h3 font-semibold leading-tight text-text-primary sm:text-h2">
                {verdict.headline}
              </h3>
              <p className="max-w-2xl text-body leading-relaxed text-text-secondary">
                {verdict.summary}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reviewer panel */}
      <section aria-labelledby="jury-heading">
        <h2
          className="font-display text-caption font-semibold uppercase tracking-widest text-text-muted"
          id="jury-heading"
        >
          The jury
        </h2>
        <p className="mt-1 font-display text-h4 font-semibold text-text-primary">
          {session.reviewerResults.length} reviewers, one verdict
        </p>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {session.reviewerResults.map((r) => (
            <ReviewerCard key={r.id} result={r} />
          ))}
        </div>
      </section>

      {/* Strengths + Weaknesses */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-success/10 text-success"
              >
                <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
              </span>
              <CardTitle as="h2" className="text-h5">
                Top strengths
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {verdict.topStrengths.length > 0 ? (
              <ul aria-label="Top strengths" className="flex flex-col gap-2">
                {verdict.topStrengths.map((line, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 rounded-md border border-success/20 bg-success/5 px-3 py-2 text-caption leading-relaxed text-text-primary"
                  >
                    <CheckCircle2
                      aria-hidden="true"
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success"
                    />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-caption text-text-muted">No strengths were flagged.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-error/10 text-error"
              >
                <XCircle className="h-4 w-4" strokeWidth={2} />
              </span>
              <CardTitle as="h2" className="text-h5">
                Top weaknesses
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {verdict.topWeaknesses.length > 0 ? (
              <ul aria-label="Top weaknesses" className="flex flex-col gap-2">
                {verdict.topWeaknesses.map((line, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 rounded-md border border-error/20 bg-error/5 px-3 py-2 text-caption leading-relaxed text-text-primary"
                  >
                    <XCircle
                      aria-hidden="true"
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-error"
                    />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-caption text-text-muted">No weaknesses were flagged.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Priority fixes */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary-soft text-primary"
            >
              <Wrench className="h-4 w-4" strokeWidth={2} />
            </span>
            <CardTitle as="h2" className="text-h5">
              Priority fixes
            </CardTitle>
          </div>
          <CardDescription className="text-caption text-text-secondary">
            Ranked by impact and effort, deduplicated across the jury.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {verdict.priorityFixes.length > 0 ? (
            <ol aria-label="Priority fixes" className="flex flex-col gap-3">
              {verdict.priorityFixes.map((fix, idx) => {
                const impactTone =
                  fix.impact === 'high'
                    ? 'error'
                    : fix.impact === 'medium'
                      ? 'warning'
                      : 'secondary';
                const effortTone =
                  fix.effort === 'low'
                    ? 'success'
                    : fix.effort === 'medium'
                      ? 'warning'
                      : 'secondary';
                return (
                  <li
                    key={`${idx}-${fix.title}`}
                    className="flex items-start gap-3 rounded-md border border-border/60 bg-background/40 p-4"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft font-mono text-caption font-semibold text-primary"
                    >
                      {idx + 1}
                    </span>
                    <div className="flex min-w-0 flex-col">
                      <p className="font-display text-body font-semibold text-text-primary">
                        {fix.title}
                      </p>
                      <p className="mt-1 text-caption leading-relaxed text-text-secondary">
                        {fix.description}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge aria-label={`Impact: ${fix.impact}`} variant={impactTone}>
                          Impact · {fix.impact}
                        </Badge>
                        <Badge aria-label={`Effort: ${fix.effort}`} variant={effortTone}>
                          Effort · {fix.effort}
                        </Badge>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-caption text-text-muted">No priority fixes were suggested.</p>
          )}
        </CardContent>
      </Card>

      {/* Evidence summary */}
      {session.evidence ? <EvidenceSummaryCard evidence={session.evidence} /> : null}

      {/* CTA */}
      <div className="flex flex-col items-center gap-3 pt-2 text-center">
        <Button asChild={true} size="lg" variant="primary">
          <Link href="/review">
            Start another review
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </Button>
        <p className="text-caption text-text-muted">
          Share this URL with your team — the result is durable.
        </p>
      </div>
    </div>
  );
};

const FailedView: React.FC<{ session: SessionData; reason: string }> = ({ session, reason }) => (
  <Card>
    <CardHeader>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-error/10 text-error"
          >
            <XCircle className="h-5 w-5" strokeWidth={2} />
          </span>
          <CardTitle as="h2" className="text-h4">
            This review failed
          </CardTitle>
        </div>
        <StatusBadge status="FAILED" />
      </div>
    </CardHeader>
    <CardContent>
      <p className="text-body leading-relaxed text-text-primary">
        SONDA could not complete the review of{' '}
        <span className="break-all font-mono">{session.target}</span>.
      </p>
      <p className="mt-3 rounded-md border border-error/20 bg-error/5 p-3 font-mono text-caption leading-relaxed text-text-primary">
        {reason}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild={true} size="md" variant="primary">
          <Link href="/review">Start a different review</Link>
        </Button>
        <Button
          aria-label="Retry the same review"
          asChild={false}
          size="md"
          variant="outline"
          // Trigger a refresh in the parent via window.location; we don't
          // get a retry callback here because this view is rendered
          // directly.
        >
          <a href={`/review/${session.id}`}>
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            Retry this review
          </a>
        </Button>
      </div>
    </CardContent>
  </Card>
);

const MissingView: React.FC = () => (
  <Card>
    <CardHeader>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-warning/10 text-warning"
        >
          <FileText className="h-5 w-5" strokeWidth={2} />
        </span>
        <CardTitle as="h2" className="text-h4">
          Review not found
        </CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      <p className="text-body leading-relaxed text-text-secondary">
        We could not find a review with that id. The link may be wrong, or the review may have been
        removed.
      </p>
      <div className="mt-6">
        <Button asChild={true} size="md" variant="primary">
          <Link href="/review">Back to review setup</Link>
        </Button>
      </div>
    </CardContent>
  </Card>
);

const ErrorView: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <Card>
    <CardHeader>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-error/10 text-error"
        >
          <AlertCircle className="h-5 w-5" strokeWidth={2} />
        </span>
        <CardTitle as="h2" className="text-h4">
          Something went wrong
        </CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      <p className="text-body leading-relaxed text-text-secondary">{message}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button size="md" variant="primary" onClick={onRetry}>
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          Try again
        </Button>
        <Button asChild={true} size="md" variant="outline">
          <Link href="/review">Back to review setup</Link>
        </Button>
      </div>
    </CardContent>
  </Card>
);

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

const ResultsPage: React.FC<{ params: { id: string } }> = ({ params }) => {
  const id = params.id;
  const [state, setState] = React.useState<FetchState>({ kind: 'loading' });
  const [pollAttempts, setPollAttempts] = React.useState<number>(0);

  // Single in-flight guard. We don't want overlapping polls.
  const isFetchingRef = React.useRef<boolean>(false);

  const runFetch = React.useCallback(async (): Promise<void> => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const next = await fetchSession(id);
      setState(next);
      if (next.kind === 'running') {
        setPollAttempts((n) => n + 1);
      } else {
        setPollAttempts(0);
      }
    } finally {
      isFetchingRef.current = false;
    }
  }, [id]);

  // Initial load + polling.
  React.useEffect(() => {
    void runFetch();
  }, [runFetch]);

  // Poll while the session is still running.
  React.useEffect(() => {
    if (state.kind !== 'running') return;
    const timer = window.setInterval(() => {
      void runFetch();
    }, POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [state.kind, runFetch]);

  // Safety cap: stop polling after 150 attempts (~5 minutes).
  React.useEffect(() => {
    if (pollAttempts >= 150 && state.kind === 'running') {
      setState({
        kind: 'failed',
        session: state.session,
        reason:
          'SONDA is still investigating. Please refresh the page in a moment, or start a new review.',
      });
    }
  }, [pollAttempts, state]);

  // Show elapsed time when running.
  const [elapsedSeconds, setElapsedSeconds] = React.useState<number>(0);
  React.useEffect(() => {
    if (state.kind !== 'running') {
      setElapsedSeconds(0);
      return;
    }
    const start = Date.now();
    const id = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, [state.kind, state]);

  return (
    <main className="relative w-full bg-background px-6 py-20 text-text-primary sm:py-24">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <Button aria-label="Back to review setup" asChild={true} size="sm" variant="ghost">
            <Link href="/review">
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              <span>Back to review setup</span>
            </Link>
          </Button>
          {state.kind === 'running' ? (
            <span
              aria-live="polite"
              className="inline-flex items-center gap-1.5 text-caption text-text-secondary"
            >
              <Clock aria-hidden="true" className="h-3.5 w-3.5" />
              {elapsedSeconds}s elapsed
            </span>
          ) : null}
        </div>

        {state.kind === 'loading' ? <LoadingView /> : null}
        {state.kind === 'running' ? <RunningView session={state.session} /> : null}
        {state.kind === 'completed' ? <CompletedView session={state.session} /> : null}
        {state.kind === 'failed' ? (
          <FailedView reason={state.reason} session={state.session} />
        ) : null}
        {state.kind === 'missing' ? <MissingView /> : null}
        {state.kind === 'error' ? <ErrorView message={state.message} onRetry={runFetch} /> : null}
      </div>
    </main>
  );
};

export default ResultsPage;
