/**
 * components/review/investigation-progress.tsx — Live investigation panel.
 *
 * The reference's "Investigating your product…" screen: a header with a
 * percentage ring, a discovery row with a growing checklist, and one row
 * per AI reviewer flipping Queued → In progress → Done.
 *
 * The pipeline is synchronous on the server, so there is no live progress
 * stream. This panel is presentational: stage timing is simulated from
 * elapsed time so the jury feels alive while the request runs. The ring
 * eases toward (but never claims) completion — the caller unmounts this
 * panel when the real response lands.
 *
 * Accessibility
 *  - The header is an aria-live=polite region announcing coarse progress.
 *  - Spinners are decorative; each row carries a textual status.
 *  - Honors prefers-reduced-motion via Tailwind's motion-safe variants.
 */

'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Check,
  FolderArchive,
  Gavel,
  Github,
  Globe,
  Loader2,
  Megaphone,
  PiggyBank,
  Search,
  Sparkles,
} from 'lucide-react';

import { ProgressRing } from '@/components/review/score-ring';

export type InvestigationSource = 'website' | 'private-website' | 'github' | 'zip';

interface StageConfig {
  /** Stage heading, e.g. "QA Agent". */
  title: string;
  /** One-line activity description. */
  activity: string;
  icon: LucideIcon;
  /** Icon tile tone classes. */
  tone: string;
  /** Seconds after mount when the stage flips to "in progress". */
  startAt: number;
  /** Seconds after mount when the stage flips to "done". */
  doneAt: number;
}

const DISCOVERY: Record<InvestigationSource, { stage: StageConfig; findings: string[] }> = {
  website: {
    stage: {
      title: 'Discovering pages',
      activity: 'Crawling and mapping your site',
      icon: Globe,
      tone: 'bg-primary-soft text-primary',
      startAt: 0,
      doneAt: 26,
    },
    findings: ['Home', 'Pricing', 'Docs', 'Contact', 'More pages'],
  },
  'private-website': {
    stage: {
      title: 'Entering your product',
      activity: 'Signing in and mapping gated pages',
      icon: Globe,
      tone: 'bg-primary-soft text-primary',
      startAt: 0,
      doneAt: 26,
    },
    findings: ['Login', 'Dashboard', 'Settings', 'Core flows', 'More pages'],
  },
  github: {
    stage: {
      title: 'Reading repository',
      activity: 'Cloning and mapping your codebase',
      icon: Github,
      tone: 'bg-primary-soft text-primary',
      startAt: 0,
      doneAt: 26,
    },
    findings: ['README', 'File tree', 'Dependencies', 'Source files', 'Docs'],
  },
  zip: {
    stage: {
      title: 'Unpacking project',
      activity: 'Extracting and mapping your files',
      icon: FolderArchive,
      tone: 'bg-primary-soft text-primary',
      startAt: 0,
      doneAt: 26,
    },
    findings: ['File tree', 'README', 'Dependencies', 'Source files', 'Config'],
  },
};

const AGENT_STAGES: StageConfig[] = [
  {
    title: 'QA Agent',
    activity: 'Running browser tests & checks',
    icon: Search,
    tone: 'bg-accent/10 text-accent-hover',
    startAt: 4,
    doneAt: 46,
  },
  {
    title: 'UX Agent',
    activity: 'Analyzing user journey & experience',
    icon: Sparkles,
    tone: 'bg-success/10 text-success',
    startAt: 7,
    doneAt: 52,
  },
  {
    title: 'Marketing Agent',
    activity: 'Evaluating messaging & positioning',
    icon: Megaphone,
    tone: 'bg-error/10 text-error',
    startAt: 10,
    doneAt: 58,
  },
  {
    title: 'Investor Agent',
    activity: 'Assessing value & market fit',
    icon: PiggyBank,
    tone: 'bg-warning/10 text-warning',
    startAt: 30,
    doneAt: 74,
  },
  {
    title: 'Judge',
    activity: 'Preparing final verdict',
    icon: Gavel,
    tone: 'bg-warning/10 text-warning',
    startAt: 55,
    doneAt: 95,
  },
];

type StageStatus = 'queued' | 'in-progress' | 'done';

const stageStatus = (stage: StageConfig, elapsed: number): StageStatus => {
  if (elapsed >= stage.doneAt) return 'done';
  if (elapsed >= stage.startAt) return 'in-progress';
  return 'queued';
};

const STATUS_LABEL: Record<StageStatus, string> = {
  queued: 'Queued',
  'in-progress': 'In progress',
  done: 'Done',
};

export interface InvestigationProgressProps {
  /** Which intake produced this session — tunes copy + discovery list. */
  source: InvestigationSource;
  /** The target under review (URL / repo), shown under the heading. */
  target?: string;
}

const InvestigationProgress: React.FC<InvestigationProgressProps> = ({ source, target }) => {
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    const start = Date.now();
    const timer = window.setInterval(() => {
      setElapsed((Date.now() - start) / 1000);
    }, 750);
    return () => window.clearInterval(timer);
  }, []);

  // Ease toward 94% but never claim completion — the real verdict does that.
  const percent = Math.min(94, Math.round(94 * (1 - Math.exp(-elapsed / 40))));

  const discovery = DISCOVERY[source];
  const stages: StageConfig[] = [discovery.stage, ...AGENT_STAGES];
  // Findings appear one at a time while discovery runs.
  const visibleFindings = Math.min(
    discovery.findings.length,
    Math.max(1, Math.floor(elapsed / 4) + 1),
  );

  return (
    <section aria-label="Investigation progress" className="w-full">
      {/* Header — title + percent ring */}
      <div className="flex items-start justify-between gap-4">
        <div aria-live="polite">
          <h2 className="font-display text-h3 font-bold tracking-tight text-text-primary">
            Investigating your product…
          </h2>
          <p className="mt-1.5 text-caption text-text-secondary sm:text-body">
            SONDA Probe is now exploring and analyzing
            {target ? (
              <>
                {' '}
                <span className="break-all font-mono text-caption text-text-muted">{target}</span>
              </>
            ) : null}
          </p>
        </div>
        <ProgressRing percent={percent} />
      </div>

      {/* Stage list */}
      <div className="mt-8 overflow-hidden rounded-2xl border border-border/70 bg-surface-elevated shadow-sm">
        <ul className="divide-y divide-border/60">
          {stages.map((stage, index) => {
            const status = stageStatus(stage, elapsed);
            const Icon = stage.icon;
            const isDiscovery = index === 0;
            return (
              <li
                key={stage.title}
                className="flex items-start justify-between gap-4 px-4 py-4 sm:px-6"
              >
                <div className="flex min-w-0 items-start gap-3.5">
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${stage.tone}`}
                  >
                    <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-display text-caption font-semibold text-text-primary sm:text-body">
                      {stage.title}
                    </p>
                    <p className="mt-0.5 text-caption text-text-muted">{stage.activity}</p>
                  </div>
                </div>

                {isDiscovery ? (
                  /* Discovery findings checklist */
                  <ul
                    aria-label="Discovered so far"
                    className="hidden shrink-0 flex-col gap-1 sm:flex"
                  >
                    {discovery.findings.slice(0, visibleFindings).map((finding) => (
                      <li
                        key={finding}
                        className="flex items-center gap-1.5 text-caption text-text-secondary motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1"
                      >
                        <Check aria-hidden="true" className="h-3.5 w-3.5 text-success" />
                        {finding}
                      </li>
                    ))}
                  </ul>
                ) : (
                  /* Agent status */
                  <span className="flex shrink-0 items-center gap-2.5 pt-1.5 text-caption text-text-muted">
                    {STATUS_LABEL[status]}
                    {status === 'in-progress' ? (
                      <Loader2
                        aria-hidden="true"
                        className="h-4 w-4 text-primary motion-safe:animate-spin"
                      />
                    ) : status === 'done' ? (
                      <Check aria-hidden="true" className="h-4 w-4 text-success" />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 rounded-full border border-border"
                      />
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <p className="mt-5 text-center text-caption text-text-muted">
        This can take a couple of minutes. The verdict appears automatically — no need to refresh.
      </p>
    </section>
  );
};

export { InvestigationProgress };
