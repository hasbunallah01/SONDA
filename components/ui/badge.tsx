/**
 * components/ui/badge.tsx — Badge primitive.
 *
 * Compact label for status, categories, scores, and tags.
 * Designed to be used inline in body text, inside Cards, or on its own.
 *
 * Variants
 *  - default     neutral pill
 *  - primary     brand indigo — for SONDA-specific labels
 *  - secondary   deep navy — for high-emphasis tags
 *  - success     review status: passed / approved
 *  - warning     review status: needs attention
 *  - error       review status: failed / blocked
 *  - outline     transparent with a border — for categorization
 *
 * Sizes: sm | md
 * Optional `dot` renders a small status dot in the leading edge.
 *
 * Accessibility
 *  - Renders a <span> by default (not interactive).
 *  - For interactive badges, pass `asChild` to forward to a real <button>
 *    or <Link> — focus styles then come from the global focus-visible rule.
 */

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  // Base
  [
    'inline-flex items-center gap-1.5',
    'whitespace-nowrap select-none',
    'font-sans font-medium',
    'rounded-full',
    'border',
    'transition-colors duration-150 ease-out',
  ],
  {
    variants: {
      variant: {
        default: ['bg-muted text-text-primary', 'border-transparent'],
        primary: ['bg-primary-soft text-primary', 'border-primary/20'],
        secondary: ['bg-secondary text-secondary-foreground', 'border-transparent'],
        success: ['bg-success/10 text-success', 'border-success/25'],
        warning: ['bg-warning/10 text-warning', 'border-warning/25'],
        error: ['bg-error/10 text-error', 'border-error/25'],
        outline: ['bg-transparent text-text-secondary', 'border-border', 'hover:text-text-primary'],
      },
      size: {
        sm: 'h-5 px-2 text-xs',
        md: 'h-6 px-2.5 text-caption',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /** Render as a child element (e.g. <Link>, <button>) to make it interactive. */
  asChild?: boolean;
  /** Show a small status dot in the leading edge. */
  dot?: boolean;
  /** Override the dot color when `dot` is true. Defaults to currentColor. */
  dotClassName?: string;
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  (
    { className, variant, size, asChild = false, dot = false, dotClassName, children, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'span';

    return (
      <Comp
        ref={ref as React.Ref<HTMLSpanElement>}
        className={cn(badgeVariants({ variant, size, className }))}
        {...props}
      >
        {dot ? (
          <span
            aria-hidden="true"
            className={cn('inline-block size-1.5 rounded-full', 'bg-current', dotClassName)}
          />
        ) : null}
        {children}
      </Comp>
    );
  },
);
Badge.displayName = 'Badge';

export { Badge, badgeVariants };
