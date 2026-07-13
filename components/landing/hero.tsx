/**
 * components/landing/hero.tsx — Hero section of the SONDA landing page.
 *
 * The first thing a visitor sees. Single, focused block: logo + product
 * name, tagline, short description, and the two launch CTAs. Nothing else.
 *
 * Layout
 *  - Centered, full-viewport hero with a soft brand-tinted background glow
 *    (subtle, no animations).
 *  - Logo sits above the wordmark so the brand reads as a unit.
 *  - Display heading is the tagline; the descriptive paragraph sits below
 *    at body size for scan-ability.
 *  - Two CTAs side by side: Primary "Start Investigation" (filled brand)
 *    and Secondary "Learn More" (outline ghost). Both render as <button>s;
 *    swap to <Button asChild><Link/></Button> once the routes exist.
 *
 * Accessibility
 *  - Semantic <header> + <h1> for the page title.
 *  - Decorative gradient background marked aria-hidden.
 *  - Buttons get visible focus rings via the global :focus-visible rule.
 *  - Sufficient color contrast against the surface for AA at all sizes.
 */

import * as React from 'react';
import Image from 'next/image';

// Import Button directly (not via the components/ui barrel) so this
// server component doesn't drag client-only primitives (Select, Checkbox,
// RadioGroup) into the server bundle.
import { Button } from '@/components/ui/button';

export interface HeroProps {
  /** Optional override for the headline (defaults to the SONDA tagline). */
  tagline?: string;
  /** Optional override for the supporting description copy. */
  description?: string;
  /** Primary CTA label. */
  primaryCtaLabel?: string;
  /** Secondary CTA label. */
  secondaryCtaLabel?: string;
  /** Optional click handler for the primary CTA. */
  onPrimaryClick?: () => void;
  /** Optional click handler for the secondary CTA. */
  onSecondaryClick?: () => void;
}

const DEFAULT_TAGLINE = 'An Autonomous AI Product Launch Jury';
const DEFAULT_DESCRIPTION =
  'SONDA autonomously explores your product, gathers evidence, evaluates it from multiple expert perspectives, and returns one trusted launch verdict — before you ship.';

const Hero: React.FC<HeroProps> = ({
  tagline = DEFAULT_TAGLINE,
  description = DEFAULT_DESCRIPTION,
  primaryCtaLabel = 'Start Investigation',
  secondaryCtaLabel = 'Learn More',
  onPrimaryClick,
  onSecondaryClick,
}) => {
  return (
    <header className="relative flex min-h-[100svh] w-full items-center justify-center overflow-hidden bg-background px-6 py-24 text-text-primary sm:py-28">
      {/* Decorative brand glow — purely visual, hidden from assistive tech. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,hsl(var(--primary)/0.12),transparent_70%)] bg-no-repeat [background-image:linear-gradient(to_bottom,transparent_0%,hsl(var(--background))_100%)] [background-size:100%_100%]"
      />

      <div className="mx-auto flex w-full max-w-3xl flex-col items-center text-center">
        {/* Logo + product name cluster */}
        <div className="flex flex-col items-center gap-4">
          <Image
            priority
            alt="SONDA logo"
            className="h-20 w-20 drop-shadow-sm sm:h-24 sm:w-24"
            height={96}
            src="/logos/sonda-icon-128.png"
            width={96}
          />
          <p className="font-display text-caption font-semibold uppercase tracking-widest text-text-secondary">
            SONDA
          </p>
        </div>

        {/* Headline — the tagline is the H1 of the page. */}
        <h1 className="mt-6 bg-gradient-brand bg-clip-text font-display text-h1 font-semibold leading-tight tracking-tight text-transparent sm:text-display">
          {tagline}
        </h1>

        {/* Supporting description */}
        <p className="mt-6 max-w-2xl text-body leading-relaxed text-text-secondary sm:text-lg">
          {description}
        </p>

        {/* CTAs */}
        <div className="mt-10 flex w-full flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <Button
            className="w-full sm:w-auto"
            size="lg"
            type="button"
            variant="primary"
            onClick={onPrimaryClick}
          >
            {primaryCtaLabel}
          </Button>
          <Button
            className="w-full sm:w-auto"
            size="lg"
            type="button"
            variant="outline"
            onClick={onSecondaryClick}
          >
            {secondaryCtaLabel}
          </Button>
        </div>
      </div>
    </header>
  );
};

export { Hero };
