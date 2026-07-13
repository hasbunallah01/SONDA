/**
 * components/ui/button.tsx — Button primitive.
 *
 * The single source of truth for clickable actions in SONDA.
 * Uses CVA for variants + sizes, Radix Slot for `asChild`,
 * and Lucide's Loader2 for the loading spinner.
 *
 * Variants:  primary | secondary | outline | ghost | destructive
 * Sizes:     sm | md | lg | icon
 * States:    default | hover | active | focus-visible | disabled | loading
 *
 * Accessibility
 *  - Renders a real <button> by default. With `asChild`, it forwards to
 *    the child element (e.g. <Link>) and inherits its semantics.
 *  - Disabled buttons set `aria-disabled` and `disabled` for screen readers.
 *  - Loading buttons expose `aria-busy="true"` and keep the original label
 *    in a visually hidden span so assistive tech still announces it.
 *  - Focus ring uses the global `:focus-visible` outline (see globals.css).
 */

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  // Base — shared by every variant/size.
  [
    'inline-flex items-center justify-center gap-2',
    'whitespace-nowrap select-none',
    'font-sans font-medium',
    'rounded-md', // 10px, matches --radius-md
    'transition-all duration-200 ease-out',
    // Interaction
    'active:scale-[0.98]',
    // Disabled
    'disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed',
    // Icon-only children
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-primary text-primary-foreground',
          'shadow-brand-sm',
          'hover:bg-primary-hover hover:shadow-brand-md',
        ],
        secondary: [
          'bg-secondary text-secondary-foreground',
          'shadow-xs',
          'hover:bg-secondary-hover',
        ],
        outline: [
          'border border-border bg-transparent text-text-primary',
          'hover:bg-muted hover:text-text-primary',
        ],
        ghost: ['bg-transparent text-text-primary', 'hover:bg-muted hover:text-text-primary'],
        destructive: ['bg-error text-error-foreground', 'shadow-sm', 'hover:bg-error/90'],
      },
      size: {
        sm: 'h-8 px-3 text-caption [&_svg]:size-3.5',
        md: 'h-10 px-4 text-body [&_svg]:size-4',
        lg: 'h-12 px-6 text-body [&_svg]:size-5',
        icon: 'size-10 p-0 [&_svg]:size-5',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Render as a child element (e.g. Next.js <Link>) while keeping button styles. */
  asChild?: boolean;
  /** Show a spinner, disable interactions, and announce aria-busy. */
  loading?: boolean;
  /** Optional icon to render before the label. Inherits currentColor. */
  leftIcon?: React.ReactNode;
  /** Optional icon to render after the label. Inherits currentColor. */
  rightIcon?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      disabled,
      leftIcon,
      rightIcon,
      children,
      type,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';
    const isDisabled = disabled || loading;
    // When `asChild` is true, `type` would be forwarded to a child that
    // might not accept it (e.g. <Link>). Only apply on the real <button>.
    const buttonType = asChild ? undefined : (type ?? 'button');

    return (
      <Comp
        ref={ref}
        aria-busy={loading || undefined}
        aria-disabled={isDisabled || undefined}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={isDisabled}
        type={buttonType}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 aria-hidden="true" className="animate-spin" data-testid="button-spinner" />
            <span className="sr-only">Loading</span>
            {/* Keep label visible for layout, but mark it aria-hidden to avoid
                duplicate announcements — the sr-only "Loading" + the live
                spinner cover the assistive feedback. */}
            <span aria-hidden="true">{children}</span>
          </>
        ) : (
          <>
            {leftIcon ? (
              <span aria-hidden="true" className="inline-flex">
                {leftIcon}
              </span>
            ) : null}
            {children}
            {rightIcon ? (
              <span aria-hidden="true" className="inline-flex">
                {rightIcon}
              </span>
            ) : null}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
