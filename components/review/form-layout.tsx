/**
 * components/review/form-layout.tsx — Shared intake-page layout.
 *
 * The reference's "Review a Public Website" screen: a back link, a
 * two-line title with the subject in brand indigo, the form on the left,
 * and a soft decorative browser illustration on the right (hidden on
 * mobile, where the form stacks full-width).
 *
 * Purely presentational — the pages own their forms, state, and API calls.
 */

import * as React from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';

export interface ReviewFormLayoutProps {
  /** First title line, e.g. "Review a". */
  titleLead?: string;
  /** Second title line rendered in brand indigo, e.g. "Public Website". */
  titleSubject: string;
  /** Icon drawn inside the decorative illustration. */
  illustrationIcon: LucideIcon;
  /** The form column. */
  children: React.ReactNode;
  /** Optional aria id for the <h1>. */
  titleId?: string;
}

const ReviewFormLayout: React.FC<ReviewFormLayoutProps> = ({
  titleLead = 'Review a',
  titleSubject,
  illustrationIcon: IllustrationIcon,
  children,
  titleId,
}) => {
  return (
    <main className="relative w-full bg-background px-5 py-10 text-text-primary sm:px-8 sm:py-14">
      <div className="mx-auto w-full max-w-6xl">
        {/* Back link */}
        <div className="mb-8 sm:mb-10">
          <Button
            aria-label="Back to review setup"
            asChild={true}
            className="rounded-full"
            size="sm"
            variant="outline"
          >
            <Link href="/review">
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              <span>Back</span>
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-16">
          {/* Form column */}
          <div>
            <h1
              className="font-sans text-h2 font-bold leading-[1.12] tracking-tight sm:text-h1"
              id={titleId}
            >
              {titleLead}
              <br />
              <span className="text-primary">{titleSubject}</span>
            </h1>
            <div className="mt-8">{children}</div>
          </div>

          {/* Decorative illustration — desktop only */}
          <div aria-hidden="true" className="relative hidden min-h-[26rem] lg:block">
            <div className="absolute inset-0 rounded-3xl bg-[radial-gradient(70%_70%_at_50%_40%,hsl(var(--primary)/0.08),transparent_75%)]" />
            {/* Browser window */}
            <div className="absolute left-1/2 top-1/2 w-[26rem] -translate-x-1/2 -translate-y-1/2 rotate-1 rounded-2xl border border-border/70 bg-surface-elevated shadow-[0_24px_60px_-24px_rgba(10,14,39,0.25)]">
              <div className="flex items-center gap-1.5 border-b border-border/60 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-primary/50" />
                <span className="h-2.5 w-2.5 rounded-full bg-primary/30" />
                <span className="h-2.5 w-2.5 rounded-full bg-primary/20" />
              </div>
              <div className="space-y-3 p-6">
                <div className="h-3 w-2/3 rounded-full bg-muted" />
                <div className="h-3 w-1/2 rounded-full bg-muted" />
                <div className="h-3 w-3/5 rounded-full bg-muted" />
                <div className="mt-5 flex items-end gap-2 pt-3">
                  <div className="h-10 w-6 rounded-md bg-primary/15" />
                  <div className="h-16 w-6 rounded-md bg-primary/25" />
                  <div className="h-12 w-6 rounded-md bg-primary/20" />
                  <div className="h-20 w-6 rounded-md bg-primary/40" />
                </div>
              </div>
            </div>
            {/* Floating badge with the source icon */}
            <div className="absolute left-[62%] top-[28%] flex h-20 w-20 items-center justify-center rounded-2xl border border-border/70 bg-surface-elevated shadow-[0_16px_40px_-16px_rgba(10,14,39,0.3)]">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <IllustrationIcon className="h-6 w-6" strokeWidth={2} />
              </span>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

export { ReviewFormLayout };
