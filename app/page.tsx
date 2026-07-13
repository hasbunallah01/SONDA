/**
 * app/page.tsx — Root entry page.
 *
 * Renders the landing-page sections in order. The Navigation is mounted
 * in app/layout.tsx (shared across routes). Additional sections will be
 * added in subsequent tasks.
 */

import { Hero } from '@/components/landing/hero';
import { HowItWorks } from '@/components/landing/how-it-works';

export default function HomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />
    </>
  );
}
