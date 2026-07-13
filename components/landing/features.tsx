/**
 * components/landing/features.tsx — "Core capabilities" landing section.
 *
 * Four cards laying out the core capabilities that make SONDA a launch
 * jury, not just a review tool. The fourth card also embeds a small
 * "input sources" sub-grid so the four supported intake channels sit
 * visually anchored to the capability that needs them.
 *
 * Layout
 *  - Section header mirrors the other landing sections: eyebrow, title,
 *    supporting description.
 *  - 1 column on mobile, 2 columns from tablet up.
 *
 * Design
 *  - Premium minimal: hairline borders, surface-elevated background,
 *    no gradients, no fake ratings.
 *  - Each top-level feature uses the same icon-tile treatment (brand
 *    tinted primary-soft) as the How It Works and AI Jury sections, so
 *    the page reads as one coherent product.
 *  - Input sources inside the fourth card are listed as a compact 2x2
 *    grid of mini-tiles, each with its own icon, label, and one-line
 *    description.
 *
 * Accessibility
 *  - Semantic <section> + <h2> tied together via aria-labelledby.
 *  - Each top-level card is a Card primitive <article> / <section>.
 *  - All decorative icons are aria-hidden.
 */

'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Bot, Compass, FolderArchive, Github, Globe, Lock, Users } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export interface InputSource {
  /** Display label (e.g. "Website"). */
  label: string;
  /** One-line description of what SONDA does with this source. */
  description: string;
  /** Lucide icon component. Decorative (aria-hidden). */
  icon: LucideIcon;
}

export interface Feature {
  /** Lucide icon component. Decorative (aria-hidden). */
  icon: LucideIcon;
  /** Feature title. */
  title: string;
  /** One-line description of the capability. */
  description: string;
  /** Optional list of intake sources rendered as a sub-grid. */
  inputSources?: InputSource[];
}

const DEFAULT_FEATURES: Feature[] = [
  {
    icon: Bot,
    title: 'Autonomous browser investigation',
    description:
      'SONDA opens your product like a real user would — clicking through flows, reading pages, and capturing evidence before any verdict is formed.',
  },
  {
    icon: Users,
    title: 'Multi-agent expert review',
    description:
      'A panel of focused AI reviewers evaluates the product from independent perspectives, so the final answer is a consensus, not a single opinion.',
  },
  {
    icon: Compass,
    title: 'Launch verdict',
    description:
      'One clear readiness decision — Ship, Refine, or Hold — backed by a single score and the evidence the jury collected along the way.',
  },
  {
    icon: FolderArchive,
    title: 'Multiple input sources',
    description:
      'Hand SONDA whatever you have ready. It accepts the surface area you already built so the jury can get to work immediately.',
    inputSources: [
      {
        label: 'Website',
        description: 'A live public URL SONDA can navigate end-to-end.',
        icon: Globe,
      },
      {
        label: 'GitHub repository',
        description: 'A public repo for code-level evidence and structure.',
        icon: Github,
      },
      {
        label: 'ZIP project',
        description: 'A packaged snapshot of your latest build.',
        icon: FolderArchive,
      },
      {
        label: 'Private website',
        description: 'A gated URL with the credentials SONDA needs to enter.',
        icon: Lock,
      },
    ],
  },
];

export interface FeaturesProps {
  /** Eyebrow text above the section title. */
  eyebrow?: string;
  /** Section title. */
  title?: string;
  /** Optional supporting copy under the section title. */
  description?: string;
  /** Override the four core features. */
  features?: Feature[];
}

const Features: React.FC<FeaturesProps> = ({
  eyebrow = 'Core capabilities',
  title = 'Everything SONDA does before you ship',
  description = 'Four capabilities, working together: an agent that investigates on its own, a jury that disagrees productively, a verdict you can act on, and the inputs that meet you where you are.',
  features = DEFAULT_FEATURES,
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

        {/* Features grid */}
        <ul
          aria-label="SONDA core capabilities"
          className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6"
        >
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <li key={feature.title} className="h-full">
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
                        Capability
                      </span>
                    </div>
                    <CardTitle as="h3" className="mt-4 text-h5">
                      {feature.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-body leading-relaxed text-text-secondary">
                      {feature.description}
                    </CardDescription>

                    {feature.inputSources && feature.inputSources.length > 0 ? (
                      <ul
                        aria-label={`${feature.title} input sources`}
                        className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2"
                      >
                        {feature.inputSources.map((source) => {
                          const SourceIcon = source.icon;
                          return (
                            <li
                              key={source.label}
                              className="flex items-start gap-3 rounded-md border border-border/60 bg-background/40 p-3"
                            >
                              <span
                                aria-hidden="true"
                                className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary"
                              >
                                <SourceIcon className="h-4 w-4" strokeWidth={2} />
                              </span>
                              <span className="flex min-w-0 flex-col">
                                <span className="font-display text-caption font-semibold text-text-primary">
                                  {source.label}
                                </span>
                                <span className="mt-0.5 text-caption leading-snug text-text-secondary">
                                  {source.description}
                                </span>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
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

export { Features };
