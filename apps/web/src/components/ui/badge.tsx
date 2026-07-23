import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 font-medium rounded-[--radius-pill] border',
  {
    variants: {
      variant: {
        default: 'border-line bg-panel-muted text-dim',
        primary: 'border-primary/20 bg-primary-soft text-primary',
        success: 'border-success/20 bg-success/10 text-success',
        warning: 'border-warn/20 bg-warn/10 text-warn',
        error: 'border-err/20 bg-err/10 text-err',
        hero: 'border-hero-line bg-hero-surface text-hero-text-dim',
      },
      size: {
        sm: 'px-2 py-0.5 text-[10px]',
        default: 'px-2.5 py-1 text-[11px]',
        lg: 'px-3 py-1.5 text-[12px]',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, size, ...props }, ref) => (
    <div ref={ref} className={cn(badgeVariants({ variant, size }), className)} {...props} />
  ),
);
Badge.displayName = 'Badge';
