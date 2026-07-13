/**
 * components/landing/how-it-works.tsx — "How SONDA Works" landing section.
 *
 * A 4-step explainer that uses the existing Card primitive. Each step is
 * a self-contained card: an icon, a step number, a title, and a one-line
 * description. The grid is 1-col on mobile, 2-col on tablet, 4-col on
 * desktop, so the steps scale gracefully without ever feeling cramped.
 *
 * Design
 *  - Eyebrow + section title + optional description for the section.
 *  - Cards use the same Card primitive as the rest of the app, with the
 *    default hover lift intact.
 *  - Step number is a small pill in the brand-tinted "primary-soft" tone
 *    so it reads as a process marker, not a decoration.
 *
 * Accessibility
 *  - Wrapped in a semantic <section> with aria-labelledby pointing at
 *    the section title.
 *  - The decorative icon inside each card is aria-hidden.
 *  - Each card stays a passive <section> — no fake buttons.
 */

'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Compass, Microscope, Scale, Sparkles } from 'lucide-react';

// Import Card directly (not via the components/ui barrel) so this server
// component doesn't drag client-only primitives into the server bundle.
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export interface HowItWorksStep {
  /** Lucide icon component to render. Decorative (aria-hidden). */
  icon: LucideIcon;
  /** Step title. */
  title: string;
  /** One-line description of what happens at this step. */
  description: string;
}

const DEFAULT_STEPS: HowItWorksStep[] = [
  {
    icon: Sparkles,
    title: 'Submit your product',
    description:
      'Drop in a link, a deck, or a brief. SONDA treats it as the only source of truth and gets to work.',
  },
  {
    icon: Microscope,
    title: 'SONDA investigates',
    description:
      'A panel of AI agents autonomously explores the surface area, gathers evidence, and stress-tests your claims.',
  },
  {
    icon: Scale,
    title: 'AI experts review',
    description:
      'Each agent evaluates the product from a different expert perspective — strategy, design, growth, and more.',
  },
  {
    icon: Compass,
    title: 'Receive your Launch Verdict',
    description:
      'A single, trusted recommendation — Ship, Refine, or Hold — backed by the evidence the jury collected.',
  },
];

export interface HowItWorksProps {
  /** Eyebrow text above the section title. */
  eyebrow?: string;
  /** Section title. */
  title?: string;
  /** Optional supporting copy under the section title. */
  description?: string;
  /** Override the four steps. Defaults to the SONDA product flow. */
  steps?: HowItWorksStep[];
}

const HowItWorks: React.FC<HowItWorksProps> = ({
  eyebrow = 'How it works',
  title = 'From submission to verdict in four steps',
  description = 'SONDA runs the review your launch deserves — autonomously, transparently, and on a clock.',
  steps = DEFAULT_STEPS,
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

        {/* Steps grid */}
        <ol
          aria-label="How SONDA works, in four steps"
          className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4"
        >
          {steps.map((step, index) => {
            const Icon = step.icon;
            const stepNumber = index + 1;
            return (
              <li key={`${step.title}-${index}`} className="h-full">
                <Card className="h-full">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary-soft text-primary"
                      >
                        <Icon className="h-5 w-5" strokeWidth={2} />
                      </span>
                      <span
                        aria-hidden="true"
                        className="font-mono text-caption font-semibold uppercase tracking-widest text-text-muted"
                      >
                        Step {String(stepNumber).padStart(2, '0')}
                      </span>
                    </div>
                    <CardTitle as="h3" className="mt-4 text-h5">
                      {step.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-body leading-relaxed text-text-secondary">
                      {step.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
};

export { HowItWorks };
