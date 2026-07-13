/**
 * components/ui/card.tsx — Card primitive.
 *
 * Spacious, premium container used for grouped content.
 * Composable subcomponents: Card, CardHeader, CardTitle, CardDescription,
 * CardContent, CardFooter.
 *
 * Visuals
 *  - Surface elevated background with a hairline border.
 *  - Rounded --radius-lg (12px) corners.
 *  - Subtle shadow that deepens on hover.
 *  - Header / Footer separated by a thin border.
 *
 * Accessibility
 *  - The root is a semantic <section> with role="region" + aria-labelledby
 *    when a CardTitle is present, so screen readers can name the card.
 *  - Subcomponents are unstyled divs by default — the consumer can swap in
 *    <h2>/<h3>/<p> as needed without breaking the visual rhythm.
 */

import * as React from 'react';

import { cn } from '@/lib/utils';

/* -------------------------------------------------------------------------- */
/* Context — lets CardTitle share its id with the Card root for a11y.         */
/* -------------------------------------------------------------------------- */

interface CardContextValue {
  /** id used to wire aria-labelledby between CardTitle and Card root. */
  titleId: string;
}

const CardContext = React.createContext<CardContextValue | null>(null);

function useCardContext(component: string): CardContextValue {
  const ctx = React.useContext(CardContext);
  if (!ctx) {
    throw new Error(`<${component}> must be used inside <Card>.`);
  }
  return ctx;
}

/* -------------------------------------------------------------------------- */
/* Card                                                                       */
/* -------------------------------------------------------------------------- */

type CardElement = HTMLDivElement;

export interface CardProps extends React.HTMLAttributes<CardElement> {
  /** Render as a different element (e.g. <article>). */
  as?: 'section' | 'article' | 'div';
  /** Disable hover lift. Useful for nested cards. */
  noHover?: boolean;
}

const Card = React.forwardRef<CardElement, CardProps>(
  ({ className, as: Tag = 'section', noHover = false, children, ...props }, ref) => {
    // Use React.useId for SSR-safe unique id — wires the title for a11y.
    const titleId = React.useId();

    return (
      <CardContext.Provider value={{ titleId }}>
        <Tag
          ref={ref as React.Ref<CardElement>}
          aria-labelledby={titleId}
          className={cn(
            // Surface
            'relative flex flex-col',
            'rounded-lg', // 12px — matches --radius-lg
            'bg-surface-elevated text-text-primary',
            'border border-border',
            'shadow-sm',
            // Hover lift (suppressed when noHover is set)
            !noHover && [
              'transition-all duration-300 ease-out',
              'hover:-translate-y-0.5 hover:shadow-md',
              'hover:border-primary/20',
            ],
            className,
          )}
          {...props}
        >
          {children}
        </Tag>
      </CardContext.Provider>
    );
  },
);
Card.displayName = 'Card';

/* -------------------------------------------------------------------------- */
/* CardHeader                                                                 */
/* -------------------------------------------------------------------------- */

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex flex-col gap-1.5',
        'p-6 pb-4',
        // Visually separate from content via a subtle bottom border.
        'border-b border-border/60',
        className,
      )}
      {...props}
    />
  ),
);
CardHeader.displayName = 'CardHeader';

/* -------------------------------------------------------------------------- */
/* CardTitle                                                                  */
/* -------------------------------------------------------------------------- */

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  /** Heading level to render. Defaults to h3 (a section inside a page). */
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}

const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className, as: Tag = 'h3', children, ...props }, ref) => {
    const { titleId } = useCardContext('CardTitle');
    return (
      <Tag
        ref={ref as React.Ref<HTMLHeadingElement>}
        className={cn(
          'font-display text-h4 font-semibold leading-tight tracking-tight',
          'text-text-primary',
          className,
        )}
        id={titleId}
        {...props}
      >
        {children}
      </Tag>
    );
  },
);
CardTitle.displayName = 'CardTitle';

/* -------------------------------------------------------------------------- */
/* CardDescription                                                            */
/* -------------------------------------------------------------------------- */

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-caption leading-snug text-text-secondary', className)}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

/* -------------------------------------------------------------------------- */
/* CardContent                                                                */
/* -------------------------------------------------------------------------- */

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex-1 p-6 pt-4', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

/* -------------------------------------------------------------------------- */
/* CardFooter                                                                 */
/* -------------------------------------------------------------------------- */

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex items-center justify-between gap-3',
        'p-6 pt-4',
        'border-t border-border/60',
        className,
      )}
      {...props}
    />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
