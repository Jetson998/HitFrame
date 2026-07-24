import { useEffect, useState } from 'react';
import {
  POINTS_PER_IMAGE,
  type GenerationRequestDto,
  type Quality,
  type Ratio,
} from '@hitframe/shared';
import { Sparkles } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useRunPolling } from '@/lib/useRunPolling';
import { useAppStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { AssetPicker } from '@/components/AssetPicker';
import { OutputSettings } from '@/components/OutputSettings';
import { ResultPanel } from '@/components/ResultPanel';
import { TemplateCards } from '@/pages/TemplateCards';

/** 示例提示词：完整结构（主体 + 场景 + 光影 + 风格），有构图有意义 */
const SUGGESTIONS = [
  '霓虹雨夜的赛博朋克街头，机车女骑手侧身回眸，青紫霓虹倒映在湿漉路面，电影感低角度构图',
  '白衬衫女生坐在落地窗前的晨光里，浅景深人像，发丝逆光，胶片质感，时尚杂志封面构图',
  '磨砂玻璃精华液瓶立于弧形米色石台，侧逆光勾勒瓶身轮廓，水珠特写，高端护肤品电商主图',
  '深蓝渐变背景中悬浮的无线耳机，一束棱镜光斜穿画面，金属细节锐利，科技感产品海报',
  '午后咖啡馆木桌上的手冲咖啡与翻开的书，暖光斜照，蒸汽可见，生活方式杂志风',
];

/** AI 图片主页面：三 Tab（图生图 / 文生图 / 场景模板），同一套生成底座三种输入结构 */
export function GeneratePage() {
  const {
    genMode,
    setGenMode,
    refAssetId,
    setRefAssetId,
    currentProjectId,
    refreshMe,
    refreshAssets,
    showToast,
  } = useAppStore();
  const [prompt, setPrompt] = useState('');
  const consumePendingPrompt = useAppStore((s) => s.consumePendingPrompt);
  // 案例墙「用这个提示词」回填
  useEffect(() => {
    const pending = consumePendingPrompt();
    if (pending) setPrompt(pending);
  }, [consumePendingPrompt]);
  const [ratio, setRatio] = useState<Ratio>('1:1');
  const [quality, setQuality] = useState<Quality>('standard');
  const [count, setCount] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const { run, start, reset } = useRunPolling(() => {
    void refreshMe();
    void refreshAssets();
  });

  const cost = count * POINTS_PER_IMAGE[quality];

  const submit = async () => {
    if (submitting) return;
    if (genMode === 'i2i' && !refAssetId) {
      showToast('图生图请先选一张参考图');
      return;
    }
    if (genMode === 't2i' && !prompt.trim()) {
      showToast('文生图请先填写提示词');
      return;
    }
    setSubmitting(true);
    reset();
    const dto: GenerationRequestDto = {
      mode: genMode === 'i2i' ? 'i2i' : 't2i',
      inputs: {
        prompt: prompt.trim() || undefined,
        slots: genMode === 'i2i' && refAssetId ? [refAssetId] : undefined,
      },
      options: { ratio, quality, candidateCount: count },
      idempotencyKey: crypto.randomUUID(),
      projectId: currentProjectId ?? undefined,
    };
    try {
      const accepted = await api.createGeneration(dto);
      showToast(`已入队 ${accepted.jobs.length} 个生成任务 · 预估 ${accepted.pointsEstimated} 点`);
      start(accepted.runId);
    } catch (err) {
      showToast(
        err instanceof ApiError && err.status === 402
          ? (err.message ?? '点数不足')
          : `提交失败：${(err as Error).message}`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] px-8 py-8">
      <h1 className="m-0 text-[22px] font-bold">AI 图片</h1>
      <p className="mt-1.5 mb-4 text-[13px] text-dim">
        同一套生成底座，三种输入结构：参考图 + 提示词｜提示词｜图片槽位 + 业务变量。
      </p>
      <div className="mb-4 flex gap-1.5">
        {(
          [
            ['i2i', '图生图'],
            ['t2i', '文生图'],
            ['template', '场景模板'],
          ] as const
        ).map(([mode, label]) => (
          <Chip
            key={mode}
            active={genMode === mode}
            className="px-3.5 py-1.5 text-[12px]"
            onClick={() => setGenMode(mode)}
          >
            {label}
          </Chip>
        ))}
      </div>

      {genMode === 'template' ? (
        <TemplateCards />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[360px_1fr]">
          <div className="rounded-[--radius-card] border border-line bg-panel p-4">
            {genMode === 'i2i' && (
              <div className="mb-3.5">
                <AssetPicker label="参考图" required value={refAssetId} onChange={setRefAssetId} />
              </div>
            )}
            <div className="mb-2 text-[11.5px] font-semibold text-dim">
              提示词 {genMode === 't2i' && <span className="text-primary">*</span>}
              {genMode === 'i2i' && (
                <span className="font-normal text-faint">（可留空，默认同风格新图）</span>
              )}
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="主体 + 场景 + 光影 + 风格，例如：霓虹雨夜的赛博朋克街头，机车女骑手回眸，电影感构图"
              className="min-h-[72px] w-full resize-y rounded-[10px] border border-line bg-panel-muted px-3 py-2.5 text-[12.5px] text-ink placeholder:text-faint focus:border-primary focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <Chip key={s} onClick={() => setPrompt((p) => (p ? `${p}，${s}` : s))}>
                  {s}
                </Chip>
              ))}
            </div>
            <OutputSettings
              ratio={ratio}
              quality={quality}
              count={count}
              onRatio={setRatio}
              onQuality={setQuality}
              onCount={setCount}
            />
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              disabled={submitting}
              onClick={() => void submit()}
            >
              <Sparkles size={14} /> {submitting ? '提交中…' : `生成 · ${cost} 点`}
            </Button>
          </div>
          <ResultPanel run={run} submitting={submitting} expectedCount={count} ratio={ratio} />
        </div>
      )}
    </div>
  );
}
