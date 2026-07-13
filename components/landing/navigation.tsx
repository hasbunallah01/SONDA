/**
 * components/landing/navigation.tsx — Top-of-page navigation bar.
 *
 * A single, sticky bar with three slots:
 *   [ Logo + product name ]   …   [ Start Investigation ]
 *
 * Design
 *  - Sticky to the top of the viewport with a translucent surface +
 *    backdrop blur so content scrolls behind it cleanly.
 *  - Hairline bottom border to separate from page content.
 *  - Sits inside a centered max-width container, matching the Hero.
 *  - Logo + product name act as a single brand anchor (the eventual home
 *    link); CTA lives on the right.
 *
 * Responsive
 *  - On small screens the logo shrinks and the CTA label can be hidden
 *    (icon-only) to keep the bar compact.
 *
 * Accessibility
 *  - Wrapped in a semantic <nav> with aria-label.
 *  - The brand anchor carries a real <a href> so keyboard users can
 *    activate it; the CTA is a real <button> until the route exists.
 *  - Focus styles come from the global :focus-visible rule.
 */

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

export interface NavigationProps {
  /** Optional override for the primary CTA label. */
  ctaLabel?: string;
  /** Optional click handler for the primary CTA. */
  onCtaClick?: () => void;
  /** Href for the brand anchor. Defaults to "/". */
  homeHref?: string;
}

const DEFAULT_CTA = 'Start Investigation';

const Navigation: React.FC<NavigationProps> = ({
  ctaLabel = DEFAULT_CTA,
  onCtaClick,
  homeHref = '/',
}) => {
  return (
    <nav
      aria-label="Primary"
      className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/70 backdrop-blur-md supports-[backdrop-filter]:bg-background/60"
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-6">
        {/* Brand anchor — logo + product name */}
        <Link
          aria-label="SONDA — go to home"
          className="group inline-flex items-center gap-2.5 rounded-md outline-none"
          href={homeHref}
        >
          <Image
            priority
            alt=""
            className="h-7 w-7 sm:h-8 sm:w-8"
            height={32}
            src="/logos/sonda-icon-128.png"
            width={32}
          />
          <span className="font-display text-body font-semibold tracking-tight text-text-primary sm:text-h6">
            SONDA
          </span>
        </Link>

        {/* Primary CTA */}
        <Button
          className="hidden sm:inline-flex"
          size="sm"
          type="button"
          variant="primary"
          onClick={onCtaClick}
        >
          {ctaLabel}
        </Button>
        <Button
          aria-label={ctaLabel}
          className="sm:hidden"
          size="icon"
          type="button"
          variant="primary"
          onClick={onCtaClick}
        >
          {/* Up-arrow glyph doubles as a compact "go" cue. */}
          <span aria-hidden="true" className="font-bold leading-none">
            →
          </span>
        </Button>
      </div>
    </nav>
  );
};

export { Navigation };
