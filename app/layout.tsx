/**
 * app/layout.tsx — Root layout.
 *
 * Minimal in this task. Real nav, footer, and providers land in the next phase.
 */

import type { Metadata } from 'next';
import './globals.css';

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
    <html suppressHydrationWarning lang="en">
      <body>{children}</body>
    </html>
  );
}
