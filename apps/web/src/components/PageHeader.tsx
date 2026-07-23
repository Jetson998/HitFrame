import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, badge, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'border-b border-line bg-panel px-[--spacing-pageX] py-6 md:py-8',
        className,
      )}
    >
      <div className="mx-auto max-w-[--spacing-contentMax]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-[30px] font-bold leading-tight">{title}</h1>
              {badge}
            </div>
            {subtitle && <p className="text-[14px] leading-relaxed text-dim">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
