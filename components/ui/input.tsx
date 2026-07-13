/**
 * components/ui/input.tsx — Input primitive.
 *
 * Single-line text input. Composes naturally with the Form primitives
 * (Label, helper text, error message) via `aria-describedby`.
 *
 * Variants
 *  - default    neutral bordered input
 *  - filled     soft surface fill, used inside dense forms
 *  - flushed    bottom-border only — for inline editing
 *
 * Sizes: sm | md | lg
 * Invalid state: applies the error ring + error text colour when `invalid` is set.
 *
 * Accessibility
 *  - Renders a real <input> element with the type forwarded from props.
 *  - Disabled inputs set `aria-disabled` and `disabled`.
 *  - Use the FormField wrapper to wire `aria-invalid`, `aria-describedby`,
 *    and the error message; this component just respects the props passed in.
 *  - Focus ring uses the global `:focus-visible` outline (see globals.css).
 */

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const inputVariants = cva(
  // Base — shared by every variant/size.
  [
    'flex w-full',
    'font-sans text-body',
    'rounded-md', // 10px, matches --radius-md
    'transition-colors duration-150 ease-out',
    // Placeholder
    'placeholder:text-text-muted',
    // Disabled
    'disabled:cursor-not-allowed disabled:opacity-50',
    // File input — restyle the native button to match the field.
    'file:border-0 file:bg-transparent file:text-caption file:font-medium file:text-primary',
    // Invalid
    'aria-[invalid=true]:border-error aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-error/40',
    // Focus ring (additional to global :focus-visible)
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
  ],
  {
    variants: {
      variant: {
        default: [
          'bg-surface-elevated text-text-primary',
          'border border-border',
          'hover:border-primary/40',
          'focus-visible:border-primary',
        ],
        filled: [
          'bg-muted text-text-primary',
          'border border-transparent',
          'hover:bg-muted/80',
          'focus-visible:bg-surface-elevated focus-visible:border-primary',
        ],
        flushed: [
          'bg-transparent text-text-primary',
          'border-0 border-b border-border',
          'rounded-none',
          'px-0',
          'hover:border-primary/60',
          'focus-visible:border-primary',
        ],
      },
      size: {
        sm: 'h-8 px-3 text-caption',
        md: 'h-10 px-4 text-body',
        lg: 'h-12 px-4 text-body',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

export interface InputProps
  extends
    Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  /** Marks the field as invalid (sets `aria-invalid` and error styling). */
  invalid?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant, size, type = 'text', invalid, disabled, ...props }, ref) => {
    return (
      <input
        ref={ref}
        aria-disabled={disabled || undefined}
        aria-invalid={invalid || undefined}
        className={cn(inputVariants({ variant, size, className }))}
        disabled={disabled}
        type={type}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input, inputVariants };
