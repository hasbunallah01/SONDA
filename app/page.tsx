/**
 * app/page.tsx — Root entry page.
 *
 * Currently renders only the landing-page Hero. Navigation, Features,
 * FAQ, Footer, and other sections will be added in subsequent tasks.
 */

import { Hero } from '@/components/landing/hero';

export default function HomePage() {
  return <Hero />;
}
