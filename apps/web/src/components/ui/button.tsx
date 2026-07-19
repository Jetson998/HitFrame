import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg text-[12.5px] transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-accent font-semibold text-white hover:bg-accent-hov',
        secondary:
          'border border-line bg-panel text-ink shadow-[0_1px_2px_rgba(23,43,77,0.06)] hover:border-[#cfd8e6] hover:bg-panel2',
        ghost: 'text-dim hover:bg-panel2 hover:text-ink',
      },
      size: {
        sm: 'h-7 px-2.5 text-[11.5px]',
        default: 'h-8 px-3.5',
        lg: 'h-10 px-5 text-[13.5px]',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'default' },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

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
