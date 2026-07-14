/**
 * components/landing/footer.tsx — Landing page footer.
 *
 * A single, calm footer that closes the page. It carries:
 *  - The SONDA brand mark (logo + product name) and tagline.
 *  - A short list of utility links (GitHub, Documentation, Contact).
 *  - A copyright line and a quiet hackathon attribution.
 *
 * Design
 *  - Sits at the bottom of the landing page, hairline top border to
 *    separate it from the Features section above.
 *  - Mirrors the centered max-width container used by the other
 *    landing sections so the column rhythm is continuous.
 *  - Premium minimal: surface background, no gradients, no glow.
 *  - The hackathon attribution is intentionally low-contrast (text-muted
 *    + a small badge) so it credits the event without dominating.
 *
 * Layout
 *  - Two columns on desktop: brand block on the left, links on the right.
 *  - Stacks vertically on mobile, brand on top, links below.
 *  - Copyright + attribution sit on a single row at the bottom.
 *
 * Accessibility
 *  - Wrapped in a semantic <footer> element.
 *  - Links are real <a href> targets (opens in a new tab where
 *    appropriate, with rel="noopener noreferrer").
 *  - The OKX mark is rendered as text in a small badge, not an image, so
 *    it stays accessible without depending on a brand asset.
 */

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Github, BookText, Mail } from 'lucide-react';

export interface FooterLink {
  /** Visible label. */
  label: string;
  /** Destination URL. */
  href: string;
  /** Lucide icon shown next to the label. */
  icon: LucideIcon;
  /** Open in a new tab. Defaults to true for external links. */
  external?: boolean;
}

const DEFAULT_LINKS: FooterLink[] = [
  {
    label: 'GitHub',
    href: 'https://github.com/hasbunallah01/SONDA',
    icon: Github,
    external: true,
  },
  {
    label: 'Documentation',
    href: 'https://github.com/hasbunallah01/SONDA#readme',
    icon: BookText,
    external: true,
  },
  {
    label: 'Contact',
    href: 'mailto:team@sonda.app',
    icon: Mail,
    external: true,
  },
];

export interface FooterProps {
  /** Override the tagline shown under the brand mark. */
  tagline?: string;
  /** Override the utility links. */
  links?: FooterLink[];
  /** Override the copyright text. */
  copyright?: string;
  /** Override the hackathon attribution. */
  attribution?: string;
}

const DEFAULT_TAGLINE = 'An Autonomous AI Product Launch Jury';
const DEFAULT_COPYRIGHT = `© ${new Date().getFullYear()} SONDA. All rights reserved.`;
const DEFAULT_ATTRIBUTION = 'Built for OKX AI Genesis Hackathon';

const Footer: React.FC<FooterProps> = ({
  tagline = DEFAULT_TAGLINE,
  links = DEFAULT_LINKS,
  copyright = DEFAULT_COPYRIGHT,
  attribution = DEFAULT_ATTRIBUTION,
}) => {
  return (
    <footer className="relative w-full border-t border-border/60 bg-background px-6 py-12 text-text-primary sm:py-14">
      <div className="mx-auto w-full max-w-6xl">
        {/* Main row: brand + links */}
        <div className="flex flex-col items-start gap-10 sm:flex-row sm:items-start sm:justify-between sm:gap-12">
          {/* Brand block */}
          <div className="flex max-w-sm flex-col items-start gap-4">
            <Link
              aria-label="SONDA — go to top of page"
              className="inline-flex items-center gap-2.5"
              href="/"
            >
              <Image
                alt=""
                aria-hidden="true"
                className="h-8 w-8"
                height={32}
                src="/logos/sonda-icon-64.png"
                width={32}
              />
              <span className="font-display text-body font-semibold tracking-tight text-text-primary sm:text-h6">
                SONDA
              </span>
            </Link>
            <p className="text-caption leading-relaxed text-text-secondary sm:text-body">
              {tagline}
            </p>
          </div>

          {/* Links */}
          <nav aria-label="Footer">
            <ul className="flex flex-col gap-3 sm:items-end">
              {links.map((link) => {
                const Icon = link.icon;
                const isExternal =
                  link.external ??
                  (link.href.startsWith('http') || link.href.startsWith('mailto:'));
                return (
                  <li key={link.label}>
                    <Link
                      aria-label={link.label}
                      className="group inline-flex items-center gap-2 text-caption text-text-secondary transition-colors duration-200 hover:text-text-primary sm:text-body"
                      href={link.href}
                      rel={isExternal ? 'noopener noreferrer' : undefined}
                      target={isExternal ? '_blank' : undefined}
                    >
                      <Icon
                        aria-hidden={true}
                        className="h-4 w-4 text-text-muted transition-colors duration-200 group-hover:text-primary"
                      />

                      <span>{link.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        {/* Bottom row: copyright + attribution */}
        <div className="mt-10 flex flex-col items-start gap-3 border-t border-border/60 pt-6 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p className="text-caption text-text-muted">{copyright}</p>
          <span
            aria-label={attribution}
            className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/40 px-3 py-1 font-display text-caption font-medium text-text-muted"
          >
            <span
              aria-hidden="true"
              className="font-display font-semibold tracking-wider text-text-secondary"
            >
              OKX
            </span>
            <span aria-hidden="true" className="h-3 w-px bg-border" />
            <span>AI Genesis Hackathon</span>
          </span>
        </div>
      </div>
    </footer>
  );
};

export { Footer };
