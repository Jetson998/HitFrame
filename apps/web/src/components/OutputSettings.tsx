import { POINTS_PER_IMAGE, type Quality, type Ratio } from '@hitframe/shared';
import { ChevronRight, Settings2, Sparkles } from 'lucide-react';
import { Chip } from '@/components/ui/chip';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export const RATIOS: Ratio[] = ['1:1', '3:4', '9:16', '4:3'];

interface OutputSettingsProps {
  ratio: Ratio;
  autoRatio?: boolean;
  quality: Quality;
  count: number;
  onRatio: (r: Ratio) => void;
  onAutoRatio?: (auto: boolean) => void;
  onQuality: (q: Quality) => void;
  onCount: (n: number) => void;
  stacked?: boolean;
}

const RATIO_SHAPE: Record<Ratio, string> = {
  '1:1': 'h-5 w-5',
  '3:4': 'h-6 w-[18px]',
  '9:16': 'h-6 w-3.5',
  '4:3': 'h-[18px] w-6',
};

const QUALITY_LABEL: Record<Quality, string> = {
  preview: '预览',
  standard: '标准',
  high: '高清',
};

/** 输出设置：生成页使用摘要入口 + 弹层，模板配置页保留纵向设置。 */
export function OutputSettings({
  ratio,
  autoRatio = false,
  quality,
  count,
  onRatio,
  onAutoRatio,
  onQuality,
  onCount,
  stacked = false,
}: OutputSettingsProps) {
  if (!stacked) {
    return (
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className="flex h-11 w-full items-center gap-2.5 rounded-[var(--radius-control)] border border-line bg-panel px-3 text-left transition-all hover:border-line-strong hover:bg-panel-muted"
          >
            <Settings2 size={15} className="shrink-0 text-faint" />
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-dim">
              GPT Image 2 · {autoRatio ? '自动' : ratio} · {QUALITY_LABEL[quality]} · {count} 张
            </span>
            <ChevronRight size={17} className="shrink-0 text-faint" />
          </button>
        </DialogTrigger>

        <DialogContent className="max-h-[calc(100vh-32px)] w-[calc(100%-24px)] max-w-[560px] overflow-y-auto rounded-[var(--radius-card)]">
          <div className="p-4 sm:p-5">
            <DialogTitle className="pr-8 text-[16px] font-semibold text-ink">生成设置</DialogTitle>

            <div className="mt-4">
              <div className="mb-1.5 text-[11.5px] font-semibold text-ink">模型</div>
              <div className="flex h-10 items-center gap-2.5 rounded-[var(--radius-control)] bg-panel-muted px-3.5">
                <Sparkles size={15} className="text-primary" />
                <span className="text-[13px] font-medium text-ink">GPT Image 2</span>
                <span className="ml-auto text-[10.5px] text-faint">当前模型</span>
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 text-[11.5px] font-semibold text-ink">画面比例</div>
              <div className="grid grid-cols-5 gap-1.5">
                {(['auto', ...RATIOS] as const).map((r) => {
                  const active = r === 'auto' ? autoRatio : !autoRatio && ratio === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        if (r === 'auto') onAutoRatio?.(true);
                        else {
                          onAutoRatio?.(false);
                          onRatio(r);
                        }
                      }}
                      className={cn(
                        'flex h-16 flex-col items-center justify-center gap-1.5 rounded-[var(--radius-control)] border text-[11.5px] font-medium transition-all',
                        active
                          ? 'border-primary bg-primary-soft text-primary shadow-[inset_0_0_0_1px_rgba(99,91,255,0.12)]'
                          : 'border-line-soft bg-panel-muted text-dim hover:border-line-strong hover:text-ink',
                      )}
                    >
                      <span
                        className={cn(
                          'rounded-[3px] border-2',
                          r === 'auto' ? 'h-5 w-5 border-dashed' : RATIO_SHAPE[r],
                          active ? 'border-primary' : 'border-faint',
                        )}
                      />
                      <span>{r === 'auto' ? '自动' : r}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 text-[11.5px] font-semibold text-ink">清晰度</div>
              <div className="grid grid-cols-3 gap-2 rounded-[var(--radius-control)] bg-panel-muted p-1">
                {(Object.keys(POINTS_PER_IMAGE) as Quality[]).map((q) => (
                  <button
                    key={q}
                    type="button"
                    aria-pressed={quality === q}
                    onClick={() => onQuality(q)}
                    className={cn(
                      'rounded-[8px] px-3 py-1.5 text-center transition-all',
                      quality === q
                        ? 'bg-ink text-white shadow-sm'
                        : 'text-dim hover:bg-white hover:text-ink',
                    )}
                  >
                    <span className="block text-[12px] font-semibold">{QUALITY_LABEL[q]}</span>
                    <span className={cn('block text-[10px]', quality === q ? 'text-white/65' : 'text-faint')}>
                      {POINTS_PER_IMAGE[q]} 点 / 张
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 text-[11.5px] font-semibold text-ink">生成数量</div>
              <div className="grid grid-cols-4 gap-1.5">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={count === n}
                    onClick={() => onCount(n)}
                    className={cn(
                      'h-10 rounded-[var(--radius-control)] border text-[12px] font-medium transition-all',
                      count === n
                        ? 'border-primary bg-primary-soft text-primary'
                        : 'border-line-soft bg-panel-muted text-dim hover:border-line-strong hover:text-ink',
                    )}
                  >
                    {n} 张
                  </button>
                ))}
              </div>
            </div>

            <DialogClose asChild>
              <Button variant="primary" className="mt-5 w-full text-[13px]">
                完成
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between rounded-[var(--radius-control)] bg-panel-muted px-3 py-2.5">
        <span className="text-[11.5px] text-faint">生成模型</span>
        <span className="text-[12px] font-medium text-dim">GPT Image 2</span>
      </div>
      <div>
        <span className="mb-2 block text-[12px] font-medium text-dim">画面比例</span>
        <div className="flex flex-wrap gap-1">
          {RATIOS.map((r) => (
            <Chip key={r} active={ratio === r} onClick={() => onRatio(r)}>
              {r}
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <span className="mb-2 block text-[12px] font-medium text-dim">清晰度</span>
        <div className="flex flex-wrap gap-1">
          {(Object.keys(POINTS_PER_IMAGE) as Quality[]).map((q) => (
            <Chip key={q} active={quality === q} onClick={() => onQuality(q)}>
              {QUALITY_LABEL[q]} · {POINTS_PER_IMAGE[q]} 点/张
            </Chip>
          ))}
        </div>
      </div>
      <div>
        <span className="mb-2 block text-[12px] font-medium text-dim">生成数量</span>
        <div className="flex flex-wrap gap-1">
          {[1, 2, 3, 4].map((n) => (
            <Chip key={n} active={count === n} onClick={() => onCount(n)}>
              {n} 张
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}
