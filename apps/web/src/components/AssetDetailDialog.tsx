import { useEffect, useState } from 'react';
import type { Quality, Ratio } from '@hitframe/shared';
import {
  Check,
  Copy,
  Download,
  Expand,
  Image as ImageIcon,
  RefreshCw,
  Repeat2,
  Star,
  Trash2,
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { downloadUrl } from '@/components/ResultPanel';
import { api } from '@/lib/api';
import { formatBytes } from '@/lib/utils';
import { useAppStore } from '@/store';

const SIZE_TO_RATIO: Record<string, Ratio> = {
  '1024x1024': '1:1',
  '1024x1536': '3:4',
  '1536x1024': '4:3',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function displayType(type: 'source' | 'result'): string {
  return type === 'source' ? '上传素材' : '生成结果';
}

function qualityLabel(value: unknown): string {
  if (value === 'preview') return '预览';
  if (value === 'high') return '高清';
  return '标准';
}

function displayPrompt(prompt: string) {
  const parts = prompt.split(/(Image\s+\d+|@(?:图片|圖片)\s*\d+)/g);
  return parts.map((part, index) =>
    /^(?:Image\s+\d+|@(?:图片|圖片)\s*\d+)$/.test(part) ? (
      <span key={`${part}-${index}`} className="font-semibold text-primary">
        {part}
      </span>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}

function inferTemplateVars(templateId: string | undefined, prompt: string, value: unknown) {
  const vars = isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).filter(([, item]) => typeof item === 'string') as Array<[
          string,
          string
        ]>,
      )
    : {};
  // 旧资产快照没有保存 vars 时，从海报最终提示词尽量恢复必填标题。
  if (templateId === 'tpl_poster' && !vars.title) {
    const match = /标题["“]([^"”]*)["”]/.exec(prompt);
    if (match?.[1]) vars.title = match[1];
  }
  return vars;
}

/** 资产详情弹窗：大图为主视觉，参数、提示词、归属和操作作为辅助信息。 */
export function AssetDetailDialog() {
  const {
    detailAsset: asset,
    closeDetail,
    referAsset,
    projects,
    assets,
    refreshAssets,
    showToast,
    openGenerationDraft,
  } = useAppStore();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    setFavorite(Boolean(asset?.meta?.favorite));
    setCopied(false);
    setPreviewOpen(false);
    setNaturalSize(null);
  }, [asset?.id, asset?.meta?.favorite]);

  if (!asset) return null;

  const gp = (asset.genParams ?? {}) as Record<string, unknown>;
  const isResult = asset.type === 'result';
  const prompt = typeof gp.prompt === 'string' ? gp.prompt : '';
  const mode = gp.mode === 't2i' || gp.mode === 'i2i' || gp.mode === 'template' ? gp.mode : null;
  const templateId = typeof gp.templateId === 'string' ? gp.templateId : undefined;
  const referenceIds = Array.isArray(gp.slots)
    ? gp.slots.filter((id): id is string => typeof id === 'string')
    : [];
  const referenceAssets = referenceIds.map((id, index) => ({
    asset: assets.find((item) => item.id === id),
    imageNumber: index + 1,
  }));
  const requestedSize = typeof gp.size === 'string' ? gp.size : undefined;
  const ratio = requestedSize ? SIZE_TO_RATIO[requestedSize] : undefined;
  const dimension = naturalSize
    ? `${naturalSize.width} × ${naturalSize.height}`
    : requestedSize
      ? requestedSize.replace('x', ' × ')
      : '自动比例';
  const sourceFormat = asset.meta?.mimetype?.split('/')[1]?.toLocaleUpperCase();
  const specification = isResult
    ? [dimension, qualityLabel(gp.quality), `${Number(gp.candidateCount) || 1} 张`].join(' · ')
    : [dimension, sourceFormat].filter(Boolean).join(' · ');

  const updateDetailAsset = (patch: Partial<typeof asset>) => {
    useAppStore.setState({ detailAsset: { ...asset, ...patch } });
  };

  const reassign = async (projectId: string | null) => {
    setBusy(true);
    try {
      await api.updateAsset(asset.id, { projectId });
      await refreshAssets();
      updateDetailAsset({ projectId });
      showToast(
        projectId
          ? `已归入「${projects.find((p) => p.id === projectId)?.name ?? projectId}」`
          : '已移回未归类',
      );
    } catch (err) {
      showToast(`改归属失败：${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const toggleFavorite = async () => {
    const next = !favorite;
    setFavorite(next);
    setBusy(true);
    try {
      await api.updateAsset(asset.id, { favorite: next });
      await refreshAssets();
      updateDetailAsset({ meta: { ...asset.meta, favorite: next } });
      showToast(next ? '已加入收藏' : '已取消收藏');
    } catch (err) {
      setFavorite(!next);
      showToast(`收藏更新失败：${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const copyPrompt = async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      showToast('提示词已复制');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast('复制失败，请手动选择提示词');
    }
  };

  const restoreGenerationDraft = () => {
    if (!isResult || !mode || !prompt) {
      showToast('该资产没有可复用的生成参数');
      return;
    }
    if (mode === 'template' && !templateId) {
      showToast('缺少模板信息，暂时无法重新生成');
      return;
    }
    const vars = inferTemplateVars(templateId, prompt, gp.vars);
    const quality: Quality =
      gp.quality === 'preview' ? 'preview' : gp.quality === 'high' ? 'high' : 'standard';
    const candidateCount = Number.isInteger(gp.candidateCount)
      ? Math.min(4, Math.max(1, Number(gp.candidateCount)))
      : 1;
    const originalPrompt =
      typeof gp.userPrompt === 'string'
        ? gp.userPrompt
        : mode === 'template'
          ? ''
          : prompt
              .replace(/^输入图片按提交顺序编号：[\s\S]*?请严格按编号使用对应图片。\s*/u, '')
              .replace(/Image\s+(\d+)/g, '@图片 $1');

    openGenerationDraft({
      mode,
      templateId,
      prompt: originalPrompt,
      slots: referenceIds,
      vars: mode === 'template' ? vars : undefined,
      ratio,
      quality,
      count: candidateCount,
      projectId: asset.projectId,
    });
    showToast('已恢复生成参数，请确认后生成');
  };

  const remove = async () => {
    if (!window.confirm(`确认删除「${asset.name}」？文件将一并删除，不可恢复。`)) return;
    setBusy(true);
    try {
      await api.deleteAsset(asset.id);
      await refreshAssets();
      closeDetail();
      showToast('已删除');
    } catch (err) {
      showToast(`删除失败：${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          setPreviewOpen(false);
          closeDetail();
        }
      }}
    >
      <DialogContent className="max-w-[1060px] overflow-visible border-0 bg-transparent shadow-none">
        <div className="grid grid-cols-1 overflow-hidden rounded-[var(--radius-card)] border border-line bg-panel shadow-[0_18px_52px_rgba(23,43,77,0.2)] md:h-[min(72vh,560px)] md:grid-cols-[minmax(0,1.32fr)_minmax(320px,0.68fr)]">
          <button
            type="button"
            aria-label="放大预览"
            onClick={() => setPreviewOpen(true)}
            className="group relative flex min-h-[280px] max-h-[38vh] cursor-zoom-in items-center justify-center overflow-hidden bg-[#11151f] md:h-full md:min-h-0 md:max-h-none"
          >
            <img
              src={asset.url}
              alt={asset.name}
              onLoad={(event) =>
                setNaturalSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
              className="max-h-full max-w-full object-contain"
            />
            <span className="pointer-events-none absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1.5 text-[11px] font-medium text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
              <Expand size={13} /> 放大
            </span>
          </button>

          <div className="grid min-h-0 max-h-[46vh] grid-rows-[auto_minmax(0,1fr)_auto] bg-panel p-5 md:h-full md:max-h-none">
            <div className="flex min-w-0 shrink-0 items-center gap-2 pr-7">
              <DialogTitle className="min-w-0 truncate text-[13px] font-normal text-ink">
                {asset.name}
              </DialogTitle>
              <span
                className={`shrink-0 rounded-[6px] px-1.5 py-0.5 text-[10px] font-normal ${
                  isResult ? 'bg-primary-soft text-primary' : 'bg-ok/10 text-ok'
                }`}
              >
                {displayType(asset.type)}
              </span>
              <DialogDescription className="sr-only">资产详情</DialogDescription>
            </div>

            <div className="mt-4 min-h-0 space-y-4 overflow-y-auto pr-1">
              {referenceAssets.length > 0 && (
                <section>
                  <div className="mb-1.5 text-[11px] font-medium text-dim">参考图</div>
                  <div className="flex min-w-0 flex-nowrap gap-2 overflow-x-auto pb-1">
                    {referenceAssets.map(({ asset: reference, imageNumber }) => (
                      <div
                        key={reference?.id ?? `${asset.id}-missing-reference-${imageNumber}`}
                        className="flex shrink-0 items-center gap-1.5 rounded-[7px] border border-line-soft bg-panel px-1.5 py-1"
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-[5px] bg-panel-muted">
                          {reference?.url ? (
                            <img src={reference.url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <ImageIcon size={13} className="text-faint" />
                          )}
                        </span>
                        <span className="max-w-[88px] truncate text-[10.5px] text-dim">
                          @图片 {imageNumber}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {isResult && prompt && (
                <section>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-dim">提示词</span>
                    <button
                      type="button"
                      onClick={() => void copyPrompt()}
                      className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-control)] px-2 text-[10.5px] font-medium text-primary transition-colors hover:bg-primary-soft"
                    >
                      {copied ? <Check size={12} /> : <Copy size={12} />}
                      {copied ? '已复制' : '复制'}
                    </button>
                  </div>
                  <div className="max-h-[240px] overflow-y-auto whitespace-pre-wrap break-words rounded-[var(--radius-control)] border border-line-soft bg-panel px-3 py-2.5 text-[11.5px] leading-relaxed text-dim">
                    {displayPrompt(prompt)}
                  </div>
                </section>
              )}
            </div>

            <div className="mt-4 shrink-0">
              <label className="flex h-9 items-center gap-2 rounded-[var(--radius-control)] border border-line-soft bg-panel-muted px-2.5">
                <span className="shrink-0 text-[10.5px] text-faint">归属项目</span>
                <select
                  value={asset.projectId ?? ''}
                  disabled={busy}
                  onChange={(event) => void reassign(event.target.value || null)}
                  className="min-w-0 flex-1 cursor-pointer bg-transparent text-right text-[11.5px] text-ink focus:outline-none"
                >
                  <option value="">未归类</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <section className="mt-3 space-y-1.5 border-t border-line-soft pt-3 text-[10.5px]">
                <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-2">
                  <span className="text-faint">创建时间</span>
                  <span className="truncate text-right text-dim">
                    {new Date(asset.createdAt).toLocaleString('zh-CN')}
                  </span>
                </div>
                <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-2">
                  <span className="text-faint">规格</span>
                  <span className="truncate text-right text-dim" title={`${specification} · ${formatBytes(asset.meta?.bytes)}`}>
                    {specification} · {formatBytes(asset.meta?.bytes)}
                  </span>
                </div>
              </section>
            </div>
          </div>
        </div>

        <div className="absolute left-1/2 top-[calc(100%+12px)] flex w-[min(calc(100vw-24px),760px)] -translate-x-1/2 items-center gap-1.5 rounded-[14px] border border-line bg-panel/95 p-2 shadow-[0_12px_34px_rgba(23,43,77,0.2)] backdrop-blur-xl">
          <Button className="h-10 min-w-0 flex-1" size="sm" onClick={() => downloadUrl(asset.url, `${asset.name}.png`)}>
            <Download size={14} /> 下载
          </Button>
          <Button className="h-10 min-w-0 flex-1" variant="primary" size="sm" onClick={() => referAsset(asset.id)}>
            <Repeat2 size={14} /> 引用
          </Button>
          <Button className="h-10 min-w-0 flex-1" size="sm" disabled={busy || !isResult || !mode} onClick={restoreGenerationDraft}>
            <RefreshCw size={14} /> 重新生成
          </Button>
          <Button
            className={`h-10 min-w-0 flex-1 ${favorite ? 'border-warn/40 bg-warn/8 text-warn' : ''}`}
            size="sm"
            disabled={busy}
            onClick={() => void toggleFavorite()}
          >
            <Star size={14} className={favorite ? 'fill-current' : undefined} />
            {favorite ? '已收藏' : '收藏'}
          </Button>
          <button
            type="button"
            aria-label="删除资产"
            title="删除资产"
            disabled={busy}
            onClick={() => void remove()}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-control)] border border-line-soft text-faint transition-colors hover:border-err/30 hover:bg-err/5 hover:text-err disabled:opacity-50"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </DialogContent>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent
          aria-label="图片预览"
          className="grid h-screen max-h-none w-screen max-w-none place-items-center rounded-none border-0 bg-[#080b12]/95 p-5 shadow-none [&>button]:right-5 [&>button]:top-5 [&>button]:z-10 [&>button]:rounded-full [&>button]:bg-white/10 [&>button]:p-2.5 [&>button]:text-white [&>button:hover]:bg-white/20"
          onClick={() => setPreviewOpen(false)}
        >
          <DialogTitle className="sr-only">{asset.name} 大图预览</DialogTitle>
          <DialogDescription className="sr-only">关闭后返回资产详情</DialogDescription>
          <img
            src={asset.url}
            alt={asset.name}
            className="max-h-[calc(100vh-40px)] max-w-[calc(100vw-40px)] object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
