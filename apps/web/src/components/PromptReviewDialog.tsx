import { Check, LoaderCircle, WandSparkles, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PromptCompileResponseDto, PromptMode } from '@hitframe/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { SelectMenu } from '@/components/ui/select-menu';

export const PROMPT_MODE_OPTIONS: Array<{ value: PromptMode; label: string }> = [
  { value: 'raw', label: '原样' },
  { value: 'enhance', label: '智能增强' },
  { value: 'director', label: '创意导演' },
];

export function PromptModeSelect({
  value,
  onChange,
}: {
  value: PromptMode;
  onChange: (value: PromptMode) => void;
}) {
  return (
    <SelectMenu
      value={value}
      options={PROMPT_MODE_OPTIONS}
      onChange={onChange}
      ariaLabel="提示词处理方式"
      prefix={<WandSparkles size={15} className="shrink-0 text-faint" />}
      className="h-11"
    />
  );
}

export function PromptReviewDialog({
  open,
  onOpenChange,
  rawPrompt,
  compilation,
  compiling,
  error,
  selected,
  onSelected,
  agentPrompt,
  onAgentPrompt,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rawPrompt: string;
  compilation: PromptCompileResponseDto | null;
  compiling: boolean;
  error: string | null;
  selected: 'raw' | 'agent';
  onSelected: (selected: 'raw' | 'agent') => void;
  agentPrompt: string;
  onAgentPrompt: (value: string) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-24px)] max-w-[980px] overflow-y-auto p-0">
        <div className="border-b border-line-soft px-5 py-4 pr-12">
          <DialogTitle className="text-[15px] font-semibold text-ink">选择用于生成的提示词</DialogTitle>
          <DialogDescription className="mt-1 text-[11.5px] text-dim">
            左侧保留你的原始描述，右侧是 Agent 的创意方案。默认使用右侧，你可以继续修改。
          </DialogDescription>
        </div>

        <div className="grid gap-3 p-5 md:grid-cols-2">
          <PromptChoice
            title="客户提示词"
            selected={selected === 'raw'}
            onSelect={() => onSelected('raw')}
          >
            <textarea
              readOnly
              value={rawPrompt}
              aria-label="客户提示词"
              className="min-h-[280px] w-full resize-none bg-transparent text-[12px] leading-relaxed text-dim outline-none"
            />
          </PromptChoice>

          <PromptChoice
            title="创意导演提示词"
            selected={selected === 'agent'}
            onSelect={() => onSelected('agent')}
            badge="默认"
          >
            {compiling ? (
              <div className="grid min-h-[280px] place-items-center text-[11.5px] text-dim">
                <div className="flex items-center gap-2"><LoaderCircle size={15} className="animate-spin text-primary" /> Agent 正在设计提示词…</div>
              </div>
            ) : error ? (
              <div className="min-h-[280px] rounded-[var(--radius-control)] bg-err/5 p-3 text-[11.5px] leading-relaxed text-err">{error}</div>
            ) : (
              <textarea
                value={agentPrompt}
                onChange={(event) => onAgentPrompt(event.target.value)}
                aria-label="创意导演提示词"
                className="min-h-[280px] w-full resize-y bg-transparent text-[12px] leading-relaxed text-ink outline-none"
              />
            )}
          </PromptChoice>
        </div>

        {compilation?.changeSummary.length ? (
          <div className="mx-5 mb-4 rounded-[var(--radius-control)] bg-primary-soft px-3 py-2 text-[10.5px] leading-relaxed text-primary">
            Agent 本次补充：{compilation.changeSummary.join(' · ')}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 border-t border-line-soft px-5 py-4">
          <div className="text-[10.5px] text-faint">将按当前高亮边框中的提示词生成</div>
          <Button
            variant="primary"
            size="lg"
            disabled={compiling || (selected === 'agent' && (!agentPrompt.trim() || Boolean(error)))}
            onClick={onConfirm}
          >
            <Sparkles size={14} /> 使用所选提示词生成
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PromptChoice({
  title,
  selected,
  onSelect,
  badge,
  children,
}: {
  title: string;
  selected: boolean;
  onSelect: () => void;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <section
      onClick={onSelect}
      className={cn(
        'cursor-pointer rounded-[var(--radius-card)] border-2 bg-panel p-4 transition-colors',
        selected ? 'border-primary shadow-[0_0_0_3px_rgba(99,91,255,0.10)]' : 'border-line-soft hover:border-line-strong',
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-[12px] font-semibold text-ink">{title}</div>
        <div className="flex items-center gap-1.5">
          {badge && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[9.5px] font-medium text-primary">{badge}</span>}
          <span className={cn('grid h-5 w-5 place-items-center rounded-full border', selected ? 'border-primary bg-primary text-white' : 'border-line-strong text-transparent')}>
            <Check size={12} />
          </span>
        </div>
      </div>
      {children}
    </section>
  );
}
