import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MAX_REFERENCE_IMAGES,
  POINTS_PER_IMAGE,
  type GenerationRequestDto,
  type PromptCompileResponseDto,
  type PromptMode,
  type Quality,
  type Ratio,
} from '@hitframe/shared';
import {
  ImageIcon,
  LayoutTemplate,
  MessageSquareText,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useRunPolling } from '@/lib/useRunPolling';
import { useAppStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { AssetPicker } from '@/components/AssetPicker';
import { OutputSettings } from '@/components/OutputSettings';
import { ResultPanel } from '@/components/ResultPanel';
import { GenerationModeTabs } from '@/components/GenerationModeTabs';
import { PromptModeSelect, PromptReviewDialog } from '@/components/PromptReviewDialog';
import { TemplateSwitcher, templatePresentation } from '@/components/TemplateSwitcher';
import {
  ReferencePromptEditor,
  REMOVED_IMAGE_REFERENCE,
  remapImageReferences,
} from '@/components/ReferencePromptEditor';
import { resolveGenerationPreset, TEMPLATE_GENERATION_PRESETS } from '@/lib/generation-presets';

/**
 * 模板配置页（第三种输入结构）：图片槽位 + 业务变量（填空 + 选项，不暴露 prompt）。
 * 整页由 GET /templates 的 slots/varsSchema 数据驱动，商品换背景即 tpl_bg。
 */
export function TemplateConfigPage() {
  const {
    templates,
    activeTplId,
    setActiveTplId,
    setGenMode,
    currentProjectId,
    refreshMe,
    refreshAssets,
    showToast,
    assets,
    pendingGenerationDraft,
    consumeGenerationDraft,
    openAgentDraft,
  } = useAppStore();
  const selectedTplId = activeTplId ?? templates[0]?.id ?? null;
  const tpl = templates.find((t) => t.id === selectedTplId);

  const [referenceAssetIds, setReferenceAssetIds] = useState<string[]>([]);
  const [vars, setVars] = useState<Record<string, string>>({});
  const [prompt, setPrompt] = useState('');
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
  const [showTemplateSwitcher, setShowTemplateSwitcher] = useState(true);
  const initializedTemplateIdRef = useRef<string | null>(null);
  const { run, start, reset } = useRunPolling(() => {
    void refreshMe();
    void refreshAssets();
  });

  // 从场景模板页签进入时默认选中第一张卡；切换模板时同步一组可直接修改的示例值。
  useEffect(() => {
    if (!activeTplId && templates[0]) setActiveTplId(templates[0].id);
  }, [activeTplId, setActiveTplId, templates]);

  useEffect(() => {
    if (!tpl) return;
    const copy = templatePresentation(tpl);
    const presetConfig = TEMPLATE_GENERATION_PRESETS[tpl.id];
    const preset = presetConfig ? resolveGenerationPreset(assets, presetConfig.assetName) : null;

    // 资产列表可能晚于模板返回；等案例资产就绪后再做首次填充。
    if (presetConfig && !preset) return;

    if (
      pendingGenerationDraft?.mode === 'template' &&
      pendingGenerationDraft.templateId === tpl.id
    ) {
      const draft = consumeGenerationDraft();
      if (!draft || draft.mode !== 'template') return;

      const defaultVars = Object.fromEntries(
        tpl.varsSchema.map((v) => [v.key, copy.exampleVars?.[v.key] ?? v.default ?? '']),
      );
      setReferenceAssetIds(draft.slots.slice(0, MAX_REFERENCE_IMAGES));
      setVars({ ...defaultVars, ...draft.vars });
      setPrompt(draft.prompt ?? '');
      setRatio(draft.ratio ?? '1:1');
      setAutoRatio(!draft.ratio);
      setQuality(draft.quality);
      setCount(draft.count);
      setSubmitting(false);
      setShowTemplateSwitcher(false);
      reset();
      initializedTemplateIdRef.current = tpl.id;
      return;
    }

    // 消费草稿会触发一次重渲染，不能再用模板默认值覆盖刚恢复的数据。
    if (initializedTemplateIdRef.current === tpl.id) return;
    const presetReferenceIds = preset
      ? presetConfig?.useResultAsReference
        ? [preset.asset.id]
        : preset.referenceAssetIds.slice(0, MAX_REFERENCE_IMAGES)
      : [];
    setReferenceAssetIds(presetReferenceIds);
    setVars(
      Object.fromEntries(
        tpl.varsSchema.map((v) => [v.key, copy.exampleVars?.[v.key] ?? v.default ?? '']),
      ),
    );
    setPrompt(presetConfig?.promptOverride ?? preset?.prompt ?? copy.examplePrompt ?? '');
    setAutoRatio(true);
    setCount(1);
    reset();
    initializedTemplateIdRef.current = tpl.id;
  }, [assets, consumeGenerationDraft, pendingGenerationDraft, tpl?.id]);

  const cost = count * POINTS_PER_IMAGE[quality];
  const missingSlots = useMemo(
    () =>
      tpl
        ? tpl.slots.filter((slot, index) => slot.required !== false && !referenceAssetIds[index])
        : [],
    [tpl, referenceAssetIds],
  );
  const missingRequiredVar = useMemo(
    () => tpl?.varsSchema.find((v) => v.required && !(vars[v.key] ?? v.default)) ?? null,
    [tpl, vars],
  );

  if (!tpl) {
    return (
      <div className="grid min-h-[620px] place-items-center bg-panel px-5 py-8">
        <div className="w-full max-w-[420px]">
          <div className="mb-4 flex h-14 items-center gap-2.5 border-b border-line-soft">
            <Sparkles size={16} className="text-primary" />
            <span className="text-[13px] font-semibold text-ink">AI 图片</span>
          </div>
          <GenerationModeTabs activeMode="template" onChange={setGenMode} />
          <p className="mt-6 text-center text-[12.5px] text-faint">正在加载场景模板…</p>
        </div>
      </div>
    );
  }

  const copy = templatePresentation(tpl);
  const referenceImages = referenceAssetIds.map((assetId, index) => {
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
    setPrompt((current) => remapImageReferences(current, referenceAssetIds, next));
    setReferenceAssetIds(next);
  };
  const addReferenceFromPrompt = (assetId: string) => {
    if (referenceAssetIds.includes(assetId)) return true;
    if (referenceAssetIds.length >= MAX_REFERENCE_IMAGES) {
      showToast(`最多添加 ${MAX_REFERENCE_IMAGES} 张参考图片`);
      return false;
    }
    updateReferenceIds([...referenceAssetIds, assetId]);
    return true;
  };
  const hasRemovedReference = prompt.includes(REMOVED_IMAGE_REFERENCE);
  const skillId = templateSkillId(tpl.id);
  const agentInput = [
    prompt.trim(),
    Object.entries(vars)
      .filter(([, value]) => value.trim())
      .map(([key, value]) => `${key}：${value}`)
      .join('；'),
  ]
    .filter(Boolean)
    .join('\n');
  const updatePrompt = (value: string) => setPrompt(value);
  const updateVar = (key: string, value: string) =>
    setVars((current) => ({ ...current, [key]: value }));

  const submit = async (promptOverride = prompt.trim(), promptCompilationId?: string) => {
    if (submitting) return;
    if (missingSlots.length > 0) {
      showToast(`请先填必填图片槽位：${missingSlots.map((s) => s.label).join('、')}`);
      return;
    }
    if (missingRequiredVar) {
      showToast(`模板变量必填：${missingRequiredVar.label}`);
      return;
    }
    setSubmitting(true);
    // 生成开始后让结果画布保持完整可见；需要换模板时可从画布右上角重新打开。
    setShowTemplateSwitcher(false);
    reset();
    const dto: GenerationRequestDto = {
      mode: 'template',
      templateId: tpl.id,
      inputs: {
        slots: referenceAssetIds,
        vars: Object.fromEntries(
          tpl.varsSchema.map((v) => [v.key, vars[v.key] ?? v.default ?? '']),
        ),
        prompt: promptOverride || undefined,
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

  const blockedMessage = hasRemovedReference
    ? '请处理已移除的图片引用'
    : missingSlots.length > 0
      ? `请先选择${missingSlots[0].label}`
      : missingRequiredVar
        ? `请填写${missingRequiredVar.label}`
        : null;

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
        generationMode: 'template',
        rawPrompt: agentInput,
        skillId,
        templateId: tpl.id,
        references: referenceAssetIds.map((assetId, index) => ({
          assetId,
          role: index === 0 ? 'product' : 'style',
          fidelity: index === 0 ? 'strict' : 'auto',
        })),
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
      <div className="grid bg-panel lg:h-screen lg:min-h-[620px] lg:grid-cols-[420px_minmax(0,1fr)]">
        <section
          aria-label="场景模板配置区"
          className="flex min-h-0 flex-col border-b border-line-soft bg-panel lg:border-r lg:border-b-0"
        >
          <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line-soft bg-panel px-5 py-2 md:px-6">
            <div className="flex shrink-0 items-center gap-2.5">
              <Sparkles size={16} className="text-primary" />
              <span className="text-[13px] font-semibold text-ink">AI 图片</span>
            </div>
            <div className="min-w-0 max-w-[290px] flex-1">
              <GenerationModeTabs
                activeMode="template"
                onChange={(mode) => {
                  setGenMode(mode);
                  if (mode !== 'template') setActiveTplId(null);
                }}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div className="overflow-visible rounded-[var(--radius-card)] border border-line-soft bg-panel shadow-[0_0_14px_-6px_rgba(18,27,44,0.38)] transition-shadow hover:shadow-[0_0_18px_-6px_rgba(18,27,44,0.46)] focus-within:shadow-[0_0_18px_-6px_rgba(18,27,44,0.46)]">
              <section className="overflow-visible p-3.5">
                <div className="mb-3 flex items-center gap-2">
                  <ImageIcon size={16} className="text-primary" />
                  <h2 className="m-0 text-[13px] font-semibold">参考图片</h2>
                </div>
                <AssetPicker
                  label="参考图片"
                  required
                  value={referenceAssetIds[0] ?? null}
                  onChange={(assetId) => {
                    const next = assetId ? [assetId] : [];
                    updateReferenceIds(next);
                  }}
                  compact
                  showLabel={false}
                  multiple
                  maxItems={MAX_REFERENCE_IMAGES}
                  values={referenceAssetIds}
                  onValuesChange={updateReferenceIds}
                />
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {copy.referenceRoles.map((role, index) => (
                    <span
                      key={`${tpl.id}-${role}`}
                      className="rounded-[6px] bg-panel-muted px-2 py-1 text-[10px] text-dim"
                    >
                      @图片 {index + 1} · {role}
                      {tpl.slots[index]?.required !== false ? '（必填）' : '（可选）'}
                    </span>
                  ))}
                  <span className="rounded-[6px] bg-panel-muted px-2 py-1 text-[10px] text-faint">
                    其余图片 · 补充参考
                  </span>
                </div>
              </section>

              <section className="border-t border-line-soft p-3.5">
                <div className="mb-3 flex items-center gap-2">
                  <SlidersHorizontal size={16} className="text-primary" />
                  <h2 className="m-0 text-[13px] font-semibold">预置提示词</h2>
                </div>
                {tpl.varsSchema.map((v) => (
                  <div key={v.key} className="mb-3 last:mb-0">
                    <div className="mb-1.5 text-[12px] font-medium text-dim">
                      {v.label} {v.required && <span className="text-primary">*</span>}
                    </div>
                    {v.type === 'text' ? (
                      <input
                        value={vars[v.key] ?? ''}
                        onChange={(e) => updateVar(v.key, e.target.value)}
                        placeholder={v.placeholder}
                        className="w-full rounded-[var(--radius-control)] border border-line bg-panel-muted px-3 py-2 text-[12.5px] text-ink placeholder:text-faint focus:border-primary focus:outline-none"
                      />
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {(v.options ?? []).map((opt) => (
                          <Chip
                            key={opt}
                            active={(vars[v.key] ?? v.default) === opt}
                            onClick={() => updateVar(v.key, opt)}
                          >
                            {opt}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </section>

              <section className="border-t border-line-soft p-3.5">
                <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-dim">
                  <MessageSquareText size={15} />
                  补充描述 <span className="font-normal text-faint">可选</span>
                </div>
                <ReferencePromptEditor
                  value={prompt}
                  onChange={updatePrompt}
                  images={referenceImages}
                  availableImages={recentReferenceImages}
                  onReferenceSelect={addReferenceFromPrompt}
                  maxImages={MAX_REFERENCE_IMAGES}
                  placeholder="补充描述，输入 @ 指定图片"
                  textareaClassName="min-h-[82px] text-[12.5px]"
                  highlightClassName="text-[12.5px]"
                />
                {hasRemovedReference && (
                  <div className="mt-2 text-[10.5px] leading-relaxed text-err">
                    已引用的图片被移除，请删除“{REMOVED_IMAGE_REFERENCE}”后重新 @ 图片。
                  </div>
                )}
              </section>
              <div className="border-t border-line-soft p-3.5">
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto px-0 text-[11.5px]"
                  onClick={() =>
                    openAgentDraft({
                      input: agentInput,
                      referenceAssetIds,
                      source: 'template',
                      skillId,
                      templateId: tpl.id,
                      ratio: autoRatio ? undefined : ratio,
                      quality,
                      count,
                      projectId: currentProjectId,
                    })
                  }
                >
                  <MessageSquareText size={13} /> 让 Agent 帮我完善这张图
                </Button>
              </div>
            </div>
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
                <Sparkles size={15} />
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
          aria-label="生成结果"
          className="flex min-h-[560px] min-w-0 flex-col overflow-hidden bg-panel"
        >
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <ResultPanel
              run={run}
              submitting={submitting}
              expectedCount={count}
              ratio={autoRatio ? undefined : ratio}
              onRetry={() => void submit()}
              emptyDescription="完成左侧设置后，结果会显示在这里。"
              variant="canvas"
              className="min-h-0 flex-1"
            />
            {showTemplateSwitcher ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-4 md:px-6 md:pb-5">
                <div className="pointer-events-auto w-full max-w-[860px] rounded-[var(--radius-card)] border border-line-soft bg-panel/95 p-3 shadow-[var(--shadow-floating)] backdrop-blur-sm md:p-4">
                  <div className="mb-2.5 flex items-center justify-between gap-3 px-0.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <LayoutTemplate size={15} className="shrink-0 text-primary" />
                      <span className="truncate text-[12px] font-semibold text-ink">
                        切换场景模板
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label="关闭场景模板切换"
                      title="关闭"
                      onClick={() => setShowTemplateSwitcher(false)}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-control)] text-faint transition-colors hover:bg-panel-muted hover:text-ink"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <TemplateSwitcher
                    templates={templates}
                    activeTplId={tpl.id}
                    onSelect={setActiveTplId}
                  />
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowTemplateSwitcher(true)}
                className="absolute right-4 bottom-4 z-10 inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] border border-line-soft bg-panel/95 px-2.5 text-[11px] font-medium text-dim shadow-[var(--shadow-floating)] backdrop-blur-sm transition-colors hover:border-primary/35 hover:text-primary md:right-6 md:bottom-5"
              >
                <LayoutTemplate size={13} />
                切换模板
              </button>
            )}
          </div>
        </section>
      </div>
      <PromptReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        rawPrompt={agentInput}
        compilation={compilation}
        compiling={compilingPrompt}
        error={compileError}
        selected={selectedPrompt}
        onSelected={setSelectedPrompt}
        agentPrompt={agentPrompt}
        onAgentPrompt={setAgentPrompt}
        onConfirm={() => {
          const chosen = selectedPrompt === 'agent' ? agentPrompt.trim() : agentInput;
          setReviewOpen(false);
          void submit(chosen, selectedPrompt === 'agent' ? compilation?.compileId : undefined);
        }}
      />
    </div>
  );
}

function templateSkillId(templateId: string): string {
  const map: Record<string, string> = {
    tpl_bg: 'skill_product_background',
    tpl_model: 'skill_model_try_on',
    tpl_poster: 'skill_ecommerce_poster',
  };
  return map[templateId] ?? 'skill_product_background';
}
