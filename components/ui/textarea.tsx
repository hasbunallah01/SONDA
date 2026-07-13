/**
 * components/ui/textarea.tsx — Textarea primitive.
 *
 * Multi-line text input. Shares the same visual language as Input so the
 * two can be used side-by-side inside a form.
 *
 * Sizing
 *  - `size` controls the min-height token.
 *  - `autoResize` grows the field with the user input up to `maxRows`.
 *
 * Accessibility
 *  - Renders a real <textarea> element.
 *  - Disabled sets `aria-disabled` and `disabled`.
 *  - Invalid state wires `aria-invalid` for the FormField helper/error wiring.
 *  - Focus ring uses the global `:focus-visible` outline.
 */

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const textareaVariants = cva(
  // Base — shared by every variant/size.
  [
    'flex w-full',
    'font-sans text-body leading-relaxed',
    'rounded-md', // 10px, matches --radius-md
    'transition-colors duration-150 ease-out',
    // Placeholder
    'placeholder:text-text-muted',
    // Disabled
    'disabled:cursor-not-allowed disabled:opacity-50',
    // Invalid
    'aria-[invalid=true]:border-error aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-error/40',
    // Focus ring
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
      },
      size: {
        sm: 'min-h-[80px] p-3 text-caption',
        md: 'min-h-[120px] p-4 text-body',
        lg: 'min-h-[180px] p-4 text-body',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>, VariantProps<typeof textareaVariants> {
  /** Marks the field as invalid (sets `aria-invalid` and error styling). */
  invalid?: boolean;
  /** Grow the field to fit content. Caps at `maxRows` (defaults to 10). */
  autoResize?: boolean;
  /** Maximum visible rows when `autoResize` is true. */
  maxRows?: number;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      variant,
      size,
      invalid,
      disabled,
      autoResize = false,
      maxRows = 10,
      onInput,
      ...props
    },
    ref,
  ) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);
    const composedRef = useComposedRefs(ref, innerRef);

    // Auto-grow: on each input, reset height then expand to scrollHeight,
    // capped by `maxRows` line-heights so it never grows unbounded.
    React.useEffect(() => {
      if (!autoResize) return;
      const el = innerRef.current;
      if (!el) return;

      const lineHeight = parseFloat(getComputedStyle(el).lineHeight || '0') || 20;
      const paddingTop = parseFloat(getComputedStyle(el).paddingTop || '0') || 0;
      const paddingBottom = parseFloat(getComputedStyle(el).paddingBottom || '0') || 0;
      const maxHeight = lineHeight * maxRows + paddingTop + paddingBottom;

      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    }, [autoResize, maxRows, props.value, props.defaultValue]);

    return (
      <textarea
        ref={composedRef}
        aria-disabled={disabled || undefined}
        aria-invalid={invalid || undefined}
        className={cn(textareaVariants({ variant, size, className }))}
        disabled={disabled}
        onInput={(event) => {
          if (autoResize) {
            const el = event.currentTarget;
            el.style.height = 'auto';
            el.style.height = `${el.scrollHeight}px`;
          }
          onInput?.(event);
        }}
        {...props}
      />
    );
  },
);
Textarea.displayName = 'Textarea';

/* -------------------------------------------------------------------------- */
/* Composed refs helper                                                       */
/* -------------------------------------------------------------------------- */

function useComposedRefs<T>(...refs: Array<React.Ref<T> | undefined | null>) {
  return React.useCallback(
    (node: T | null) => {
      for (const ref of refs) {
        if (!ref) continue;
        if (typeof ref === 'function') {
          ref(node);
        } else {
          (ref as React.MutableRefObject<T | null>).current = node;
        }
      }
    },
    // refs are stable; we intentionally spread them into deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    refs,
  );
}

export { Textarea, textareaVariants };
