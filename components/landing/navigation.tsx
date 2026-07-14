/**
 * components/landing/navigation.tsx — Top-of-page navigation bar.
 *
 * Matches the reference design:
 *   Desktop:  [ logo ]            Docs · About · GitHub · SONDA(wordmark)
 *   Mobile:   [ ☰ ]                                       SONDA(wordmark)
 *
 * Design
 *  - Sticky, translucent surface + backdrop blur, hairline bottom border.
 *  - Quiet text links; the SONDA wordmark anchors the right edge.
 *  - Mobile: hamburger opens a slide-down panel with the same links plus
 *    the primary "Start Investigation" action.
 *
 * Accessibility
 *  - Semantic <nav> with aria-label; the toggle is a real <button> with
 *    aria-expanded / aria-controls; Escape closes the panel.
 */

'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, Menu, X } from 'lucide-react';

import { Button } from '@/components/ui/button';

export interface NavigationProps {
  /** Optional override for the primary CTA label (mobile panel). */
  ctaLabel?: string;
  /** Href for the primary CTA. Defaults to "/review". */
  ctaHref?: string;
  /** Href for the brand anchor. Defaults to "/". */
  homeHref?: string;
}

interface NavLink {
  label: string;
  href: string;
  external?: boolean;
}

const NAV_LINKS: NavLink[] = [
  { label: 'Docs', href: 'https://github.com/hasbunallah01/SONDA#readme', external: true },
  { label: 'About', href: '/#how-it-works' },
  { label: 'GitHub', href: 'https://github.com/hasbunallah01/SONDA', external: true },
];

const Navigation: React.FC<NavigationProps> = ({
  ctaLabel = 'Start Investigation',
  ctaHref = '/review',
  homeHref = '/',
}) => {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  const panelId = React.useId();

  // Close the mobile panel on route change and on Escape.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <nav
      aria-label="Primary"
      className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70"
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        {/* Left slot — hamburger (mobile only); desktop left is empty, per the reference */}
        <div className="flex items-center">
          <button
            aria-controls={panelId}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-text-primary transition-colors hover:bg-muted md:hidden"
            type="button"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? (
              <X aria-hidden="true" className="h-5 w-5" />
            ) : (
              <Menu aria-hidden="true" className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Right slot — links + wordmark, like the reference */}
        <div className="flex items-center gap-6 sm:gap-8">
          <ul className="hidden items-center gap-6 md:flex lg:gap-8">
            {NAV_LINKS.map((link) => (
              <li key={link.label}>
                <Link
                  className="text-caption font-medium text-text-secondary transition-colors duration-200 hover:text-text-primary"
                  href={link.href}
                  rel={link.external ? 'noopener noreferrer' : undefined}
                  target={link.external ? '_blank' : undefined}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            aria-label="SONDA — go to home"
            className="rounded-md font-display text-body font-bold uppercase tracking-[0.28em] text-text-primary outline-none"
            href={homeHref}
          >
            SONDA
          </Link>
        </div>
      </div>

      {/* Mobile slide-down panel */}
      <div
        className={[
          'md:hidden',
          'grid overflow-hidden border-border/60 transition-[grid-template-rows,opacity] duration-300 ease-out',
          open ? 'grid-rows-[1fr] border-t opacity-100' : 'grid-rows-[0fr] opacity-0',
        ].join(' ')}
        id={panelId}
      >
        <div className="min-h-0">
          <ul className="flex flex-col gap-1 px-5 py-4">
            {NAV_LINKS.map((link) => (
              <li key={link.label}>
                <Link
                  className="block rounded-md px-3 py-2.5 text-body font-medium text-text-secondary transition-colors hover:bg-muted hover:text-text-primary"
                  href={link.href}
                  rel={link.external ? 'noopener noreferrer' : undefined}
                  tabIndex={open ? 0 : -1}
                  target={link.external ? '_blank' : undefined}
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li className="mt-2 px-3 pb-1">
              <Button asChild={true} className="w-full" size="md" variant="primary">
                <Link href={ctaHref} tabIndex={open ? 0 : -1} onClick={() => setOpen(false)}>
                  {ctaLabel}
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </Button>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
};

export { Navigation };
