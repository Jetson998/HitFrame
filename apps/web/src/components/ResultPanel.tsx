import { useState } from 'react';
import type { JobStatusDto, Ratio, RunStatusDto } from '@hitframe/shared';
import { Download, Expand, Images, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

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
  ratio?: Ratio;
  /** 失败时「重新发起一单」（S5：不做程序化死信重放，重发走统一 hold/queue 链路） */
  onRetry?: () => void;
  className?: string;
  emptyDescription?: string;
  variant?: 'card' | 'canvas';
}

/** 生成结果卡片区：占位 → 排队/生成中（进度条）→ 图片（悬浮 下载/详情）/ 失败原因 */
export function ResultPanel({
  run,
  submitting,
  expectedCount,
  ratio,
  onRetry,
  className,
  emptyDescription = '完成左侧创作设置，生成后可直接下载或进入资产详情。',
  variant = 'card',
}: ResultPanelProps) {
  const openDetailById = useAppStore((s) => s.openDetailById);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const isCanvas = variant === 'canvas';
  const aspect = ratio ? RATIO_ASPECT[ratio] : 'aspect-square';
  const cells: (JobStatusDto | null)[] =
    run?.jobs ?? Array.from({ length: expectedCount }, () => null);

  return (
    <>
      <div
        className={cn(
          'flex flex-col bg-panel',
          isCanvas
            ? 'min-h-0 overflow-hidden p-2 md:p-3'
            : 'rounded-[var(--radius-card)] border border-line bg-panel p-4 shadow-[var(--shadow-card)]',
          className,
        )}
      >
      {!isCanvas && (
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-[14px] font-semibold">生成结果</span>
          {run && (
            <span className="text-[11px] text-faint">
              {run.status === 'succeeded'
                ? '任务完成'
                : run.status === 'partial'
                  ? '部分完成'
                  : run.status === 'failed'
                    ? '任务失败'
                    : '生成进行中'}
            </span>
          )}
        </div>
      )}
      {!run && !submitting ? (
        <div
          className={cn(
            'grid min-h-[380px] flex-1 place-items-center px-8 text-center',
            isCanvas
              ? 'bg-panel'
              : 'rounded-[var(--radius-control)] border border-dashed border-line bg-panel-muted',
          )}
        >
          <div>
            <div
              className={cn(
                'mx-auto mb-4 grid place-items-center text-faint',
                isCanvas
                  ? 'h-16 w-16 rounded-[var(--radius-image)] bg-panel-muted'
                  : 'h-12 w-12 rounded-[var(--radius-button)] bg-primary-soft text-primary',
              )}
            >
              <Images size={isCanvas ? 26 : 22} />
            </div>
            <div className="text-[15px] font-semibold text-ink">生成结果会显示在这里</div>
            <p className="mx-auto mt-2 max-w-[380px] text-[12px] leading-relaxed text-faint">
              {emptyDescription}
            </p>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            'grid min-h-0 flex-1 gap-3',
            cells.length === 1
              ? isCanvas
                ? 'grid-cols-1'
                : 'mx-auto w-full max-w-[720px] grid-cols-1 content-center'
              : 'grid-cols-2 content-start overflow-y-auto',
          )}
        >
          {cells.map((job, i) => (
            <div
              key={job?.jobId ?? i}
              className={cn(
                'group relative grid place-items-center overflow-hidden rounded-[var(--radius-control)] border border-line-soft bg-panel-muted text-center text-[11.5px] text-faint',
                isCanvas && cells.length === 1 ? 'h-full min-h-0 w-full' : aspect,
              )}
            >
              {job?.status === 'succeeded' && job.resultUrl ? (
                <>
                  <button
                    type="button"
                    aria-label={`放大结果 ${i + 1}`}
                    onClick={() =>
                      setPreview({ url: job.resultUrl!, name: `生成结果 ${i + 1}` })
                    }
                    className="absolute inset-0 grid cursor-zoom-in place-items-center"
                  >
                    <img
                      src={job.resultUrl}
                      alt={`生成结果 ${i + 1}`}
                      className="h-full w-full object-contain"
                    />
                    <span className="absolute right-2 top-2 inline-flex h-7 items-center gap-1 rounded-[7px] bg-black/55 px-2 text-[10.5px] font-medium text-white opacity-100 backdrop-blur-sm transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100">
                      <Expand size={12} /> 放大
                    </span>
                  </button>
                  <div className="absolute inset-x-2 bottom-2 z-10 flex gap-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <Button
                      size="sm"
                      className="flex-1 bg-white/90 backdrop-blur-sm"
                      onClick={() => downloadUrl(job.resultUrl!, `hitframe_${job.jobId}.png`)}
                    >
                      <Download size={12} /> 下载
                    </Button>
                    {job.resultAssetId && (
                      <Button
                        size="sm"
                        className="flex-1 bg-white/90 backdrop-blur-sm"
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
                  {/* S4 脱敏文案：job.error 已是 JOB_ERROR_CATALOG 目录文案，非原始 error */}
                  <div className="mt-1 line-clamp-3 text-[10.5px] text-faint">
                    {job.error ?? '未知错误'}
                  </div>
                  {onRetry && (
                    <Button size="sm" className="mt-2 bg-white/90" onClick={onRetry}>
                      重新发起一单
                    </Button>
                  )}
                </div>
              ) : job || submitting ? (
                <div className="w-full px-4">
                  <div>{job ? STATUS_TEXT[job.status] : '提交中…'}</div>
                  <div className="mx-auto mt-2 h-[5px] w-full overflow-hidden rounded bg-[#172b4d]/10">
                    <div className="hf-progress h-full w-2/5 rounded bg-gradient-to-r from-primary to-accent" />
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
      )}
      </div>

      <Dialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent
          aria-label="生成结果大图预览"
          className="grid h-screen max-h-none w-screen max-w-none place-items-center rounded-none border-0 bg-[#080b12]/95 p-5 shadow-none [&>button]:right-5 [&>button]:top-5 [&>button]:z-10 [&>button]:rounded-full [&>button]:bg-white/10 [&>button]:p-2.5 [&>button]:text-white [&>button:hover]:bg-white/20"
          onClick={() => setPreview(null)}
        >
          <DialogTitle className="sr-only">{preview?.name ?? '生成结果'}大图预览</DialogTitle>
          <DialogDescription className="sr-only">关闭后返回当前生成工作区</DialogDescription>
          {preview && (
            <img
              src={preview.url}
              alt={preview.name}
              className="max-h-[calc(100vh-40px)] max-w-[calc(100vw-40px)] object-contain"
              onClick={(event) => event.stopPropagation()}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
