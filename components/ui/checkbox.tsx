/**
 * components/ui/checkbox.tsx — Checkbox primitive.
 *
 * Built on Radix Checkbox for accessible state management (keyboard nav,
 * aria-checked, indeterminate support) and styled with SONDA tokens.
 *
 * Usage
 *  - The bare <Checkbox /> is a 16px square. Pair it with a <label> or the
 *    FormField helper that wraps it. The component renders a hidden native
 *    checkbox under the hood — no need to wire one yourself.
 *
 * Sizes: sm | md
 * Invalid state: applies the error ring when `aria-invalid` is set on the
 * wrapper (FormField handles this).
 *
 * Accessibility
 *  - Radix exposes the proper role, aria-checked, and focus management.
 *  - The visible check + indeterminate icons are aria-hidden.
 */

'use client';

import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';

import { cn } from '@/lib/utils';

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      // Base
      'peer inline-flex items-center justify-center',
      'shrink-0',
      'rounded-sm', // 4px — small, decisive shape for a checkbox
      'border border-border',
      'bg-surface-elevated text-text-inverse',
      'shadow-xs',
      'transition-colors duration-150 ease-out',
      // Hover
      'hover:border-primary/60',
      // Checked
      'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
      'data-[state=checked]:shadow-brand-sm',
      // Indeterminate — same brand treatment
      'data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground',
      // Focus
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      // Disabled
      'disabled:cursor-not-allowed disabled:opacity-50',
      // Invalid
      'aria-[invalid=true]:border-error aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-error/40',
      // Sizes
      'h-4 w-4',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      {props.checked === 'indeterminate' ? (
        <Minus aria-hidden="true" className="h-3 w-3" strokeWidth={3} />
      ) : (
        <Check aria-hidden="true" className="h-3 w-3" strokeWidth={3} />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName ?? 'Checkbox';

export { Checkbox };
