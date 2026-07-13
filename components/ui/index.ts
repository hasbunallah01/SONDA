/**
 * components/ui/index.ts — Barrel export for shadcn-style primitives.
 *
 * Allows clean imports:
 *   import { Button, Card, CardHeader, Badge, Input, Select, SelectItem }
 *   from '@/components/ui';
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

export { Input, inputVariants, type InputProps } from './input';

export { Textarea, textareaVariants, type TextareaProps } from './textarea';

export { Checkbox } from './checkbox';

export { RadioGroup, RadioGroupItem } from './radio-group';

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
  type SelectTriggerProps,
} from './select';
