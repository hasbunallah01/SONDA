/**
 * app/review/page.tsx — Review setup page (frontend only).
 *
 * The first step in the SONDA flow: let the user choose what the jury
 * should investigate. Four review-type cards (Public Website, GitHub
 * Repository, Local Project ZIP, Private Website) are presented in a
 * responsive grid. Selecting a card highlights it and (in this static
 * build) routes to a placeholder per-type page.
 *
 * Design
 *  - Centered max-w container with the same eyebrow / title / description
 *    header used on the landing sections, so the page feels native to
 *    SONDA's visual system.
 *  - 1 column on mobile, 2 columns on tablet+. Each card uses the
 *    existing Card primitive and the same primary-soft icon tile as the
 *    other landing sections.
 *  - "Coming soon" is a small, low-contrast Badge so the disabled state
 *    is honest without looking like an error.
 *
 * Accessibility
 *  - Semantic <main> wrapping the page so it composes with the root
 *    layout's <Navigation />.
 *  - Each card is a <button> rendered via the Button primitive, so
 *    keyboard / focus / aria-disabled all work out of the box.
 *  - Status pills are read by assistive tech via aria-label on the
 *    Button.
 *
 * Out of scope (per task)
 *  - No backend, no API routes, no upload handling, no auth.
 *  - No browser automation. Selecting a card navigates to a per-type
 *    page that will be built in later tasks.
 */

'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Globe, Github, FolderArchive, Lock, ArrowRight } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type ReviewTypeStatus = 'available' | 'coming-soon';

export interface ReviewType {
  /** Stable id used in routes and selection state. */
  id: 'website' | 'github' | 'zip' | 'private-website';
  /** Display name shown as the card title. */
  name: string;
  /** One-line description of what gets submitted. */
  description: string;
  /** Lucide icon component. Decorative (aria-hidden). */
  icon: LucideIcon;
  /** Whether the option is selectable today. */
  status: ReviewTypeStatus;
  /** Short status text rendered as a Badge. */
  statusLabel: string;
  /** Destination route when the user selects an available option. */
  href: string;
}

const REVIEW_TYPES: ReviewType[] = [
  {
    id: 'website',
    name: 'Public Website',
    description:
      'Submit a website URL. SONDA will navigate it like a first-time user and collect evidence from every reachable page.',
    icon: Globe,
    status: 'available',
    statusLabel: 'Available',
    href: '/review/website',
  },
  {
    id: 'github',
    name: 'GitHub Repository',
    description:
      'Submit a public repository URL. SONDA will inspect the codebase for structure, signals, and craft.',
    icon: Github,
    status: 'available',
    statusLabel: 'Available',
    href: '/review/github',
  },
  {
    id: 'zip',
    name: 'Local Project ZIP',
    description:
      'Upload a packaged snapshot of your latest build. SONDA will unpack it and review the project as submitted.',
    icon: FolderArchive,
    status: 'available',
    statusLabel: 'Available',
    href: '/review/zip',
  },
  {
    id: 'private-website',
    name: 'Private Website',
    description:
      'URL plus the credentials SONDA needs to enter. Best for staging environments and behind-login products.',
    icon: Lock,
    status: 'coming-soon',
    statusLabel: 'Coming soon',
    href: '/review/private-website',
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
  title = 'Start a Product Investigation',
  description = 'Choose how SONDA should explore your product. Each option feeds the same jury — only the intake changes.',
  reviewTypes = REVIEW_TYPES,
}) => {
  return (
    <main className="relative w-full bg-background px-6 py-20 text-text-primary sm:py-24">
      <div className="mx-auto w-full max-w-5xl">
        {/* Page header — same pattern as the landing sections. */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-display text-caption font-semibold uppercase tracking-widest text-text-secondary">
            Review setup
          </p>
          <h1 className="mt-3 font-display text-h1 font-semibold leading-tight tracking-tight sm:text-display">
            {title}
          </h1>
          <p className="mt-4 text-body leading-relaxed text-text-secondary sm:text-lg">
            {description}
          </p>
        </div>

        {/* Review-type grid */}
        <ul
          aria-label="Available review types"
          className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6"
        >
          {reviewTypes.map((type) => {
            const Icon = type.icon;
            const isAvailable = type.status === 'available';

            return (
              <li key={type.id} className="h-full">
                <Card
                  className={['h-full', !isAvailable && 'opacity-90'].filter(Boolean).join(' ')}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <span
                        aria-hidden="true"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary-soft text-primary"
                      >
                        <Icon className="h-5 w-5" strokeWidth={2} />
                      </span>
                      <Badge
                        aria-label={`Status: ${type.statusLabel}`}
                        variant={isAvailable ? 'default' : 'secondary'}
                      >
                        {type.statusLabel}
                      </Badge>
                    </div>
                    <CardTitle as="h2" className="mt-4 text-h4">
                      {type.name}
                    </CardTitle>
                  </CardHeader>

                  <CardContent className="flex h-full flex-col">
                    <CardDescription className="text-body leading-relaxed text-text-secondary">
                      {type.description}
                    </CardDescription>

                    <div className="mt-6 flex items-center">
                      <Button
                        // For now we navigate with a plain <a>-style href via
                        // asChild so the click is a real navigation. The
                        // per-type destination pages will be built later.
                        aria-label={
                          isAvailable ? `Select ${type.name}` : `${type.name} is coming soon`
                        }
                        asChild={isAvailable}
                        className="w-full sm:w-auto"
                        disabled={!isAvailable}
                        size="md"
                        variant={isAvailable ? 'primary' : 'outline'}
                      >
                        {isAvailable ? (
                          <a href={type.href}>
                            Select
                            <ArrowRight aria-hidden="true" className="h-4 w-4" />
                          </a>
                        ) : (
                          <span>Coming soon</span>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
};

export default ReviewSetupPage;
