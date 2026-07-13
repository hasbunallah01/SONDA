/**
 * components/ui/radio-group.tsx — Radio Group primitive.
 *
 * Built on Radix RadioGroup for accessible single-selection within a named
 * group (keyboard arrow nav, roving tabindex, aria-checked).
 *
 * Composable parts
 *  - RadioGroup            — the fieldset-style wrapper, sets the aria name
 *  - RadioGroupItem        — a single option (round indicator)
 *
 * Usage
 *  - Wrap the group in a <Label> or use the FormField helper to give it an
 *    accessible name. Items accept a value (string) and render a label
 *    beside them automatically when wrapped in <Label asChild>.
 *
 * Accessibility
 *  - Radix wires role="radiogroup" + role="radio" + roving tabindex.
 *  - Disabled items get `aria-disabled` and are skipped during nav.
 */

'use client';

import * as React from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { Circle } from 'lucide-react';

import { cn } from '@/lib/utils';

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Root ref={ref} className={cn('grid gap-2', className)} {...props} />
));
RadioGroup.displayName = RadioGroupPrimitive.Root.displayName ?? 'RadioGroup';

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      // Base
      'aspect-square shrink-0',
      'rounded-full', // perfect circle
      'border border-border',
      'bg-surface-elevated text-primary',
      'shadow-xs',
      'transition-colors duration-150 ease-out',
      // Hover
      'hover:border-primary/60',
      // Checked
      'data-[state=checked]:border-primary',
      // Focus
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      // Disabled
      'disabled:cursor-not-allowed disabled:opacity-50',
      // Invalid
      'aria-[invalid=true]:border-error aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-error/40',
      // Size — fixed at 16px to match Checkbox visual weight.
      'h-4 w-4',
      className,
    )}
    {...props}
  >
    <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
      <Circle aria-hidden="true" className="h-2 w-2 fill-current text-current" />
    </RadioGroupPrimitive.Indicator>
  </RadioGroupPrimitive.Item>
));
RadioGroupItem.displayName = RadioGroupPrimitive.Item.displayName ?? 'RadioGroupItem';

export { RadioGroup, RadioGroupItem };
