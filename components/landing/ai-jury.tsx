/**
 * components/landing/ai-jury.tsx — "Meet the AI Jury" landing section.
 *
 * A responsive grid of the six AI reviewers that compose the SONDA jury.
 * Each card uses the existing Card primitive and the same soft icon tile
 * treatment as the How It Works section, so the page reads as a single
 * coherent product.
 *
 * Layout
 *  - 1 column on mobile, 2 on tablet, 3 on desktop.
 *  - Section header mirrors the other landing sections: eyebrow, title,
 *    supporting description.
 *
 * Design
 *  - Premium minimal: hairline borders, surface-elevated background,
 *    one-line per role, single-icon tile, no fake ratings or scores.
 *  - Per-role icon sits in a small brand-tinted square (primary-soft),
 *    consistent with the How It Works step icons.
 *
 * Accessibility
 *  - Semantic <section> + <h2> tied together via aria-labelledby.
 *  - Each card remains a passive <article> (Card primitive).
 *  - Decorative icon is aria-hidden inside its tile.
 */

'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { LineChart, Megaphone, Sparkles, TestTube2, Trophy, UserPlus } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export interface AiReviewer {
  /** Display name of the reviewer (e.g. "Avery Chen — QA Engineer"). */
  name: string;
  /** Role label shown prominently under the name. */
  role: string;
  /** One-line description of what this reviewer focuses on. */
  description: string;
  /** Lucide icon component used as the reviewer's mark. */
  icon: LucideIcon;
}

const DEFAULT_REVIEWERS: AiReviewer[] = [
  {
    name: 'Maya Okonkwo',
    role: 'QA Engineer',
    description:
      'Hunts for broken flows, missing states, and edge cases — the things that quietly kill trust after launch.',
    icon: TestTube2,
  },
  {
    name: 'Theo Park',
    role: 'First-Time User',
    description:
      'Walks in cold and judges the product in 60 seconds — clarity, value, and "do I get it?"',
    icon: UserPlus,
  },
  {
    name: 'Ines Marchetti',
    role: 'UX Designer',
    description:
      'Pressure-tests the interface for hierarchy, friction, and whether the design actually matches the intent.',
    icon: Sparkles,
  },
  {
    name: 'Daniel Reyes',
    role: 'Marketing Expert',
    description:
      'Reads the positioning, hook, and story — and tells you whether anyone outside the building will care.',
    icon: Megaphone,
  },
  {
    name: 'Priya Shah',
    role: 'Investor',
    description:
      'Looks past the demo at the market, the model, and the story — and asks if this is fundable.',
    icon: LineChart,
  },
  {
    name: 'Marcus Vela',
    role: 'Hackathon Judge',
    description:
      'Scores the work like a tight-timeline judge: ambition, execution, and a clear, memorable moment.',
    icon: Trophy,
  },
];

export interface AiJuryProps {
  /** Eyebrow text above the section title. */
  eyebrow?: string;
  /** Section title. */
  title?: string;
  /** Optional supporting copy under the section title. */
  description?: string;
  /** Override the six reviewers. */
  reviewers?: AiReviewer[];
}

const AiJury: React.FC<AiJuryProps> = ({
  eyebrow = 'The jury',
  title = 'Meet the AI reviewers behind every verdict',
  description = 'Six focused perspectives, one shared standard. Each reviewer interrogates your product through a different lens — and SONDA weighs them all before it answers.',
  reviewers = DEFAULT_REVIEWERS,
}) => {
  // Stable id for aria-labelledby — survives SSR and re-renders.
  const titleId = React.useId();

  return (
    <section
      aria-labelledby={titleId}
      className="relative w-full bg-background px-6 py-20 text-text-primary sm:py-24"
    >
      <div className="mx-auto w-full max-w-6xl">
        {/* Section header */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-display text-caption font-semibold uppercase tracking-widest text-text-secondary">
            {eyebrow}
          </p>
          <h2
            className="mt-3 font-display text-h2 font-semibold leading-tight tracking-tight sm:text-h1"
            id={titleId}
          >
            {title}
          </h2>
          <p className="mt-4 text-body leading-relaxed text-text-secondary sm:text-lg">
            {description}
          </p>
        </div>

        {/* Reviewers grid */}
        <ul
          aria-label="SONDA AI reviewers"
          className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3"
        >
          {reviewers.map((reviewer) => {
            const Icon = reviewer.icon;
            return (
              <li key={`${reviewer.role}-${reviewer.name}`} className="h-full">
                <Card className="h-full">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary-soft text-primary"
                      >
                        <Icon className="h-5 w-5" strokeWidth={2} />
                      </span>
                      <span
                        aria-hidden="true"
                        className="font-display text-caption font-semibold uppercase tracking-widest text-text-muted"
                      >
                        {reviewer.role}
                      </span>
                    </div>
                    <CardTitle as="h3" className="mt-4 text-h5">
                      {reviewer.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-body leading-relaxed text-text-secondary">
                      {reviewer.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};

export { AiJury };
