import { useEffect, useRef, useState } from 'react';
import {
  MAX_REFERENCE_IMAGES,
  POINTS_PER_IMAGE,
  type CreationSkillSummaryDto,
  type AgentReferencePreference,
  type CreativeControls,
  type GenerationRequestDto,
  type PromptCompileResponseDto,
  type PromptMode,
  type Quality,
  type Ratio,
  type ReferenceFidelity,
  type ReferenceInput,
  type ReferenceRole,
} from '@hitframe/shared';
import { Check, MessageCircle, Send, Sparkles, Wand2, X } from 'lucide-react';
import { api, ApiError, type AgentPlan } from '@/lib/api';
import { useRunPolling } from '@/lib/useRunPolling';
import { useAppStore } from '@/store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { AssetPicker } from '@/components/AssetPicker';
import { ResultPanel } from '@/components/ResultPanel';
import { PromptCompilerPanel } from '@/components/PromptCompilerPanel';
import { AgentGenerationSettings } from '@/components/AgentGenerationSettings';
import { SelectMenu } from '@/components/ui/select-menu';

const MODE_LABEL: Record<AgentPlan['mode'], string> = {
  t2i: '文生图',
  i2i: '图生图',
  template: '场景模板',
};

const PLAN_LABEL: Record<PromptMode, { title: string; badge: string }> = {
  raw: { title: '执行检查', badge: '按原文执行' },
  enhance: { title: '执行方案', badge: '智能补全，待确认' },
  director: { title: '创作方案', badge: 'AI 建议，待确认' },
};

const MISSING_MATERIAL_LABEL: Record<string, string> = {
  product: '一张商品图',
  person: '一张人物或服装图',
  background: '一张背景参考图',
  style: '一张风格参考图',
  logo: '一张 Logo 或品牌素材图',
};

function missingMaterialName(slot: string): string {
  if (MISSING_MATERIAL_LABEL[slot]) return MISSING_MATERIAL_LABEL[slot];
  if (slot.includes('商品') || slot.includes('服装')) return '一张商品图';
  if (slot.includes('人物') || slot.includes('模特')) return '一张人物或服装图';
  if (slot.includes('背景')) return '一张背景参考图';
  if (slot.includes('风格')) return '一张风格参考图';
  if (slot.toLowerCase().includes('logo') || slot.includes('品牌')) {
    return '一张 Logo 或品牌素材图';
  }
  return '一张参考图片';
}

type TimelineMessage = {
  id: string;
  role: 'user' | 'agent';
  kind: 'text' | 'route' | 'status';
  text: string;
  detail?: string;
};

export function AgentPage() {
  const {
    templates,
    assets,
    currentProjectId,
    refreshMe,
    refreshAssets,
    showToast,
    pendingAgentDraft,
    consumeAgentDraft,
  } = useAppStore();

  const [input, setInput] = useState('');
  const [activePrompt, setActivePrompt] = useState('');
  const [timeline, setTimeline] = useState<TimelineMessage[]>([]);
  const [skills, setSkills] = useState<CreationSkillSummaryDto[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState('auto');
  const [referencePreference, setReferencePreference] = useState<AgentReferencePreference>('auto');
  const [referenceAssetIds, setReferenceAssetIds] = useState<string[]>([]);
  const [referenceRoles, setReferenceRoles] = useState<Record<string, ReferenceRole>>({});
  const [referenceFidelities, setReferenceFidelities] = useState<Record<string, ReferenceFidelity>>(
    {},
  );
  const [plan, setPlan] = useState<AgentPlan | null>(null);
  const [planStale, setPlanStale] = useState(false);
  const [promptMode, setPromptMode] = useState<PromptMode>('director');
  const [compilation, setCompilation] = useState<PromptCompileResponseDto | null>(null);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [creativeControls, setCreativeControls] = useState<CreativeControls>({
    composition: 'auto',
    shot: 'auto',
    lighting: 'auto',
    subjectPreservation: 'auto',
    creativity: 'medium',
  });
  const [ratio, setRatio] = useState<Ratio>('1:1');
  const [quality, setQuality] = useState<Quality>('standard');
  const [count, setCount] = useState(1);
  const [outputTouched, setOutputTouched] = useState(false);
  const [routing, setRouting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const lastRunStatus = useRef<string | null>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const { run, start, reset } = useRunPolling(() => {
    void refreshMe();
    void refreshAssets();
  });

  useEffect(() => {
    if (!run?.status || run.status === lastRunStatus.current) return;
    lastRunStatus.current = run.status;
    setTimeline((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: 'agent',
        kind: 'status',
        text:
          run.status === 'succeeded' ? '生成完成，结果已回到当前对话。' : `生成状态：${run.status}`,
        detail: run.status === 'succeeded' ? `${count} 张结果 · 可在右侧画布查看` : undefined,
      },
    ]);
  }, [count, run?.status]);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [compilation, plan, routing, run?.status, timeline]);

  useEffect(() => {
    void api
      .creationSkills()
      .then(setSkills)
      .catch((error) => showToast(`Skill 加载失败：${(error as Error).message}`));
  }, [showToast]);

  useEffect(() => {
    if (!pendingAgentDraft) return;
    const draft = consumeAgentDraft();
    if (!draft) return;
    setInput(draft.input);
    setActivePrompt('');
    setReferenceAssetIds(draft.referenceAssetIds.slice(0, MAX_REFERENCE_IMAGES));
    setReferenceRoles(
      Object.fromEntries(draft.referenceAssetIds.map((assetId) => [assetId, 'product'])),
    );
    setReferenceFidelities(
      Object.fromEntries(draft.referenceAssetIds.map((assetId) => [assetId, 'strict'])),
    );
    setSelectedSkillId(draft.skillId ?? 'auto');
    setReferencePreference(draft.referenceAssetIds.length ? 'with_reference' : 'auto');
    setRatio(draft.ratio ?? '1:1');
    setQuality(draft.quality);
    setCount(draft.count);
    setOutputTouched(Boolean(draft.ratio) || draft.count !== 1 || draft.quality !== 'standard');
    setPlan(null);
    setPlanStale(false);
    setCompilation(null);
    setEditedPrompt('');
    reset();
  }, [consumeAgentDraft, pendingAgentDraft, reset]);

  const resolvedSkillId = selectedSkillId === 'auto' ? plan?.skillId : selectedSkillId;
  const selectedSkill = skills.find((skill) => skill.id === resolvedSkillId);
  const planTpl = plan?.templateId
    ? templates.find((template) => template.id === plan.templateId)
    : undefined;
  const cost = count * POINTS_PER_IMAGE[quality];
  const references: ReferenceInput[] = referenceAssetIds.map((assetId) => ({
    assetId,
    role: referenceRoles[assetId] ?? 'product',
    fidelity: referenceFidelities[assetId] ?? 'strict',
  }));
  const controls: CreativeControls = {
    ...creativeControls,
    ratio,
    quality,
    candidateCount: count,
  };
  const compilerPrompt = activePrompt.trim() || input.trim();
  const finalPrompt = promptMode === 'raw' ? compilerPrompt : editedPrompt.trim();
  const needsImage = Boolean(plan?.missingSlots?.length);
  const canChooseTextOnly = Boolean(
    needsImage && plan?.allowsTextOnly && referenceAssetIds.length === 0,
  );
  const needsCompilation =
    promptMode !== 'raw' && (!compilation || !editedPrompt.trim() || planStale);
  const imageSetPending = plan?.outputType === 'image_set';
  const missingMaterialLabel = plan?.missingSlots?.length
    ? plan.missingSlots.map(missingMaterialName).join('、')
    : '一张参考图片';

  const clearCompilation = () => {
    setCompilation(null);
    setEditedPrompt('');
  };

  const markPlanStale = () => {
    clearCompilation();
    if (plan) setPlanStale(true);
  };

  const updateReferenceIds = (next: string[]) => {
    const limited = next.slice(0, MAX_REFERENCE_IMAGES);
    const defaultRole = (index: number) =>
      selectedSkill?.requiredReferences[index] ??
      selectedSkill?.optionalReferences[index] ??
      'product';
    setReferenceAssetIds(limited);
    setReferencePreference(limited.length ? 'with_reference' : 'auto');
    setReferenceRoles((current) =>
      Object.fromEntries(
        limited.map((assetId, index) => [assetId, current[assetId] ?? defaultRole(index)]),
      ),
    );
    setReferenceFidelities((current) =>
      Object.fromEntries(
        limited.map((assetId, index) => {
          const role = referenceRoles[assetId] ?? defaultRole(index);
          return [assetId, current[assetId] ?? defaultFidelity(role)];
        }),
      ),
    );
    markPlanStale();
  };

  const routeAndBuildPlan = async (
    routedPrompt: string,
    requestText?: string,
    preference: AgentReferencePreference = referencePreference,
  ) => {
    if (!routedPrompt.trim() || routing) return;
    setActivePrompt(routedPrompt);
    if (requestText) {
      setTimeline((current) => [
        ...current,
        { id: crypto.randomUUID(), role: 'user', kind: 'text', text: requestText },
      ]);
    }
    setRouting(true);
    setPlan(null);
    setPlanStale(false);
    clearCompilation();
    reset();
    try {
      const result = await api.agentRoute(
        routedPrompt,
        references.length ? references : undefined,
        selectedSkillId === 'auto' ? undefined : selectedSkillId,
        preference,
      );
      setReferencePreference(preference);
      if (!outputTouched) {
        setRatio((result.params.ratio ?? '1:1') as Ratio);
        setQuality((result.params.quality ?? 'standard') as Quality);
        setCount(result.params.candidateCount ?? 1);
      }
      setPlan(result);
      setInput('');
      setTimeline((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'agent',
          kind: 'route',
          text:
            result.missingSlots?.length && result.allowsTextOnly
              ? '这张封面可以使用商品图，也可以直接从文字创作。'
              : result.missingSlots?.length
                ? `还需要${result.missingSlots.map(missingMaterialName).join('、')}`
                : `我识别到这是${MODE_LABEL[result.mode]}需求，已准备创作方案。`,
          detail:
            result.missingSlots?.length && result.allowsTextOnly
              ? '请选择“添加图片”或“不传图片，直接创作”。'
              : result.missingSlots?.length
                ? '请点击下方“添加图片”，上传素材或从资产库选择；添加后再生成创作方案。'
                : `创作方向已生成，可直接确认或继续调整。`,
        },
      ]);

      if (promptMode === 'director' && !result.missingSlots?.length) {
        const compiled = await api.compilePrompt({
          mode: 'director',
          generationMode: result.mode,
          rawPrompt: routedPrompt,
          skillId: selectedSkillId === 'auto' ? result.skillId : selectedSkillId,
          templateId: result.templateId,
          references,
          controls: {
            ...controls,
            ratio: outputTouched ? ratio : (result.params.ratio ?? ratio),
            quality: outputTouched ? quality : (result.params.quality ?? quality),
            candidateCount: outputTouched ? count : (result.params.candidateCount ?? count),
          },
        });
        setCompilation(compiled);
        setEditedPrompt(compiled.compiledPrompt);
      }
    } catch (error) {
      showToast(`分析失败：${(error as Error).message}`);
      setTimeline((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'agent',
          kind: 'status',
          text: '这次没有完成需求分析，请调整描述后重试。',
          detail: error instanceof Error ? error.message : '服务暂时不可用',
        },
      ]);
    } finally {
      setRouting(false);
    }
  };

  const analyze = async () => {
    if (!input.trim() || routing) return;
    const requestText = input.trim();
    const routedPrompt =
      plan && activePrompt.trim()
        ? `${activePrompt.trim()}\n用户最新调整：${requestText}`
        : requestText;
    await routeAndBuildPlan(routedPrompt, requestText);
  };

  const regeneratePlan = async () => {
    if (!activePrompt.trim() || routing) return;
    await routeAndBuildPlan(
      activePrompt.trim(),
      undefined,
      referenceAssetIds.length ? 'with_reference' : referencePreference,
    );
  };

  const createWithoutReference = async () => {
    if (!activePrompt.trim() || routing) return;
    await routeAndBuildPlan(activePrompt.trim(), '不传图片，直接创作', 'without_reference');
  };

  const confirm = async () => {
    if (!plan || submitting || needsImage || planStale || imageSetPending) return;
    if (needsCompilation) {
      showToast('请先生成并确认执行方案');
      return;
    }
    setSubmitting(true);
    setTimeline((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: 'agent',
        kind: 'status',
        text: '方案已确认，正在进入生成队列。',
        detail: `预计 ${cost} 点 · ${count} 张 · ${quality === 'high' ? '高清' : quality === 'preview' ? '预览' : '标准'}`,
      },
    ]);
    reset();

    const slots = referenceAssetIds;
    const dto: GenerationRequestDto = {
      mode: plan.mode,
      templateId: plan.mode === 'template' ? plan.templateId : undefined,
      inputs:
        plan.mode === 'template'
          ? {
              slots,
              vars: Object.fromEntries(
                (planTpl?.varsSchema ?? []).map((variable) => [
                  variable.key,
                  variable.default ?? '',
                ]),
              ),
              prompt: finalPrompt || undefined,
              references,
            }
          : plan.mode === 'i2i'
            ? { slots, prompt: finalPrompt || undefined, references }
            : { prompt: finalPrompt || compilerPrompt },
      options: { ratio, quality, candidateCount: count },
      promptCompilationId: compilation?.compileId,
      idempotencyKey: crypto.randomUUID(),
      projectId: currentProjectId ?? undefined,
    };

    try {
      const accepted = await api.createGeneration(dto, 'agent');
      showToast(`已入队 ${accepted.jobs.length} 个生成任务 · 预估 ${accepted.pointsEstimated} 点`);
      start(accepted.runId);
    } catch (error) {
      showToast(
        error instanceof ApiError && error.status === 402
          ? (error.message ?? '点数不足')
          : `提交失败：${(error as Error).message}`,
      );
      setTimeline((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'agent',
          kind: 'status',
          text: '生成任务提交失败，本次没有完成生成。',
          detail: error instanceof Error ? error.message : '服务暂时不可用',
        },
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex w-full bg-panel lg:h-screen lg:min-h-[620px]">
      <section
        aria-label="Agent 创意导演对话区"
        className="mx-auto flex min-h-0 w-full max-w-[980px] flex-1 flex-col bg-panel"
      >
        <div className="flex h-14 shrink-0 items-center border-b border-line-soft px-5 py-3">
          <div className="flex items-center gap-2.5">
            <MessageCircle size={16} className="text-primary" />
            <span className="text-[13px] font-semibold text-ink">Agent 创作对话</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 lg:px-10">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-white">
                <Wand2 size={15} />
              </div>
              <div className="max-w-[760px] rounded-[var(--radius-card)] rounded-tl-[4px] border border-line-soft bg-panel-muted px-4 py-3.5">
                <div className="text-[12px] font-semibold text-ink">我是你的图片创作 Agent</div>
                <p className="mt-1 text-[11.5px] leading-relaxed text-dim">
                  描述你想制作的图片，也可以添加商品、人物或风格参考。我会理解素材、推荐
                  Skill，并给出可讨论的创作方案。
                </p>
                {timeline.length === 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      '给商品换一个高级场景背景',
                      '设计一张小红书营销封面',
                      '根据这件衣服制作真人试穿图',
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setInput(suggestion)}
                        className="rounded-[var(--radius-control)] border border-line bg-panel px-3 py-1.5 text-[10.5px] text-dim transition-colors hover:border-primary/40 hover:text-primary"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {timeline.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex items-start gap-3',
                  message.role === 'user' ? 'justify-end' : 'justify-start',
                )}
              >
                {message.role === 'agent' && (
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-white">
                    <Wand2 size={14} />
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[78%] rounded-[var(--radius-card)] px-4 py-3 text-[11.5px] leading-relaxed',
                    message.role === 'user'
                      ? 'rounded-tr-[4px] bg-ink text-white'
                      : 'rounded-tl-[4px] border border-line-soft bg-panel-muted text-ink',
                  )}
                >
                  <div>{message.text}</div>
                  {message.detail && (
                    <div
                      className={cn(
                        'mt-1.5 text-[10.5px]',
                        message.role === 'user' ? 'text-white/65' : 'text-faint',
                      )}
                    >
                      {message.detail}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {plan && (
              <section
                className="ml-11 max-w-[760px] rounded-[var(--radius-card)] border border-line-soft bg-panel p-4 shadow-[var(--shadow-card)]"
                aria-label="Agent 创作方案"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-[13px] font-semibold text-ink">
                      {PLAN_LABEL[promptMode].title}
                    </h2>
                    <p className="mt-0.5 text-[11px] text-faint">确认前不创建任务、不扣点</p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-[10.5px] font-medium text-primary">
                    <Check size={12} /> {PLAN_LABEL[promptMode].badge}
                  </span>
                </div>

                {canChooseTextOnly ? (
                  <div className="mt-3 rounded-[var(--radius-control)] border border-primary/25 bg-primary-soft/35 px-3.5 py-3">
                    <div className="text-[11.5px] font-semibold text-ink">是否使用商品图？</div>
                    <div className="mt-1 text-[10.5px] leading-relaxed text-dim">
                      添加商品图后会保持主体制作封面；也可以不传图片，直接从文字描述创作。
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <AssetPicker
                        label=""
                        value={null}
                        onChange={(assetId) => updateReferenceIds(assetId ? [assetId] : [])}
                        showLabel={false}
                        multiple
                        maxItems={MAX_REFERENCE_IMAGES}
                        values={referenceAssetIds}
                        onValuesChange={updateReferenceIds}
                        triggerOnly
                        triggerLabel="添加图片"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-9 text-[11px]"
                        disabled={routing}
                        onClick={() => void createWithoutReference()}
                      >
                        {routing ? '生成中…' : '不传图片，直接创作'}
                      </Button>
                    </div>
                  </div>
                ) : needsImage ? (
                  <div className="mt-3 rounded-[var(--radius-control)] border border-primary/25 bg-primary-soft/35 px-3.5 py-3">
                    <div className="text-[11.5px] font-semibold text-ink">
                      {referenceAssetIds.length > 0
                        ? '图片已添加'
                        : `还需要${missingMaterialLabel}`}
                    </div>
                    <div className="mt-1 text-[10.5px] leading-relaxed text-dim">
                      {referenceAssetIds.length > 0
                        ? '素材已就绪，请重新生成方案，Agent 将基于这张图片继续。'
                        : '请点击下方“添加图片”，选择上传图片或资产库；添加后再进入方案步骤。'}
                    </div>
                    {referenceAssetIds.length > 0 && (
                      <Button
                        size="sm"
                        variant="primary"
                        className="mt-2.5 text-[11px]"
                        disabled={routing}
                        onClick={() => void regeneratePlan()}
                      >
                        <Sparkles size={13} /> {routing ? '生成中…' : '重新生成方案'}
                      </Button>
                    )}
                  </div>
                ) : null}
                {!needsImage && planStale && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-warn/40 bg-warn/10 px-3 py-2.5 text-[11.5px] text-warn">
                    <span>图片、Skill 或输出参数已变化，请更新创作方案。</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={routing}
                      onClick={() => void regeneratePlan()}
                    >
                      <Sparkles size={13} /> {routing ? '更新中…' : '重新生成方案'}
                    </Button>
                  </div>
                )}
                {imageSetPending && (
                  <div className="mt-3 rounded-[var(--radius-control)] border border-line-soft bg-panel-muted px-3 py-2.5 text-[11.5px] text-dim">
                    小红书多图组已完成 Skill 规划，独立分镜与图片组执行将在 generation-set
                    阶段接入；当前不将候选图冒充图片组。
                  </div>
                )}

                {!needsImage && !planStale && (
                  <PromptCompilerPanel
                    rawPrompt={compilerPrompt}
                    mode={promptMode}
                    generationMode={plan.mode}
                    skillId={resolvedSkillId}
                    templateId={plan.templateId}
                    references={references}
                    controls={controls}
                    compilation={compilation}
                    editedPrompt={editedPrompt}
                    showModePicker={false}
                    onModeChange={setPromptMode}
                    onCompile={(result) => {
                      setCompilation(result);
                      setEditedPrompt(result.compiledPrompt);
                      setTimeline((current) => [
                        ...current,
                        {
                          id: crypto.randomUUID(),
                          role: 'agent',
                          kind: 'status',
                          text: '执行提示词已编译，请检查补充内容后确认。',
                          detail:
                            result.changeSummary?.join(' · ') ||
                            '已完成主体、构图、光影与负向约束整理',
                        },
                      ]);
                    }}
                    onEditedPrompt={setEditedPrompt}
                    onControlsChange={(patch) => {
                      setCreativeControls((current) => ({ ...current, ...patch }));
                      setEditedPrompt('');
                    }}
                  />
                )}

                {!needsImage && compilation && promptMode !== 'raw' && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditedPrompt(compilation.rawPrompt)}
                    >
                      恢复原始需求
                    </Button>
                    {promptMode === 'director' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setPromptMode('enhance');
                          clearCompilation();
                        }}
                      >
                        退回智能增强
                      </Button>
                    )}
                  </div>
                )}

                {!needsImage && (
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-line-soft pt-3">
                    <Button
                      variant="primary"
                      disabled={submitting || needsCompilation || imageSetPending || planStale}
                      onClick={() => void confirm()}
                    >
                      <Sparkles size={14} />
                      {submitting
                        ? '提交中…'
                        : imageSetPending
                          ? '图片组执行待接入'
                          : needsCompilation
                            ? '请先确认执行提示词'
                            : `确认方案并生成 · ${cost} 点`}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setPlanStale(true);
                        clearCompilation();
                      }}
                    >
                      调整方案
                    </Button>
                  </div>
                )}

                {run && (
                  <div className="mt-3 rounded-[var(--radius-control)] border border-line-soft bg-panel-muted px-3 py-2.5 text-[11.5px] text-dim">
                    生成任务状态：{run.status}。完成后结果会继续出现在当前对话。
                  </div>
                )}
              </section>
            )}

            {run && (
              <section
                aria-label="Agent 对话生成结果"
                className="ml-11 max-w-[760px] rounded-[var(--radius-card)] border border-line-soft bg-panel p-4 shadow-[var(--shadow-card)]"
              >
                <div className="mb-3 flex items-center gap-2">
                  <div className="grid h-6 w-6 place-items-center rounded-full bg-primary text-white">
                    <Sparkles size={12} />
                  </div>
                  <div>
                    <div className="text-[12px] font-semibold text-ink">生成结果</div>
                    <div className="text-[10.5px] text-faint">
                      结果属于当前 Agent 对话，可继续修改后重试
                    </div>
                  </div>
                </div>
                <ResultPanel
                  run={run}
                  submitting={submitting}
                  expectedCount={count}
                  ratio={ratio}
                  emptyDescription="生成结果会显示在这里。"
                  variant="canvas"
                  onRetry={() => void confirm()}
                  className="min-h-[260px]"
                />
              </section>
            )}
            <div ref={conversationEndRef} />
          </div>
        </div>

        <div className="relative z-50 shrink-0 overflow-visible border-t border-line-soft bg-panel px-5 pt-3 pb-4 lg:px-10">
          {referenceAssetIds.length > 0 && (
            <div className="mb-2 flex max-h-[74px] gap-2 overflow-x-auto rounded-[var(--radius-control)] border border-line-soft bg-panel-muted p-2">
              {referenceAssetIds.map((assetId, index) => {
                const asset = assets.find((item) => item.id === assetId);
                if (!asset) return null;
                return (
                  <div
                    key={assetId}
                    className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-[var(--radius-image)] border border-line-soft bg-panel"
                  >
                    <img
                      src={asset.url}
                      alt={`图片 ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      aria-label={`移除图片 ${index + 1}`}
                      onClick={() =>
                        updateReferenceIds(referenceAssetIds.filter((id) => id !== assetId))
                      }
                      className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-ink/70 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    >
                      <X size={11} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <textarea
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              if (plan && !planStale) setPlanStale(true);
            }}
            placeholder={plan ? '告诉 Agent 需要如何调整方案……' : '描述你想制作的图片……'}
            aria-label="继续描述你的需求"
            className="min-h-[88px] max-h-[180px] w-full resize-y rounded-[var(--radius-card)] border border-line bg-panel px-4 py-3 text-[12px] leading-relaxed text-ink shadow-[var(--shadow-card)] placeholder:text-faint focus:border-primary focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-2">
            <div className="min-w-0 flex flex-1 items-center gap-2 overflow-visible pb-0.5">
              <AssetPicker
                label=""
                value={referenceAssetIds[0] ?? null}
                onChange={(assetId) => updateReferenceIds(assetId ? [assetId] : [])}
                showLabel={false}
                multiple
                maxItems={MAX_REFERENCE_IMAGES}
                values={referenceAssetIds}
                onValuesChange={updateReferenceIds}
                triggerOnly
              />
              <SelectMenu
                value={selectedSkillId}
                options={[
                  { value: 'auto', label: 'Skill · 自动推荐' },
                  ...skills.map((skill) => ({ value: skill.id, label: skill.name })),
                ]}
                onChange={(next) => {
                  setSelectedSkillId(next);
                  setReferencePreference(referenceAssetIds.length ? 'with_reference' : 'auto');
                  markPlanStale();
                }}
                ariaLabel="图片 Skill"
                className="h-9 shrink-0"
              />
              <SelectMenu
                value={promptMode}
                options={[
                  { value: 'raw', label: '原样' },
                  { value: 'enhance', label: '智能增强' },
                  { value: 'director', label: '创意导演' },
                ]}
                onChange={(next) => {
                  setPromptMode(next);
                  markPlanStale();
                }}
                ariaLabel="Agent 处理方式"
                className="h-9 shrink-0"
                active
              />
              <AgentGenerationSettings
                ratio={ratio}
                quality={quality}
                count={count}
                onRatio={(next) => {
                  setRatio(next);
                  setOutputTouched(true);
                  markPlanStale();
                }}
                onQuality={(next) => {
                  setQuality(next);
                  setOutputTouched(true);
                  markPlanStale();
                }}
                onCount={(next) => {
                  setCount(next);
                  setOutputTouched(true);
                  markPlanStale();
                }}
              />
            </div>
            <Button
              variant="primary"
              size="sm"
              className="h-9 shrink-0 px-4 text-[11px]"
              disabled={routing || !input.trim()}
              onClick={() => void analyze()}
              aria-label="发送给 Agent"
            >
              <Send size={15} /> {routing ? '分析中…' : '发送'}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function defaultFidelity(role: ReferenceRole): ReferenceFidelity {
  return role === 'product' || role === 'person' || role === 'logo' ? 'strict' : 'auto';
}
