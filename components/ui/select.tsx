/**
 * components/ui/select.tsx — Select primitive.
 *
 * Built on Radix Select for accessible single-selection (keyboard nav,
 * typeahead, scrollable content, portal rendering).
 *
 * Composable parts (re-exported from Radix)
 *  - Select               — the Root, owns value/onValueChange
 *  - SelectGroup          — optgroup equivalent
 *  - SelectValue          — the trigger's label slot
 *  - SelectTrigger        — the closed-state button
 *  - SelectContent        — the popover; position + portal handled by Radix
 *  - SelectLabel          — non-interactive group label
 *  - SelectItem           — a single option
 *  - SelectSeparator      — hairline divider
 *  - SelectScrollUpButton / SelectScrollDownButton — auto-shown when overflowing
 *
 * Variants
 *  - default — bordered, elevated surface (used everywhere)
 *  - filled  — soft surface fill, for dense forms
 *  - flushed — bottom-border only, for inline editing
 *
 * Sizes: sm | md | lg
 *
 * Accessibility
 *  - Radix wires role="combobox" + role="listbox" + aria-activedescendant
 *    and keyboard arrow / typeahead navigation.
 *  - Placeholder text is announced when no value is selected.
 *  - The check icon inside SelectItem is aria-hidden; the value text is
 *    the accessible label.
 */

'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

/* -------------------------------------------------------------------------- */
/* SelectTrigger                                                              */
/* -------------------------------------------------------------------------- */

const selectTriggerVariants = cva(
  [
    'flex w-full items-center justify-between',
    'font-sans text-body',
    'rounded-md', // 10px, matches --radius-md
    'transition-colors duration-150 ease-out',
    // Placeholder
    'data-[placeholder]:text-text-muted',
    // Disabled
    'disabled:cursor-not-allowed disabled:opacity-50',
    // Invalid
    'aria-[invalid=true]:border-error aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-error/40',
    // Focus
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
    // Icon
    '[&>span]:line-clamp-1',
  ],
  {
    variants: {
      variant: {
        default: [
          'bg-surface-elevated text-text-primary',
          'border border-border',
          'hover:border-primary/40',
          'data-[state=open]:border-primary',
        ],
        filled: [
          'bg-muted text-text-primary',
          'border border-transparent',
          'hover:bg-muted/80',
          'data-[state=open]:bg-surface-elevated data-[state=open]:border-primary',
        ],
        flushed: [
          'bg-transparent text-text-primary',
          'border-0 border-b border-border',
          'rounded-none',
          'px-0',
          'hover:border-primary/60',
          'data-[state=open]:border-primary',
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

export interface SelectTriggerProps
  extends
    React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>,
    VariantProps<typeof selectTriggerVariants> {
  /** Marks the field as invalid (sets `aria-invalid` and error styling). */
  invalid?: boolean;
}

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  SelectTriggerProps
>(({ className, variant, size, invalid, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(selectTriggerVariants({ variant, size, className }))}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-text-muted" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName ?? 'SelectTrigger';

/* -------------------------------------------------------------------------- */
/* SelectScrollButton                                                         */
/* -------------------------------------------------------------------------- */

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      'flex cursor-default items-center justify-center py-1',
      'text-text-muted',
      className,
    )}
    {...props}
  >
    <ChevronUp aria-hidden="true" className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName =
  SelectPrimitive.ScrollUpButton.displayName ?? 'SelectScrollUpButton';

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      'flex cursor-default items-center justify-center py-1',
      'text-text-muted',
      className,
    )}
    {...props}
  >
    <ChevronDown aria-hidden="true" className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName ?? 'SelectScrollDownButton';

/* -------------------------------------------------------------------------- */
/* SelectContent                                                              */
/* -------------------------------------------------------------------------- */

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        // Surface
        'relative z-50',
        'max-h-96 min-w-[8rem] overflow-hidden',
        'rounded-md', // 10px, matches --radius-md
        'bg-surface-elevated text-text-primary',
        'border border-border',
        'shadow-lg',
        // Animations — keep them subtle to feel premium
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2',
        'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        // Popper-specific positioning
        position === 'popper' &&
          'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
        className,
      )}
      position={position}
      {...props}
    >
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          'p-1',
          position === 'popper' &&
            'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]',
        )}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName ?? 'SelectContent';

/* -------------------------------------------------------------------------- */
/* SelectLabel                                                                */
/* -------------------------------------------------------------------------- */

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn(
      'px-2 py-1.5',
      'text-caption font-semibold uppercase tracking-wide',
      'text-text-muted',
      className,
    )}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName ?? 'SelectLabel';

/* -------------------------------------------------------------------------- */
/* SelectItem                                                                 */
/* -------------------------------------------------------------------------- */

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      // Base
      'relative flex w-full cursor-default select-none items-center',
      'rounded-sm',
      'py-1.5 pl-8 pr-2',
      'text-body text-text-primary',
      'outline-none',
      // Focus / highlight
      'focus:bg-primary-soft focus:text-primary',
      'data-[highlighted]:bg-primary-soft data-[highlighted]:text-primary',
      // Disabled
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check aria-hidden="true" className="h-4 w-4 text-primary" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName ?? 'SelectItem';

/* -------------------------------------------------------------------------- */
/* SelectSeparator                                                            */
/* -------------------------------------------------------------------------- */

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-border', className)}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName ?? 'SelectSeparator';

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
