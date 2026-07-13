/**
 * app/layout.tsx — Root layout.
 *
 * Hosts:
 *  - Google Fonts via next/font (Space Grotesk, Inter, JetBrains Mono)
 *  - Site-wide metadata
 *  - Global CSS
 *
 * No nav, no footer, no providers yet — those land in later tasks.
 */

import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google';

import './globals.css';

import { Navigation } from '@/components/landing/navigation';

/* ---------------------------------------------------------------------------
 * Font configuration
 *
 *   --font-sans        Inter        → body, UI, captions
 *   --font-display     Space Grotesk → display headings, H1–H6
 *   --font-mono        JetBrains Mono → code, monospaced UI
 *
 * All fonts are self-hosted by next/font — no runtime requests to Google.
 * Variable axes are enabled so weight can be tuned per token in CSS.
 * ------------------------------------------------------------------------- */

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
  weight: ['500', '600', '700'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: {
    default: 'SONDA — An Autonomous AI Product Launch Jury',
    template: '%s · SONDA',
  },
  description:
    'SONDA autonomously explores your product, gathers evidence, evaluates it from multiple expert perspectives, and returns one trusted launch verdict.',
  applicationName: 'SONDA',
  authors: [{ name: 'SONDA Team' }],
  keywords: [
    'SONDA',
    'product launch',
    'AI jury',
    'launch readiness',
    'product review',
    'autonomous AI',
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      suppressHydrationWarning
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
      lang="en"
    >
      <body>
        <Navigation />
        {children}
      </body>
    </html>
  );
}
