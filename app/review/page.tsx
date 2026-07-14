/**
 * app/review/page.tsx — Review setup page.
 *
 * The first step in the SONDA flow: choose what the jury should
 * investigate. Uses the reference's selector-panel presentation — four
 * cards (icon, title, short description, estimated duration) with a
 * hover lift, a selected state, and one Continue action that routes to
 * the matching intake form.
 *
 * Accessibility
 *  - Semantic <main>; the card grid is a radiogroup of real <button>s
 *    with aria-checked; Continue is a real navigation.
 */

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, Clock, FolderArchive, Github, Globe, Lock } from 'lucide-react';

import { Button } from '@/components/ui/button';

export interface ReviewType {
  /** Stable id used in routes and selection state. */
  id: 'website' | 'github' | 'zip' | 'private-website';
  /** Display name shown as the card title. */
  name: string;
  /** One-line description of what gets submitted. */
  description: string;
  /** Estimated investigation duration. */
  duration: string;
  /** Lucide icon component. Decorative (aria-hidden). */
  icon: LucideIcon;
  /** Destination route when the user continues with this option. */
  href: string;
}

const REVIEW_TYPES: ReviewType[] = [
  {
    id: 'website',
    name: 'Public Website',
    description:
      'Submit a website URL. SONDA navigates it like a first-time user and collects evidence from every reachable page.',
    duration: '~2–3 min',
    icon: Globe,
    href: '/review/website',
  },
  {
    id: 'private-website',
    name: 'Private Website',
    description:
      'URL plus the credentials SONDA needs to enter. Best for staging environments and behind-login products.',
    duration: '~3–4 min',
    icon: Lock,
    href: '/review/private-website',
  },
  {
    id: 'github',
    name: 'GitHub Repository',
    description:
      'Submit a public repository URL. SONDA inspects the codebase for structure, signals, and craft.',
    duration: '~2–3 min',
    icon: Github,
    href: '/review/github',
  },
  {
    id: 'zip',
    name: 'Local Project (ZIP)',
    description:
      'Point SONDA at a packaged snapshot of your latest build. It unpacks and reviews the project as submitted.',
    duration: '~2–3 min',
    icon: FolderArchive,
    href: '/review/zip',
  },
];

export interface ReviewSetupPageProps {
  /** Optional override for the page title. */
  title?: string;
  /** Optional override for the page description. */
  description?: string;
  /** Optional override for the review-type list. */
  reviewTypes?: ReviewType[];
}

const ReviewSetupPage: React.FC<ReviewSetupPageProps> = ({
  title = 'What would you like SONDA to review?',
  description = 'Each option feeds the same jury — only the intake changes. Pick one and continue.',
  reviewTypes = REVIEW_TYPES,
}) => {
  const router = useRouter();
  const [selected, setSelected] = React.useState<ReviewType['id']>('website');
  const groupLabelId = React.useId();

  const selectedType = reviewTypes.find((type) => type.id === selected) ?? reviewTypes[0];

  const handleContinue = (): void => {
    if (selectedType) router.push(selectedType.href);
  };

  return (
    <main className="relative w-full bg-background px-5 py-16 text-text-primary sm:px-8 sm:py-20">
      <div className="mx-auto w-full max-w-4xl">
        {/* Page header */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-display text-caption font-semibold uppercase tracking-widest text-text-muted">
            Review setup
          </p>
          <h1
            className="mt-3 font-sans text-h2 font-bold leading-tight tracking-tight sm:text-h1"
            id={groupLabelId}
          >
            {title}
          </h1>
          <p className="mt-4 text-caption leading-relaxed text-text-secondary sm:text-body">
            {description}
          </p>
        </div>

        {/* Review-type grid */}
        <div
          aria-labelledby={groupLabelId}
          className="mt-10 grid grid-cols-1 gap-4 sm:mt-12 sm:grid-cols-2"
          role="radiogroup"
        >
          {reviewTypes.map((type) => {
            const Icon = type.icon;
            const isSelected = type.id === selected;
            return (
              <button
                key={type.id}
                aria-checked={isSelected}
                className={[
                  'group flex h-full flex-col rounded-2xl border p-5 text-left transition-all duration-200 ease-out sm:p-6',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                  isSelected
                    ? 'border-primary bg-primary-soft/60 shadow-[0_0_0_1px_hsl(var(--primary))]'
                    : 'border-border bg-surface-elevated shadow-sm hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md',
                ].join(' ')}
                role="radio"
                type="button"
                onClick={() => setSelected(type.id)}
                onDoubleClick={handleContinue}
              >
                <div className="flex items-center justify-between gap-3">
                  <span
                    aria-hidden="true"
                    className={[
                      'inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-colors',
                      isSelected
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-border/70 bg-surface text-text-secondary group-hover:text-primary',
                    ].join(' ')}
                  >
                    <Icon className="h-5 w-5" strokeWidth={2} />
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-surface px-2.5 py-1 text-[12px] font-medium text-text-muted">
                    <Clock aria-hidden="true" className="h-3 w-3" />
                    {type.duration}
                  </span>
                </div>
                <h2 className="mt-4 font-display text-h6 font-semibold text-text-primary">
                  {type.name}
                </h2>
                <p className="mt-1.5 text-caption leading-relaxed text-text-secondary">
                  {type.description}
                </p>
              </button>
            );
          })}
        </div>

        {/* Continue */}
        <div className="mt-8 flex justify-center">
          <Button
            aria-label={selectedType ? `Continue with ${selectedType.name}` : 'Continue'}
            className="w-full sm:w-auto sm:min-w-64"
            size="lg"
            type="button"
            variant="primary"
            onClick={handleContinue}
          >
            Continue
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </main>
  );
};

export default ReviewSetupPage;
