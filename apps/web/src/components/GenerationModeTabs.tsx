import { Images, LayoutTemplate, WandSparkles } from 'lucide-react';
import type { GenMode } from '@/store';
import { cn } from '@/lib/utils';

const MODES: Array<{ mode: GenMode; label: string; icon: typeof Images }> = [
  { mode: 'i2i', label: '图生图', icon: Images },
  { mode: 't2i', label: '文生图', icon: WandSparkles },
  { mode: 'template', label: '场景模板', icon: LayoutTemplate },
];

interface GenerationModeTabsProps {
  activeMode: GenMode;
  onChange: (mode: GenMode) => void;
}

export function GenerationModeTabs({ activeMode, onChange }: GenerationModeTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="图片生成方式"
      className="grid w-full grid-cols-3 gap-1 rounded-[var(--radius-control)] border border-line-soft bg-panel-muted p-0.5"
    >
      {MODES.map(({ mode, label, icon: Icon }) => (
        <button
          key={mode}
          type="button"
          role="tab"
          aria-selected={activeMode === mode}
          onClick={() => onChange(mode)}
          className={cn(
            'flex h-8 min-w-0 items-center justify-center gap-1 rounded-[7px] border px-1.5 text-[11px] font-medium transition-all',
            activeMode === mode
              ? 'border-ink bg-ink text-white shadow-[0_2px_8px_rgba(18,27,44,0.16)]'
              : 'border-line-soft bg-panel text-dim shadow-[0_1px_2px_rgba(18,27,44,0.04)] hover:border-line hover:text-ink',
          )}
        >
          <Icon size={13} className={activeMode === mode ? 'text-white' : 'text-faint'} />
          <span className="truncate">{label}</span>
        </button>
      ))}
    </div>
  );
}
