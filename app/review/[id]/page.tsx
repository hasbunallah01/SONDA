/**
 * app/review/[id]/page.tsx — Review results page.
 *
 * The destination of every form submission. Loads the session by id,
 * polls the API until the verdict lands, and renders the reference's
 * results dashboard:
 *
 *   - Sticky section sidebar (Overview → per-reviewer → verdict) with a
 *     Download Report action.
 *   - "Launch Verdict" centerpiece: score ring + status headline.
 *   - Top Issues + Priority Fixes side by side, strengths below.
 *   - Expert Reviews score cards linking to full per-reviewer sections.
 *   - Evidence summary ("What SONDA saw") + collector activity.
 *
 * States
 *   - loading  → first GET in flight.
 *   - running  → PENDING / RUNNING in DB. Animated investigation panel + auto-poll.
 *   - failed   → FAILED in DB. Error message + retry CTA.
 *   - missing  → 404 from the API. Link back to /review.
 *   - completed → render the verdict.
 *
 * Polling
 *   - Every 2s while the session is in PENDING / RUNNING.
 *   - Stops on COMPLETED, FAILED, or 404.
 *   - SSR-safe: only starts polling after the initial client mount.
 *
 * Out of scope
 *   - Live progress streaming. Polling is good enough for the
 *     synchronous pipeline.
 *   - Re-running a single reviewer.
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Download,
  FileSearch,
  FileText,
  Gavel,
  Github,
  Globe,
  Loader2,
  Lock,
  Megaphone,
  Package,
  PiggyBank,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InvestigationProgress } from '@/components/review/investigation-progress';
import type { InvestigationSource } from '@/components/review/investigation-progress';
import { ScoreRing } from '@/components/review/score-ring';
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
  {
    label: string;
    tone: 'success' | 'primary' | 'warning' | 'error';
    icon: LucideIcon;
    textClass: string;
    ringClass: string;
  }
> = {
  ready: {
    label: 'Launch Ready',
    tone: 'success',
    icon: CheckCircle2,
    textClass: 'text-success',
    ringClass: 'text-success',
  },
  almost: {
    label: 'Ready with Improvements',
    tone: 'primary',
    icon: Sparkles,
    textClass: 'text-success',
    ringClass: 'text-primary',
  },
  'needs-work': {
    label: 'Needs Work',
    tone: 'warning',
    icon: AlertCircle,
    textClass: 'text-warning',
    ringClass: 'text-warning',
  },
  'not-ready': {
    label: 'Not Ready',
    tone: 'error',
    icon: XCircle,
    textClass: 'text-error',
    ringClass: 'text-error',
  },
};

const REVIEWER_ICONS: Record<ReviewerResult['reviewer'], LucideIcon> = {
  qa: Search,
  ux: Sparkles,
  marketing: Megaphone,
  investor: PiggyBank,
  judge: Gavel,
  'first-user': ShieldCheck,
};

/** Short section labels used by the sidebar + review cards. */
const REVIEWER_LABELS: Record<ReviewerResult['reviewer'], string> = {
  qa: 'QA Review',
  ux: 'UX Review',
  marketing: 'Marketing Review',
  investor: 'Investor Review',
  judge: 'Judge Verdict',
  'first-user': 'First User Review',
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

const INVESTIGATION_SOURCE: Record<SessionData['type'], InvestigationSource> = {
  WEBSITE: 'website',
  GITHUB: 'github',
  ZIP: 'zip',
  PRIVATE_WEBSITE: 'private-website',
};

/* -------------------------------------------------------------------------- */
/* Fetch + parse                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Wire shape of `GET /api/reviews/:id`.
 *
 * The backend returns the session metadata nested under `session` and the
 * evidence / reviewer results / verdict at the top level. The rest of this
 * page works with a flat `SessionData`, so `fetchSession` normalizes the
 * wire shape into the flat shape before the UI touches it.
 *
 * Keep this type in lockstep with `app/api/reviews/[id]/route.ts`.
 */
type WireResponse = {
  session: {
    id: string;
    type: SessionData['type'];
    status: ReviewStatus;
    target: string;
    createdAt: string;
    updatedAt: string;
  };
  evidence: EvidenceSummary | null;
  reviewerResults: ReviewerResult[];
  verdict: Verdict | null;
};

const isWireResponse = (value: unknown): value is WireResponse => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const session = v.session;
  if (typeof session !== 'object' || session === null) return false;
  const s = session as Record<string, unknown>;
  return (
    typeof s.id === 'string' &&
    (s.type === 'WEBSITE' ||
      s.type === 'GITHUB' ||
      s.type === 'ZIP' ||
      s.type === 'PRIVATE_WEBSITE') &&
    (s.status === 'PENDING' ||
      s.status === 'RUNNING' ||
      s.status === 'COMPLETED' ||
      s.status === 'FAILED') &&
    typeof s.target === 'string' &&
    Array.isArray(v.reviewerResults)
  );
};

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
  let raw: unknown;
  try {
    raw = await response.json();
  } catch (error) {
    return {
      kind: 'error',
      message: error instanceof Error ? error.message : 'Failed to parse response',
    };
  }
  if (!isWireResponse(raw)) {
    return {
      kind: 'error',
      message: 'Unexpected response shape from the server.',
    };
  }

  // Normalize the wire shape into the flat `SessionData` shape
  // the rest of this page consumes.
  const session: SessionData = {
    id: raw.session.id,
    type: raw.session.type,
    status: raw.session.status,
    target: raw.session.target,
    createdAt: raw.session.createdAt,
    updatedAt: raw.session.updatedAt,
    evidence: raw.evidence,
    reviewerResults: raw.reviewerResults,
    verdict: raw.verdict,
  };

  if (session.status === 'COMPLETED') {
    return { kind: 'completed', session };
  }
  if (session.status === 'FAILED') {
    // No `reason` field on the GET response, but the verdict
    // summary is usually informative.
    return {
      kind: 'failed',
      session,
      reason: session.verdict?.summary ?? 'SONDA could not complete this review.',
    };
  }
  return { kind: 'running', session };
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

const impactVariant = (impact: PriorityFix['impact']): 'error' | 'warning' | 'secondary' =>
  impact === 'high' ? 'error' : impact === 'medium' ? 'warning' : 'secondary';

const impactLabel = (impact: PriorityFix['impact']): string =>
  impact === 'high' ? 'High' : impact === 'medium' ? 'Medium' : 'Low';

/** Small severity chip used in Top Issues / Priority Fixes rows. */
const SeverityChip: React.FC<{ impact: PriorityFix['impact'] }> = ({ impact }) => (
  <Badge aria-label={`Impact: ${impact}`} variant={impactVariant(impact)}>
    {impactLabel(impact)}
  </Badge>
);

const scoreToneClass = (score: number): string =>
  score >= 85
    ? 'text-success'
    : score >= 70
      ? 'text-primary'
      : score >= 50
        ? 'text-warning'
        : 'text-error';

/** Compact "Expert Review" score card (reference bottom row). */
const ExpertReviewCard: React.FC<{ result: ReviewerResult }> = ({ result }) => {
  const Icon = REVIEWER_ICONS[result.reviewer] ?? ShieldCheck;
  const label = REVIEWER_LABELS[result.reviewer] ?? result.reviewerRole;
  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-surface-elevated p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <p className="text-caption font-semibold text-text-primary">{label}</p>
        <span
          aria-hidden="true"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
      </div>
      <p className="mt-3 flex items-baseline gap-1">
        <span
          className={`font-display text-h3 font-bold leading-none ${scoreToneClass(result.score)}`}
        >
          {result.score}
        </span>
        <span className="text-[12px] font-medium text-text-muted">/100</span>
      </p>
      {result.failed ? (
        <p className="mt-2 inline-flex items-center gap-1 text-[12px] text-error">
          <XCircle aria-hidden="true" className="h-3 w-3" />
          Excluded from average
        </p>
      ) : null}
      <a
        className="mt-3 inline-flex items-center gap-1 text-caption font-medium text-primary transition-colors hover:text-primary-hover"
        href={`#review-${result.id}`}
      >
        View review
        <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
      </a>
    </div>
  );
};

/** Full per-reviewer section (summary, strengths, weaknesses, fixes). */
const ReviewerDetailSection: React.FC<{ result: ReviewerResult }> = ({ result }) => {
  const Icon = REVIEWER_ICONS[result.reviewer] ?? ShieldCheck;
  const label = REVIEWER_LABELS[result.reviewer] ?? result.reviewerRole;
  return (
    <section aria-label={label} className="scroll-mt-24" id={`review-${result.id}`}>
      <Card noHover={true}>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary"
              >
                <Icon className="h-5 w-5" strokeWidth={2} />
              </span>
              <div>
                <CardTitle as="h3" className="text-h5">
                  {label}
                </CardTitle>
                <p className="mt-0.5 text-caption text-text-muted">{result.reviewerRole}</p>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span
                className={`font-display text-h3 font-bold leading-none ${scoreToneClass(result.score)}`}
              >
                {result.score}
                <span className="ml-0.5 text-caption font-medium text-text-muted">/100</span>
              </span>
              <span className="mt-1 font-mono text-[10px] uppercase tracking-widest text-text-muted">
                conf {result.confidence.toFixed(2)}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-caption leading-relaxed text-text-secondary sm:text-body">
            {result.summary}
          </p>
          {result.failed ? (
            <p className="mt-3 inline-flex items-center gap-1.5 text-caption text-error">
              <XCircle aria-hidden="true" className="h-3.5 w-3.5" />
              This reviewer failed; its score is excluded from the average.
            </p>
          ) : null}

          {result.strengths.length > 0 || result.weaknesses.length > 0 ? (
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {result.strengths.length > 0 ? (
                <div>
                  <h4 className="text-caption font-semibold text-text-primary">Strengths</h4>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {result.strengths.map((line, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2 text-caption leading-relaxed text-text-secondary"
                      >
                        <Check
                          aria-hidden="true"
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success"
                        />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {result.weaknesses.length > 0 ? (
                <div>
                  <h4 className="text-caption font-semibold text-text-primary">Weaknesses</h4>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {result.weaknesses.map((line, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2 text-caption leading-relaxed text-text-secondary"
                      >
                        <XCircle
                          aria-hidden="true"
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-error"
                        />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {result.priorityFixes.length > 0 ? (
            <div className="mt-5">
              <h4 className="text-caption font-semibold text-text-primary">Suggested fixes</h4>
              <ul className="mt-2 flex flex-col gap-2">
                {result.priorityFixes.map((fix, idx) => (
                  <li
                    key={`${idx}-${fix.title}`}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-surface px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-caption font-medium text-text-primary">{fix.title}</p>
                      <p className="mt-0.5 text-caption leading-snug text-text-muted">
                        {fix.description}
                      </p>
                    </div>
                    <SeverityChip impact={fix.impact} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
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
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary-soft text-primary"
          >
            <FileSearch className="h-4 w-4" strokeWidth={2} />
          </span>
          <div>
            <CardTitle as="h2" className="text-h5">
              What SONDA saw
            </CardTitle>
            <CardDescription className="text-caption text-text-secondary">
              The evidence bundle that fed the jury.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-surface px-3.5 py-2.5"
            >
              <dt className="text-[12px] font-semibold uppercase tracking-widest text-text-muted">
                {item.label}
              </dt>
              <dd className="truncate text-caption text-text-primary">{item.value}</dd>
            </div>
          ))}
        </dl>
        {evidence.logs.items.length > 0 ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-caption font-medium text-text-secondary transition-colors hover:text-text-primary">
              Collector activity ({evidence.logs.items.length} log entries)
            </summary>
            <ul className="mt-3 space-y-1">
              {evidence.logs.items.slice(0, 6).map((log, idx) => (
                <li
                  key={`${idx}-${log.message}`}
                  className="rounded-xl border border-border/40 bg-surface px-3.5 py-2.5 text-caption text-text-muted"
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

const RunningView: React.FC<{ session: SessionData }> = ({ session }) => (
  <div className="mx-auto w-full max-w-3xl">
    <InvestigationProgress source={INVESTIGATION_SOURCE[session.type]} target={session.target} />
  </div>
);

const CompletedView: React.FC<{ session: SessionData }> = ({ session }) => {
  const verdict = session.verdict;
  if (!verdict) {
    return (
      <Card noHover={true}>
        <CardContent>
          <p className="text-body text-text-secondary">
            SONDA completed this review but the verdict is missing. Please refresh.
          </p>
        </CardContent>
      </Card>
    );
  }
  const meta = VERDICT_META[verdict.status];
  const SourceIcon = SOURCE_ICONS[session.type];

  const sidebarItems: { id: string; label: string; icon: LucideIcon }[] = [
    { id: 'overview', label: 'Overview', icon: FileText },
    ...session.reviewerResults.map((r) => ({
      id: `review-${r.id}`,
      label: REVIEWER_LABELS[r.reviewer] ?? r.reviewerRole,
      icon: REVIEWER_ICONS[r.reviewer] ?? ShieldCheck,
    })),
  ];

  const handleDownload = (): void => {
    if (typeof window !== 'undefined') window.print();
  };

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
      {/* Sidebar — desktop only */}
      <aside className="hidden lg:block print:hidden">
        <nav
          aria-label="Report sections"
          className="sticky top-24 flex flex-col rounded-2xl border border-border/70 bg-surface-elevated p-2 shadow-sm"
        >
          <ul className="flex flex-col gap-0.5">
            {sidebarItems.map((item, idx) => {
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <a
                    className={[
                      'flex items-center gap-2.5 rounded-xl px-3 py-2 text-caption font-medium transition-colors',
                      idx === 0
                        ? 'bg-primary-soft text-primary'
                        : 'text-text-secondary hover:bg-muted hover:text-text-primary',
                    ].join(' ')}
                    href={`#${item.id}`}
                  >
                    <Icon aria-hidden="true" className="h-4 w-4" />
                    {item.label}
                  </a>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 border-t border-border/60 pt-2">
            <button
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-caption font-medium text-text-secondary transition-colors hover:bg-muted hover:text-text-primary"
              type="button"
              onClick={handleDownload}
            >
              <Download aria-hidden="true" className="h-4 w-4" />
              <span>
                Download Report
                <span className="block text-[11px] font-normal text-text-muted">PDF</span>
              </span>
            </button>
          </div>
        </nav>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-col gap-8">
        {/* Overview / Launch verdict */}
        <section aria-label="Launch verdict" className="scroll-mt-24" id="overview">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-h3 font-bold tracking-tight text-text-primary">
              Launch Verdict
            </h2>
            <div className="flex items-center gap-3">
              <span className="hidden items-center gap-2 text-caption text-text-muted sm:inline-flex">
                <SourceIcon aria-hidden="true" className="h-3.5 w-3.5" />
                {SOURCE_LABELS[session.type]}
              </span>
              <StatusBadge status={session.status} />
            </div>
          </div>
          <p className="mt-1 break-all font-mono text-caption text-text-muted">{session.target}</p>

          <div className="mt-6 rounded-2xl border border-border/70 bg-surface-elevated p-6 shadow-sm sm:p-8">
            <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[auto_minmax(0,1fr)_auto]">
              <div className="justify-self-center md:justify-self-start">
                <ScoreRing
                  label={`Overall score ${verdict.overallScore} out of 100, ${meta.label}`}
                  score={verdict.overallScore}
                  toneClass={meta.ringClass}
                />
              </div>
              <div className="text-center md:text-left">
                <h3
                  className={`font-display text-h4 font-bold leading-tight ${meta.textClass} sm:text-h3`}
                >
                  {verdict.headline}
                </h3>
                <p className="mt-2 max-w-xl text-caption leading-relaxed text-text-secondary sm:text-body">
                  {verdict.summary}
                </p>
              </div>
              {/* Decorative product panel (reference thumbnail) */}
              <div
                aria-hidden="true"
                className="hidden w-52 shrink-0 self-center overflow-hidden rounded-xl border border-border/60 bg-secondary p-4 shadow-inner lg:block"
              >
                <p className="truncate font-display text-caption font-semibold text-white/90">
                  {session.target.replace(/^https?:\/\//i, '')}
                </p>
                <div className="mt-3 space-y-2">
                  <div className="h-2 w-3/4 rounded-full bg-white/15" />
                  <div className="h-2 w-1/2 rounded-full bg-white/10" />
                  <div className="h-2 w-2/3 rounded-full bg-white/10" />
                </div>
                <div className="mt-4 inline-flex rounded-md bg-primary px-2.5 py-1 text-[10px] font-semibold text-white">
                  Reviewed by SONDA
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Top issues + priority fixes */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card noHover={true}>
            <CardHeader>
              <CardTitle as="h3" className="text-h6">
                Top Issues
              </CardTitle>
            </CardHeader>
            <CardContent>
              {verdict.topWeaknesses.length > 0 ? (
                <ol aria-label="Top issues" className="flex flex-col gap-2.5">
                  {verdict.topWeaknesses.map((line, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-[11px] font-semibold text-text-secondary"
                      >
                        {idx + 1}
                      </span>
                      <span className="text-caption leading-relaxed text-text-primary">{line}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-caption text-text-muted">No issues were flagged.</p>
              )}
              <a
                className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-caption font-medium text-text-secondary transition-colors hover:border-primary/40 hover:text-text-primary"
                href="#expert-reviews"
              >
                View all issues
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </a>
            </CardContent>
          </Card>

          <Card noHover={true}>
            <CardHeader>
              <CardTitle as="h3" className="text-h6">
                Priority Fixes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {verdict.priorityFixes.length > 0 ? (
                <ul aria-label="Priority fixes" className="flex flex-col gap-2.5">
                  {verdict.priorityFixes.map((fix, idx) => (
                    <li key={`${idx}-${fix.title}`} className="flex items-start gap-3">
                      <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                      <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-caption font-medium leading-relaxed text-text-primary">
                            {fix.title}
                          </p>
                          <p className="mt-0.5 text-caption leading-snug text-text-muted">
                            {fix.description}{' '}
                            <span className="whitespace-nowrap text-[12px]">
                              · Effort: {fix.effort}
                            </span>
                          </p>
                        </div>
                        <SeverityChip impact={fix.impact} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-caption text-text-muted">No priority fixes were suggested.</p>
              )}
              <a
                className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-caption font-medium text-text-secondary transition-colors hover:border-primary/40 hover:text-text-primary"
                href="#expert-reviews"
              >
                View all fixes
                <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
              </a>
            </CardContent>
          </Card>
        </div>

        {/* Top strengths */}
        <Card noHover={true}>
          <CardHeader>
            <CardTitle as="h3" className="text-h6">
              Top Strengths
            </CardTitle>
          </CardHeader>
          <CardContent>
            {verdict.topStrengths.length > 0 ? (
              <ul aria-label="Top strengths" className="flex flex-col gap-2.5">
                {verdict.topStrengths.map((line, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <CheckCircle2
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0 text-success"
                    />
                    <span className="text-caption leading-relaxed text-text-primary">{line}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-caption text-text-muted">No strengths were flagged.</p>
            )}
          </CardContent>
        </Card>

        {/* Expert reviews */}
        <section
          aria-labelledby="expert-reviews-heading"
          className="scroll-mt-24"
          id="expert-reviews"
        >
          <h3
            className="font-display text-h5 font-bold tracking-tight text-text-primary"
            id="expert-reviews-heading"
          >
            Expert Reviews
          </h3>
          <p className="mt-1 text-caption text-text-muted">
            {session.reviewerResults.length} reviewers, one verdict.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {session.reviewerResults.map((r) => (
              <ExpertReviewCard key={r.id} result={r} />
            ))}
          </div>
        </section>

        {/* Per-reviewer detail sections */}
        <div className="flex flex-col gap-6">
          {session.reviewerResults.map((r) => (
            <ReviewerDetailSection key={r.id} result={r} />
          ))}
        </div>

        {/* Evidence summary */}
        {session.evidence ? <EvidenceSummaryCard evidence={session.evidence} /> : null}

        {/* CTA */}
        <div className="flex flex-col items-center gap-3 pt-2 text-center print:hidden">
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

        <p className="border-t border-border/60 pt-6 text-center text-caption text-text-muted">
          © {new Date().getFullYear()} SONDA. All rights reserved.
        </p>
      </div>
    </div>
  );
};

const FailedView: React.FC<{ session: SessionData; reason: string }> = ({ session, reason }) => (
  <Card noHover={true}>
    <CardHeader>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-error/10 text-error"
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
      <p className="mt-3 rounded-xl border border-error/20 bg-error/5 p-3 font-mono text-caption leading-relaxed text-text-primary">
        {reason}
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild={true} size="md" variant="primary">
          <Link href="/review">Start a different review</Link>
        </Button>
        <Button aria-label="Retry the same review" asChild={true} size="md" variant="outline">
          <Link href={`/review/${session.id}`}>
            <RefreshCw aria-hidden="true" className="h-4 w-4" />
            Retry this review
          </Link>
        </Button>
      </div>
    </CardContent>
  </Card>
);

const MissingView: React.FC = () => (
  <Card noHover={true}>
    <CardHeader>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-warning/10 text-warning"
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
  <Card noHover={true}>
    <CardHeader>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-error/10 text-error"
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
    <main className="relative w-full bg-background px-5 py-10 text-text-primary sm:px-8 sm:py-14">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-8 flex items-center justify-between print:hidden">
          <Button aria-label="Back to review setup" asChild={true} size="sm" variant="ghost">
            <Link href="/review">
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              <span>Back</span>
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
