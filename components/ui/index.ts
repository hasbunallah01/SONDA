/**
 * components/ui/index.ts — Barrel export for shadcn-style primitives.
 *
 * Allows clean imports:
 *   import { Button, Card, CardHeader, Badge } from '@/components/ui';
 *
 * The CVA variant exports are also re-exported so consumers can read
 * variant metadata without reaching into the individual files.
 */

export { Button, buttonVariants, type ButtonProps } from './button';

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  type CardProps,
  type CardTitleProps,
} from './card';

export { Badge, badgeVariants, type BadgeProps } from './badge';
