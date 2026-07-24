import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

/** Demo 中的 chip 选项按钮（业务变量 / 比例 / 清晰度 / 数量） */
export function Chip({ active, className, type = 'button', ...props }: ChipProps) {
  return (
    <button
      type={type}
      className={cn(
        'cursor-pointer rounded-full border px-2.5 py-1 text-[11px] transition-colors',
        active
          ? 'border-primary/50 bg-primary/10 font-semibold text-ink'
          : 'border-line-soft bg-panel-muted text-dim hover:border-line hover:text-ink',
        className,
      )}
      {...props}
    />
  );
}
