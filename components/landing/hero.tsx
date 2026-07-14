/**
 * components/landing/hero.tsx — Hero section of the SONDA landing page.
 *
 * Matches the reference design:
 *  - Large two-line headline ("Explore your product / before your users do.")
 *    with the word "before" in brand indigo.
 *  - "An Autonomous AI Product Launch Jury" positioning line + short
 *    description underneath.
 *  - An embedded selector panel — "What would you like SONDA to review?" —
 *    with the four review types and a single Continue CTA.
 *  - A quiet trust line at the bottom.
 *
 * Behaviour
 *  - Selecting a review type highlights the card; Continue routes to the
 *    matching intake form (defaults to the Public Website flow).
 *  - Desktop: 4-up card grid. Mobile: stacked rows with chevrons, per the
 *    reference's mobile layout.
 *
 * Accessibility
 *  - Semantic <header> + <h1>; the selector is a radiogroup of buttons
 *    with aria-checked; Continue is a real navigation.
 */

'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, ChevronRight, FolderArchive, Github, Globe, Lock } from 'lucide-react';

import { Button } from '@/components/ui/button';

export interface HeroProps {
  /** Optional override for the positioning line under the headline. */
  tagline?: string;
  /** Optional override for the supporting description copy. */
  description?: string;
}

interface ReviewOption {
  id: 'website' | 'private-website' | 'github' | 'zip';
  title: string;
  subtitle: string;
  icon: LucideIcon;
  href: string;
}

const REVIEW_OPTIONS: ReviewOption[] = [
  {
    id: 'website',
    title: 'Public Website',
    subtitle: 'Review any live website',
    icon: Globe,
    href: '/review/website',
  },
  {
    id: 'private-website',
    title: 'Private Website',
    subtitle: 'Review behind login',
    icon: Lock,
    href: '/review/private-website',
  },
  {
    id: 'github',
    title: 'GitHub Repository',
    subtitle: 'Analyze your codebase',
    icon: Github,
    href: '/review/github',
  },
  {
    id: 'zip',
    title: 'Local Project (ZIP)',
    subtitle: 'Upload project files',
    icon: FolderArchive,
    href: '/review/zip',
  },
];

const DEFAULT_TAGLINE = 'An Autonomous AI Product Launch Jury';
const DEFAULT_DESCRIPTION =
  'Investigate your website, repository, or local project through multiple autonomous AI reviewers before launch.';

const TRUST_ITEMS = ['Trusted by builders', 'Hackathon teams', 'Startups', 'Developers'];

const Hero: React.FC<HeroProps> = ({
  tagline = DEFAULT_TAGLINE,
  description = DEFAULT_DESCRIPTION,
}) => {
  const router = useRouter();
  const [selected, setSelected] = React.useState<ReviewOption['id']>('website');
  const groupLabelId = React.useId();

  const selectedOption: ReviewOption = REVIEW_OPTIONS.find((option) => option.id === selected) ?? {
    id: 'website',
    title: 'Public Website',
    subtitle: 'Review any live website',
    icon: Globe,
    href: '/review/website',
  };

  const handleContinue = (): void => {
    router.push(selectedOption.href);
  };

  return (
    <header className="relative w-full overflow-hidden bg-background px-5 pb-16 pt-16 text-text-primary sm:px-8 sm:pb-20 sm:pt-24">
      {/* Decorative contour lines, bottom-left — purely visual. */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-24 -z-10 h-[420px] w-[420px] text-primary/[0.07]"
        fill="none"
        viewBox="0 0 400 400"
      >
        {Array.from({ length: 9 }).map((_, i) => (
          <path
            key={i}
            d={`M0 ${300 - i * 26} Q 120 ${230 - i * 24}, 220 ${300 - i * 22} T 420 ${260 - i * 20}`}
            stroke="currentColor"
            strokeWidth="1.5"
          />
        ))}
      </svg>
      {/* Soft brand glow behind the headline. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px] bg-[radial-gradient(55%_60%_at_50%_0%,hsl(var(--primary)/0.06),transparent_70%)]"
      />

      <div className="mx-auto flex w-full max-w-4xl flex-col items-center text-center">
        {/* Headline */}
        <h1 className="mt-4 font-display text-h1 font-bold leading-[1.08] tracking-tight sm:mt-8 sm:text-display">
          Explore your product <span className="text-primary">before</span> your users do.
        </h1>

        {/* Positioning line */}
        <p className="mt-5 text-body font-medium text-text-secondary sm:text-h6">{tagline}</p>

        {/* Supporting description */}
        <p className="mt-3 max-w-xl text-caption leading-relaxed text-text-muted sm:text-body">
          {description}
        </p>

        {/* Selector panel */}
        <section
          aria-labelledby={groupLabelId}
          className="mt-10 w-full max-w-3xl rounded-2xl border border-border/70 bg-surface-elevated p-5 shadow-[0_1px_2px_rgba(10,14,39,0.04),0_12px_32px_-16px_rgba(10,14,39,0.12)] sm:mt-12 sm:p-7"
        >
          <h2
            className="font-display text-body font-semibold text-text-primary sm:text-h6"
            id={groupLabelId}
          >
            What would you like SONDA to review?
          </h2>

          <div
            aria-labelledby={groupLabelId}
            className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
            role="radiogroup"
          >
            {REVIEW_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isSelected = option.id === selected;
              return (
                <button
                  key={option.id}
                  aria-checked={isSelected}
                  className={[
                    'group rounded-xl border text-left transition-all duration-200 ease-out',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                    isSelected
                      ? 'border-primary bg-primary-soft/70 shadow-[0_0_0_1px_hsl(var(--primary))]'
                      : 'border-border bg-surface-elevated hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md',
                    // Mobile: row layout. Desktop: stacked, centered tile.
                    'flex items-center gap-3 px-4 py-3 lg:flex-col lg:items-center lg:gap-2.5 lg:px-3 lg:py-5 lg:text-center',
                  ].join(' ')}
                  role="radio"
                  type="button"
                  onClick={() => setSelected(option.id)}
                >
                  <span
                    aria-hidden="true"
                    className={[
                      'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors',
                      isSelected
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-border/70 bg-surface text-text-secondary group-hover:text-primary',
                    ].join(' ')}
                  >
                    <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col lg:flex-none">
                    <span className="font-display text-caption font-semibold text-text-primary">
                      {option.title}
                    </span>
                    <span className="mt-0.5 hidden text-[12px] leading-snug text-text-muted lg:block">
                      {option.subtitle}
                    </span>
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-text-muted lg:hidden"
                  />
                </button>
              );
            })}
          </div>

          <Button
            aria-label={`Continue with ${selectedOption.title}`}
            className="mt-6 w-full sm:mx-auto sm:flex sm:max-w-xs"
            size="lg"
            type="button"
            variant="primary"
            onClick={handleContinue}
          >
            Continue
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Button>
        </section>

        {/* Trust line */}
        <ul
          aria-label="Who SONDA is for"
          className="mt-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-caption text-text-muted"
        >
          {TRUST_ITEMS.map((item, idx) => (
            <li key={item} className="inline-flex items-center gap-3">
              {idx > 0 ? (
                <span aria-hidden="true" className="h-1 w-1 rounded-full bg-border" />
              ) : null}
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </header>
  );
};

export { Hero };
