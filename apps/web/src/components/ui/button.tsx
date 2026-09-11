import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 font-medium transition-all disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'rounded-[var(--radius-button)] bg-primary text-white shadow-[var(--shadow-primary)] hover:bg-primary-hover',
        secondary:
          'rounded-[var(--radius-button)] border border-line bg-panel text-ink hover:border-line-strong hover:bg-panel-muted',
        ghost:
          'rounded-[var(--radius-button)] text-dim hover:bg-panel-muted hover:text-ink',
        link: 'text-primary hover:text-primary-hover underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-[12px]',
        default: 'h-10 px-4 text-[14px]',
        lg: 'h-12 px-6 text-[15px]',
        xl: 'h-14 px-8 text-[16px]',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'default' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
