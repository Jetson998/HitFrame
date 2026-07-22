import { useState } from 'react';
import type { GenerationRequestDto, Quality, Ratio } from '@hitframe/shared';
import { Sparkles, Wand2 } from 'lucide-react';
import { api, ApiError, type AgentPlan } from '@/lib/api';
import { useRunPolling } from '@/lib/useRunPolling';
import { useAppStore } from '@/store';
import { Button } from '@/components/ui/button';
import { AssetPicker } from '@/components/AssetPicker';
import { ResultPanel } from '@/components/ResultPanel';

const MODE_LABEL: Record<AgentPlan['mode'], string> = {
  t2i: '文生图（通用生成）',
  i2i: '图生图（参考图）',
  template: '模板',
};
const QUALITY_LABEL: Record<Quality, string> = { standard: '标准', high: '高清' };

/**
 * Agent 创作页（S5.4）：自然语言 → POST /agent/route 取方案卡 → 用户补图/确认 → /generations。
 * Agent 只做 route（无副作用）；确认按钮才建 Run、扣点，走统一 hold/queue/worker 链路。
 */
export function AgentPage() {
  const { templates, currentProjectId, refreshMe, refreshAssets, showToast } = useAppStore();

  const [input, setInput] = useState('');
  const [refImage, setRefImage] = useState<string | null>(null);
  const [plan, setPlan] = useState<AgentPlan | null>(null);
  const [routing, setRouting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { run, start, reset } = useRunPolling(() => {
    void refreshMe();
    void refreshAssets();
  });

  const planTpl = plan?.templateId ? templates.find((t) => t.id === plan.templateId) : undefined;
  // 缺图判定：后端返回 missingSlots 且用户尚未补图
  const needsImage = !!plan?.missingSlots?.length && !refImage;

  const analyze = async () => {
    if (!input.trim() || routing) return;
    setRouting(true);
    setPlan(null);
    reset();
    try {
      const result = await api.agentRoute(input.trim(), refImage ? [refImage] : undefined);
      setPlan(result);
    } catch (err) {
      showToast(`分析失败：${(err as Error).message}`);
    } finally {
      setRouting(false);
    }
  };

  const confirm = async () => {
    if (!plan || submitting || needsImage) return;
    setSubmitting(true);
    reset();

    // 组装 GenerationRequestDto：route plan → 生成请求
    const slots = refImage ? [refImage] : [];
    const dto: GenerationRequestDto = {
      mode: plan.mode,
      templateId: plan.mode === 'template' ? plan.templateId : undefined,
      inputs:
        plan.mode === 'template'
          ? {
              slots,
              // 模板变量走默认值（用户在方案卡确认后可去模板页精调）
              vars: Object.fromEntries(
                (planTpl?.varsSchema ?? []).map((v) => [v.key, v.default ?? '']),
              ),
              prompt: plan.additionalPrompt,
            }
          : plan.mode === 'i2i'
            ? { slots, prompt: plan.additionalPrompt }
            : { prompt: plan.additionalPrompt || input.trim() },
      options: {
        ratio: (plan.params.ratio ?? '1:1') as Ratio,
        quality: (plan.params.quality ?? 'standard') as Quality,
        candidateCount: plan.params.candidateCount ?? 1,
      },
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
      <div className="mb-1 flex items-center gap-2 text-[18px] font-bold">
        <Wand2 size={18} className="text-accent" /> Agent 创作
      </div>
      <p className="mt-0 mb-5 text-[12.5px] text-dim">
        低门槛意图入口：说清目标，Agent 解析素材、选模板与参数，确认后统一生成。
      </p>

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_420px]">
        <div className="flex flex-col gap-4">
          {/* 输入区 */}
          <div className="rounded-2xl border border-line bg-panel p-4">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="例如：帮我把这个口红换成大理石背景，1:1，两张，标准质量"
              className="min-h-[90px] w-full resize-y rounded-[10px] border border-line bg-panel2 px-3 py-2.5 text-[13px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
            />
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1">
                <AssetPicker
                  label="引用素材（可选，图生图/模板需要）"
                  value={refImage}
                  onChange={setRefImage}
                />
              </div>
            </div>
            <Button
              variant="primary"
              size="lg"
              className="mt-3"
              disabled={routing || !input.trim()}
              onClick={() => void analyze()}
            >
              <Sparkles size={14} /> {routing ? '分析中…' : '分析任务'}
            </Button>
          </div>

          {/* 方案卡 */}
          {plan && (
            <div className="rounded-2xl border border-line bg-panel p-4">
              <div className="mb-3 text-[12.5px] font-bold">Agent 方案（待确认）</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <PlanField label="推荐路径" value={MODE_LABEL[plan.mode]} />
                <PlanField
                  label="模板"
                  value={planTpl?.title ?? (plan.mode === 't2i' ? '无（文生图）' : '无')}
                />
                <PlanField
                  label="比例 / 数量"
                  value={`${plan.params.ratio ?? '1:1'} · ${plan.params.candidateCount ?? 1} 张`}
                />
                <PlanField
                  label="质量 / 预计消耗"
                  value={`${QUALITY_LABEL[plan.params.quality ?? 'standard']} · ${plan.estimatedPoints} 点`}
                />
              </div>

              {plan.additionalPrompt && (
                <div className="mt-3 rounded-[10px] border border-line-soft bg-panel2 px-3 py-2 text-[11.5px] text-dim">
                  <span className="text-faint">补充描述：</span>
                  {plan.additionalPrompt}
                </div>
              )}

              {/* 缺图：只允许补图，不允许提交 */}
              {plan.missingSlots?.length ? (
                <div className="mt-3 rounded-[10px] border border-warn/40 bg-warn/10 px-3 py-2.5">
                  <div className="mb-2 text-[11.5px] font-semibold text-warn">
                    需补充素材：{plan.missingSlots.join('、')}
                  </div>
                  <AssetPicker label="补充图片" required value={refImage} onChange={setRefImage} />
                </div>
              ) : null}

              <div className="mt-4 flex items-center gap-3">
                <Button
                  variant="primary"
                  size="lg"
                  disabled={submitting || needsImage}
                  onClick={() => void confirm()}
                >
                  <Sparkles size={14} />
                  {submitting ? '提交中…' : needsImage ? '请先补图' : `确认执行 · ${plan.estimatedPoints} 点`}
                </Button>
                <Button size="lg" onClick={() => setPlan(null)}>
                  调整描述
                </Button>
              </div>
              <div className="mt-2 text-[11px] text-faint">
                Agent 仅解析方案，不扣点；确认后才创建任务、走统一生成链路。
              </div>
            </div>
          )}
        </div>

        <ResultPanel
          run={run}
          submitting={submitting}
          expectedCount={plan?.params.candidateCount ?? 1}
          ratio={(plan?.params.ratio ?? '1:1') as Ratio}
          onRetry={() => void confirm()}
        />
      </div>
    </div>
  );
}

function PlanField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] border border-line-soft bg-panel2 px-3 py-2.5">
      <div className="mb-1 text-[10.5px] text-faint">{label}</div>
      <div className="text-[12.5px] font-medium text-ink">{value}</div>
    </div>
  );
}
