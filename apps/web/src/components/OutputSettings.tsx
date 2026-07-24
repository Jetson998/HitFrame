import { POINTS_PER_IMAGE, type Quality, type Ratio } from '@hitframe/shared';
import { Chip } from '@/components/ui/chip';

export const RATIOS: Ratio[] = ['1:1', '3:4', '9:16', '4:3'];

interface OutputSettingsProps {
  ratio: Ratio;
  quality: Quality;
  count: number;
  onRatio: (r: Ratio) => void;
  onQuality: (q: Quality) => void;
  onCount: (n: number) => void;
}

/** 输出设置四宫格：模型锁定 / 比例 / 清晰度（含点数）/ 数量（candidateCount 1–4） */
export function OutputSettings({
  ratio,
  quality,
  count,
  onRatio,
  onQuality,
  onCount,
}: OutputSettingsProps) {
  return (
    <div className="my-3.5 grid grid-cols-2 gap-2">
      <div className="rounded-[10px] border border-line-soft bg-panel-muted px-3 py-2.5">
        <span className="mb-1.5 block text-[10.5px] text-faint">模型</span>
        <span className="text-[12px] text-dim">GPT Image 2（锁定）</span>
      </div>
      <div className="rounded-[10px] border border-line-soft bg-panel-muted px-3 py-2.5">
        <span className="mb-1.5 block text-[10.5px] text-faint">比例（按方向生效）</span>
        <div className="flex flex-wrap gap-1">
          {RATIOS.map((r) => (
            <Chip key={r} active={ratio === r} onClick={() => onRatio(r)}>
              {r}
            </Chip>
          ))}
        </div>
      </div>
      <div className="rounded-[10px] border border-line-soft bg-panel-muted px-3 py-2.5">
        <span className="mb-1.5 block text-[10.5px] text-faint">清晰度</span>
        <div className="flex flex-wrap gap-1">
          {(Object.keys(POINTS_PER_IMAGE) as Quality[]).map((q) => (
            <Chip key={q} active={quality === q} onClick={() => onQuality(q)}>
              {q === 'standard' ? '标准' : '高清'} · {POINTS_PER_IMAGE[q]} 点/张
            </Chip>
          ))}
        </div>
      </div>
      <div className="rounded-[10px] border border-line-soft bg-panel-muted px-3 py-2.5">
        <span className="mb-1.5 block text-[10.5px] text-faint">数量（候选张数）</span>
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
