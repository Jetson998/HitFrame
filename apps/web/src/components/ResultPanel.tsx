import type { JobStatusDto, Ratio, RunStatusDto } from '@hitframe/shared';
import { Download, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store';
import { Button } from '@/components/ui/button';

const RATIO_ASPECT: Record<Ratio, string> = {
  '1:1': 'aspect-square',
  '3:4': 'aspect-[3/4]',
  '9:16': 'aspect-[9/16]',
  '4:3': 'aspect-[4/3]',
};

const STATUS_TEXT: Record<JobStatusDto['status'], string> = {
  queued: '排队中',
  running: '生成中…',
  succeeded: '完成',
  failed: '失败',
};

export function downloadUrl(url: string, name: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

interface ResultPanelProps {
  run: RunStatusDto | null;
  submitting: boolean;
  expectedCount: number;
  ratio: Ratio;
}

/** 生成结果卡片区：占位 → 排队/生成中（进度条）→ 图片（悬浮 下载/详情）/ 失败原因 */
export function ResultPanel({ run, submitting, expectedCount, ratio }: ResultPanelProps) {
  const openDetailById = useAppStore((s) => s.openDetailById);
  const aspect = RATIO_ASPECT[ratio];
  const cells: (JobStatusDto | null)[] =
    run?.jobs ?? Array.from({ length: expectedCount }, () => null);

  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-[12.5px] font-bold">生成结果</span>
        <span className="text-[11px] text-faint">
          {run
            ? `Run ${run.status === 'succeeded' ? '完成' : run.status === 'partial' ? '部分成功' : run.status === 'failed' ? '失败' : '进行中'} · ${run.runId.slice(0, 12)}…`
            : '成功后自动存入资产库'}
        </span>
      </div>
      <div className={cn('grid gap-3', cells.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
        {cells.map((job, i) => (
          <div
            key={job?.jobId ?? i}
            className={cn(
              'group relative grid place-items-center overflow-hidden rounded-xl border border-line-soft bg-[#0c1017] text-center text-[11.5px] text-faint',
              aspect,
            )}
          >
            {job?.status === 'succeeded' && job.resultUrl ? (
              <>
                <img src={job.resultUrl} alt="生成结果" className="h-full w-full object-cover" />
                <div className="absolute inset-x-2 bottom-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    size="sm"
                    className="flex-1 bg-[rgba(14,17,22,0.85)]"
                    onClick={() => downloadUrl(job.resultUrl!, `hitframe_${job.jobId}.png`)}
                  >
                    <Download size={12} /> 下载
                  </Button>
                  {job.resultAssetId && (
                    <Button
                      size="sm"
                      className="flex-1 bg-[rgba(14,17,22,0.85)]"
                      onClick={() => void openDetailById(job.resultAssetId!)}
                    >
                      <Info size={12} /> 详情
                    </Button>
                  )}
                </div>
              </>
            ) : job?.status === 'failed' ? (
              <div className="px-3">
                <div className="mb-1 text-base">⚠️</div>
                <div className="text-err">生成失败（不扣点）</div>
                <div className="mt-1 line-clamp-3 text-[10.5px] text-faint">
                  {job.error ?? '未知错误'}
                </div>
              </div>
            ) : job || submitting ? (
              <div className="w-full px-4">
                <div>{job ? STATUS_TEXT[job.status] : '提交中…'}</div>
                <div className="mx-auto mt-2 h-[5px] w-full overflow-hidden rounded bg-white/10">
                  <div className="hf-progress h-full w-2/5 rounded bg-gradient-to-r from-accent to-vio" />
                </div>
                <div className="mt-2 text-[10.5px] text-faint">
                  单张约 30–70 秒，可离开页面稍后在资产库查看
                </div>
              </div>
            ) : (
              <span>
                结果 {i + 1}
                <br />
                待生成
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
