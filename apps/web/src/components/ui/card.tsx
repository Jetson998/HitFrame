import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const cardVariants = cva('rounded-[--radius-card] border transition-all', {
  variants: {
    variant: {
      default: 'border-line bg-panel shadow-[--shadow-card] hover:shadow-[--shadow-card-hover]',
      muted: 'border-line-soft bg-panel-muted',
      hero: 'border-hero-line bg-hero-surface',
      flat: 'border-line bg-panel',
    },
    padding: {
      none: '',
      sm: 'p-3',
      default: 'p-4',
      lg: 'p-6',
    },
    interactive: {
      true: 'cursor-pointer hover:-translate-y-0.5',
      false: '',
    },
  },
  defaultVariants: { variant: 'default', padding: 'default', interactive: false },
});

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, padding, interactive, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant, padding, interactive }), className)}
      {...props}
    />
  ),
);
Card.displayName = 'Card';
