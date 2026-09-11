import { POINTS_PER_IMAGE, type Quality, type Ratio } from '@hitframe/shared';
import { ChevronRight, Settings2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const RATIOS: Ratio[] = ['1:1', '3:4', '4:3', '9:16'];

const QUALITY_LABEL: Record<Quality, string> = {
  preview: '预览',
  standard: '标准',
  high: '高清',
};

const RATIO_SHAPE: Record<Ratio, string> = {
  '1:1': 'h-5 w-5',
  '3:4': 'h-6 w-[18px]',
  '4:3': 'h-[18px] w-6',
  '9:16': 'h-6 w-3.5',
};

interface AgentGenerationSettingsProps {
  ratio: Ratio;
  quality: Quality;
  count: number;
  onRatio: (ratio: Ratio) => void;
  onQuality: (quality: Quality) => void;
  onCount: (count: number) => void;
}

/** Agent Composer 的生成设置：展示编译模型与实际生图模型，并复用现有输出参数。 */
export function AgentGenerationSettings({
  ratio,
  quality,
  count,
  onRatio,
  onQuality,
  onCount,
}: AgentGenerationSettingsProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 max-w-[min(100%,360px)] shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] border border-line-soft bg-panel-muted px-3 text-left text-[10.5px] font-medium text-dim transition-colors hover:border-primary hover:text-primary"
          aria-label="打开 Agent 生成设置"
        >
          <Settings2 size={14} className="shrink-0 text-faint" />
          <span className="truncate">
            GPT Image 2 · GPT-5.6-sol · {ratio} · {QUALITY_LABEL[quality]} · {count} 张
          </span>
          <ChevronRight size={15} className="shrink-0 text-faint" />
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[calc(100vh-32px)] w-[calc(100%-24px)] max-w-[560px] overflow-y-auto rounded-[var(--radius-card)]">
        <div className="p-4 sm:p-5">
          <DialogTitle className="pr-8 text-[16px] font-semibold text-ink">生成设置</DialogTitle>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <ModelCard label="生图模型" value="GPT Image 2" />
            <ModelCard label="Agent 模型" value="GPT-5.6-sol" />
          </div>

          <div className="mt-5">
            <div className="mb-2 text-[11.5px] font-semibold text-ink">画面比例</div>
            <div className="grid grid-cols-4 gap-1.5">
              {RATIOS.map((nextRatio) => {
                const active = ratio === nextRatio;
                return (
                  <button
                    key={nextRatio}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onRatio(nextRatio)}
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
                        RATIO_SHAPE[nextRatio],
                        active ? 'border-primary' : 'border-faint',
                      )}
                    />
                    <span>{nextRatio}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 text-[11.5px] font-semibold text-ink">清晰度</div>
            <div className="grid grid-cols-3 gap-2 rounded-[var(--radius-control)] bg-panel-muted p-1">
              {(Object.keys(POINTS_PER_IMAGE) as Quality[]).map((nextQuality) => (
                <button
                  key={nextQuality}
                  type="button"
                  aria-pressed={quality === nextQuality}
                  onClick={() => onQuality(nextQuality)}
                  className={cn(
                    'rounded-[8px] px-3 py-1.5 text-center transition-all',
                    quality === nextQuality
                      ? 'bg-ink text-white shadow-sm'
                      : 'text-dim hover:bg-white hover:text-ink',
                  )}
                >
                  <span className="block text-[12px] font-semibold">{QUALITY_LABEL[nextQuality]}</span>
                  <span className={cn('block text-[10px]', quality === nextQuality ? 'text-white/65' : 'text-faint')}>
                    {POINTS_PER_IMAGE[nextQuality]} 点 / 张
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 text-[11.5px] font-semibold text-ink">生成数量</div>
            <div className="grid grid-cols-4 gap-1.5">
              {[1, 2, 3, 4].map((nextCount) => (
                <button
                  key={nextCount}
                  type="button"
                  aria-pressed={count === nextCount}
                  onClick={() => onCount(nextCount)}
                  className={cn(
                    'h-10 rounded-[var(--radius-control)] border text-[12px] font-medium transition-all',
                    count === nextCount
                      ? 'border-primary bg-primary-soft text-primary'
                      : 'border-line-soft bg-panel-muted text-dim hover:border-line-strong hover:text-ink',
                  )}
                >
                  {nextCount} 张
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

function ModelCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-control)] bg-panel-muted px-3.5 py-3">
      <div className="mb-1 flex items-center gap-1.5 text-[10.5px] text-faint">
        <Sparkles size={13} className="text-primary" />
        {label}
      </div>
      <div className="text-[13px] font-semibold text-ink">{value}</div>
    </div>
  );
}
