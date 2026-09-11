import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectMenuOption<T extends string> {
  value: T;
  label: string;
}

export function SelectMenu<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  prefix,
  className,
  active = false,
}: {
  value: T;
  options: Array<SelectMenuOption<T>>;
  onChange: (value: T) => void;
  ariaLabel: string;
  prefix?: ReactNode;
  className?: string;
  active?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<
    { left: number; bottom: number; width: number } | null
  >(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPosition(null);
      return;
    }

    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPosition({
        left: rect.left,
        bottom: window.innerHeight - rect.top + 6,
        width: rect.width,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn('relative min-w-0', className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex h-full w-full items-center gap-1.5 rounded-[var(--radius-control)] border px-3 text-left font-medium outline-none transition-colors',
          active
            ? 'border-primary/25 bg-primary-soft text-primary'
            : 'border-line-soft bg-panel text-dim hover:border-line-strong hover:bg-panel-muted',
        )}
      >
        {prefix}
        <span className="min-w-0 flex-1 truncate">{selected?.label}</span>
        <ChevronDown size={14} className="shrink-0 opacity-60" />
      </button>
      {open &&
        menuPosition &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label={ariaLabel}
            style={{
              left: menuPosition.left,
              bottom: menuPosition.bottom,
              minWidth: menuPosition.width,
            }}
            className="fixed z-[100] overflow-hidden rounded-[var(--radius-control)] border border-line-soft bg-panel p-1.5 shadow-[var(--shadow-floating)]"
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  'flex h-8 w-full items-center gap-2 whitespace-nowrap rounded-[7px] px-2.5 text-left text-[11px] transition-colors',
                  option.value === value
                    ? 'bg-primary-soft font-medium text-primary'
                    : 'bg-panel text-dim hover:bg-panel-muted hover:text-ink',
                )}
              >
                <span className="min-w-0 flex-1">{option.label}</span>
                {option.value === value && <Check size={13} />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
