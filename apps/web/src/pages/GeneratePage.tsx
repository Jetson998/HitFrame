import { useEffect, useRef, useState } from 'react';
import {
  MAX_REFERENCE_IMAGES,
  POINTS_PER_IMAGE,
  type GenerationRequestDto,
  type PromptCompileResponseDto,
  type PromptMode,
  type Quality,
  type Ratio,
} from '@hitframe/shared';
import { MessageSquareText, Sparkles } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useRunPolling } from '@/lib/useRunPolling';
import { useAppStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { AssetPicker } from '@/components/AssetPicker';
import { OutputSettings } from '@/components/OutputSettings';
import { ResultPanel } from '@/components/ResultPanel';
import { TemplateCards } from '@/pages/TemplateCards';
import { GenerationModeTabs } from '@/components/GenerationModeTabs';
import { PromptModeSelect, PromptReviewDialog } from '@/components/PromptReviewDialog';
import {
  ReferencePromptEditor,
  REMOVED_IMAGE_REFERENCE,
  remapImageReferences,
} from '@/components/ReferencePromptEditor';
import {
  GENERATION_PRESETS,
  resolveGenerationPreset,
  type GenerationPreset,
} from '@/lib/generation-presets';

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
    assets,
    pendingGenerationDraft,
    consumeGenerationDraft,
    openAgentDraft,
  } = useAppStore();
  const [refAssetIds, setRefAssetIds] = useState<string[]>(() => (refAssetId ? [refAssetId] : []));
  const [prompt, setPrompt] = useState('');
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const consumePendingPrompt = useAppStore((s) => s.consumePendingPrompt);
  // 案例墙「用这个提示词」回填
  useEffect(() => {
    const pending = consumePendingPrompt();
    if (pending) setPrompt(pending);
  }, [consumePendingPrompt]);
  useEffect(() => {
    const textarea = promptTextareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [prompt]);
  const [ratio, setRatio] = useState<Ratio>('1:1');
  const [autoRatio, setAutoRatio] = useState(true);
  const [quality, setQuality] = useState<Quality>('standard');
  const [count, setCount] = useState(1);
  const [promptMode, setPromptMode] = useState<PromptMode>('raw');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [compilingPrompt, setCompilingPrompt] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [compilation, setCompilation] = useState<PromptCompileResponseDto | null>(null);
  const [agentPrompt, setAgentPrompt] = useState('');
  const [selectedPrompt, setSelectedPrompt] = useState<'raw' | 'agent'>('agent');
  const [submitting, setSubmitting] = useState(false);
  const { run, start, reset } = useRunPolling(() => {
    void refreshMe();
    void refreshAssets();
  });

  // 资产详情的“重新生成”只恢复草稿；用户确认后仍需手动点击生成。
  useEffect(() => {
    if (!pendingGenerationDraft || pendingGenerationDraft.mode === 'template') return;
    const draft = consumeGenerationDraft();
    if (!draft || draft.mode === 'template') return;

    const nextReferenceIds = draft.slots.slice(0, MAX_REFERENCE_IMAGES);
    setRefAssetIds(nextReferenceIds);
    setRefAssetId(nextReferenceIds[0] ?? null);
    setPrompt(draft.prompt ?? '');
    setRatio(draft.ratio ?? '1:1');
    setAutoRatio(!draft.ratio);
    setQuality(draft.quality);
    setCount(draft.count);
    setSubmitting(false);
    reset();
  }, [consumeGenerationDraft, pendingGenerationDraft, reset, setRefAssetId]);

  const cost = count * POINTS_PER_IMAGE[quality];
  const referenceImages = refAssetIds.map((assetId, index) => {
    const asset = assets.find((item) => item.id === assetId);
    return {
      assetId,
      name: asset?.name || `图片 ${index + 1}`,
      url: asset?.url,
    };
  });
  const recentReferenceImages = assets
    .slice()
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 12)
    .map((asset) => ({
      assetId: asset.id,
      name: asset.name || (asset.type === 'source' ? '上传素材' : '生成作品'),
      url: asset.url,
    }));
  const updateReferenceIds = (next: string[]) => {
    setPrompt((current) => remapImageReferences(current, refAssetIds, next));
    setRefAssetIds(next);
    setRefAssetId(next[0] ?? null);
  };
  const addReferenceFromPrompt = (assetId: string) => {
    if (refAssetIds.includes(assetId)) return true;
    if (refAssetIds.length >= MAX_REFERENCE_IMAGES) {
      showToast(`最多添加 ${MAX_REFERENCE_IMAGES} 张参考图片`);
      return false;
    }
    updateReferenceIds([...refAssetIds, assetId]);
    return true;
  };
  const hasRemovedReference = prompt.includes(REMOVED_IMAGE_REFERENCE);
  const updatePrompt = (value: string) => setPrompt(value);
  const applyPreset = (preset: GenerationPreset) => {
    const resolved = resolveGenerationPreset(assets, preset.assetName);
    if (!resolved || resolved.mode !== genMode) {
      showToast(`案例「${preset.label}」暂不可用，请刷新资产库后重试`);
      return;
    }

    const nextReferenceIds = genMode === 'i2i' ? resolved.referenceAssetIds : [];
    setRefAssetIds(nextReferenceIds);
    setRefAssetId(nextReferenceIds[0] ?? null);
    updatePrompt(preset.promptOverride ?? resolved.prompt);
    reset();
    showToast(`已带入「${preset.label}」提示词${nextReferenceIds.length ? '和参考图' : ''}`);
  };
  const changeGenerationMode = (next: typeof genMode) => {
    setGenMode(next);
  };
  const blockedMessage =
    genMode === 'i2i' && hasRemovedReference
      ? '请处理已移除的图片引用'
      : genMode === 't2i' && !prompt.trim()
        ? '请先填写提示词'
        : genMode === 'i2i' && !refAssetIds.length
          ? '请先选择参考图'
          : null;

  const submit = async (promptOverride = prompt.trim(), promptCompilationId?: string) => {
    if (submitting) return;
    if (genMode === 'i2i' && !refAssetIds.length) {
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
        prompt: promptOverride || undefined,
        slots: genMode === 'i2i' && refAssetIds.length ? refAssetIds : undefined,
      },
      options: {
        ...(autoRatio ? {} : { ratio }),
        quality,
        candidateCount: count,
      },
      promptCompilationId,
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

  const prepareGenerate = async () => {
    if (blockedMessage || submitting || compilingPrompt) return;
    if (promptMode === 'raw') {
      await submit();
      return;
    }
    setSelectedPrompt('agent');
    setCompilation(null);
    setAgentPrompt('');
    setCompileError(null);
    setReviewOpen(true);
    setCompilingPrompt(true);
    try {
      const result = await api.compilePrompt({
        mode: promptMode,
        generationMode: genMode === 'i2i' ? 'i2i' : 't2i',
        rawPrompt: prompt.trim(),
        references: refAssetIds.map((assetId) => ({ assetId, role: 'product', fidelity: 'strict' })),
        controls: {
          ratio: autoRatio ? undefined : ratio,
          quality,
          candidateCount: count,
        },
      });
      setCompilation(result);
      setAgentPrompt(result.compiledPrompt);
    } catch (error) {
      setCompileError(error instanceof Error ? error.message : '创意导演暂时不可用');
    } finally {
      setCompilingPrompt(false);
    }
  };

  return (
    <div className="w-full">
      {genMode === 'template' ? (
        <div className="min-h-full bg-panel">
          <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line-soft bg-panel px-5 py-2 md:px-6">
            <div className="flex shrink-0 items-center gap-2.5">
              <Sparkles size={16} className="text-primary" />
              <span className="text-[13px] font-semibold text-ink">AI 图片</span>
            </div>
            <div className="min-w-0 max-w-[290px] flex-1">
              <GenerationModeTabs activeMode={genMode} onChange={changeGenerationMode} />
            </div>
          </div>
          <div className="px-5 py-6 md:px-6 md:py-8">
            <TemplateCards />
          </div>
        </div>
      ) : (
        <div className="grid bg-panel lg:h-screen lg:min-h-[620px] lg:grid-cols-[420px_minmax(0,1fr)]">
          <section
            aria-label="创作控制区"
            className="flex min-h-0 flex-col border-b border-line-soft bg-panel lg:border-r lg:border-b-0"
          >
            <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line-soft bg-panel px-5 py-2 md:px-6">
              <div className="flex shrink-0 items-center gap-2.5">
                <Sparkles size={16} className="text-primary" />
                <span className="text-[13px] font-semibold text-ink">AI 图片</span>
              </div>
              <div className="min-w-0 max-w-[290px] flex-1">
                <GenerationModeTabs activeMode={genMode} onChange={changeGenerationMode} />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-panel px-5 py-5">
              {genMode === 'i2i' && (
                <div className="mb-4 overflow-visible rounded-[var(--radius-card)] border border-line-soft bg-panel shadow-[0_0_14px_-6px_rgba(18,27,44,0.38)] transition-shadow hover:shadow-[0_0_18px_-6px_rgba(18,27,44,0.46)] focus-within:shadow-[0_0_18px_-6px_rgba(18,27,44,0.46)]">
                  <div className="overflow-visible p-3.5">
                    <AssetPicker
                      label="参考图"
                      required
                      value={refAssetIds[0] ?? null}
                      onChange={(assetId) => {
                        const next = assetId ? [assetId] : [];
                        updateReferenceIds(next);
                      }}
                      compact
                      showLabel={false}
                      multiple
                      maxItems={MAX_REFERENCE_IMAGES}
                      values={refAssetIds}
                      onValuesChange={updateReferenceIds}
                    />
                  </div>
                  <div className="border-t border-line-soft px-3.5 py-3.5">
                    <ReferencePromptEditor
                      value={prompt}
                      onChange={updatePrompt}
                      images={referenceImages}
                      availableImages={recentReferenceImages}
                      onReferenceSelect={addReferenceFromPrompt}
                      maxImages={MAX_REFERENCE_IMAGES}
                    />
                    {hasRemovedReference && (
                      <div className="mt-2 text-[10.5px] leading-relaxed text-err">
                        已引用的图片被移除，请删除“{REMOVED_IMAGE_REFERENCE}”后重新 @ 图片。
                      </div>
                    )}
                  </div>
                </div>
              )}
              {genMode === 't2i' && (
                <textarea
                  ref={promptTextareaRef}
                  value={prompt}
                  onChange={(e) => updatePrompt(e.target.value)}
                  placeholder="描述你的生图需求"
                  aria-label="描述你的生图需求"
                  className="min-h-[180px] max-h-[420px] w-full resize-y overflow-y-auto rounded-[var(--radius-card)] border border-line-soft bg-panel px-3.5 py-3 text-[13px] leading-relaxed text-ink shadow-[0_0_14px_-6px_rgba(18,27,44,0.38)] transition-shadow placeholder:text-faint hover:shadow-[0_0_18px_-6px_rgba(18,27,44,0.46)] focus:border-primary focus:outline-none focus:shadow-[0_0_18px_-6px_rgba(18,27,44,0.46)]"
                />
              )}
              <div className="mt-2.5">
                <div className="mb-1.5 text-[10.5px] text-faint">试试这些</div>
                <div className="flex flex-wrap gap-1.5">
                  {GENERATION_PRESETS[genMode].map((suggestion) => {
                    const resolved = resolveGenerationPreset(assets, suggestion.assetName);
                    return (
                      <Chip
                        key={suggestion.assetName}
                        title={
                          suggestion.promptOverride ?? resolved?.prompt ?? suggestion.assetName
                        }
                        className="h-8 px-3 text-[11.5px]"
                        onClick={() => applyPreset(suggestion)}
                      >
                        {suggestion.label}
                      </Chip>
                    );
                  })}
                </div>
              </div>
              <Button
                variant="link"
                size="sm"
                className="mt-3 h-auto px-0 text-[11.5px]"
                onClick={() =>
                  openAgentDraft({
                    input: prompt,
                    referenceAssetIds: refAssetIds,
                    source: 'generate',
                    ratio: autoRatio ? undefined : ratio,
                    quality,
                    count,
                    projectId: currentProjectId,
                  })
                }
              >
                <MessageSquareText size={13} /> 不知道怎么描述？去 Agent 获取创作方案
              </Button>
            </div>

            <div className="shrink-0 border-t border-line-soft bg-panel px-5 pt-3 pb-4">
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <OutputSettings
                    ratio={ratio}
                    autoRatio={autoRatio}
                    quality={quality}
                    count={count}
                    onRatio={setRatio}
                    onAutoRatio={setAutoRatio}
                    onQuality={setQuality}
                    onCount={setCount}
                  />
                  <PromptModeSelect value={promptMode} onChange={setPromptMode} />
                </div>
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  disabled={submitting || compilingPrompt || Boolean(blockedMessage)}
                  onClick={() => void prepareGenerate()}
                >
                  <Sparkles size={14} />{' '}
                  {blockedMessage
                    ? blockedMessage
                    : submitting
                      ? '提交中…'
                      : compilingPrompt
                        ? 'Agent 正在设计提示词…'
                      : `生成 ${count} 张 · 预计 ${cost} 点`}
                </Button>
              </div>
            </div>
          </section>

          <section
            aria-label="生成画布"
            className="flex min-h-[500px] min-w-0 flex-col overflow-hidden bg-panel lg:min-h-0"
          >
            <ResultPanel
              run={run}
              submitting={submitting}
              expectedCount={count}
              ratio={autoRatio ? undefined : ratio}
              emptyDescription={
                genMode === 't2i' ? '填写画面描述后即可开始生成。' : '选择参考图后即可开始生成。'
              }
              variant="canvas"
              className="min-h-0 flex-1"
            />
          </section>
        </div>
      )}
      <PromptReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        rawPrompt={prompt.trim()}
        compilation={compilation}
        compiling={compilingPrompt}
        error={compileError}
        selected={selectedPrompt}
        onSelected={setSelectedPrompt}
        agentPrompt={agentPrompt}
        onAgentPrompt={setAgentPrompt}
        onConfirm={() => {
          const chosen = selectedPrompt === 'agent' ? agentPrompt.trim() : prompt.trim();
          setReviewOpen(false);
          void submit(chosen, selectedPrompt === 'agent' ? compilation?.compileId : undefined);
        }}
      />
    </div>
  );
}
