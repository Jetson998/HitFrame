import { useMemo, useState } from 'react';
import {
  POINTS_PER_IMAGE,
  type GenerationRequestDto,
  type Quality,
  type Ratio,
} from '@hitframe/shared';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useRunPolling } from '@/lib/useRunPolling';
import { useAppStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { AssetPicker } from '@/components/AssetPicker';
import { OutputSettings } from '@/components/OutputSettings';
import { ResultPanel } from '@/components/ResultPanel';

/**
 * 模板配置页（第三种输入结构）：图片槽位 + 业务变量（填空 + 选项，不暴露 prompt）。
 * 整页由 GET /templates 的 slots/varsSchema 数据驱动，商品换背景即 tpl_bg。
 */
export function TemplateConfigPage() {
  const {
    templates,
    activeTplId,
    setActiveTplId,
    currentProjectId,
    refreshMe,
    refreshAssets,
    showToast,
  } = useAppStore();
  const tpl = templates.find((t) => t.id === activeTplId);

  const [slotValues, setSlotValues] = useState<Record<string, string | null>>({});
  const [vars, setVars] = useState<Record<string, string>>({});
  const [prompt, setPrompt] = useState('');
  const [ratio, setRatio] = useState<Ratio>('1:1');
  const [quality, setQuality] = useState<Quality>('standard');
  const [count, setCount] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const { run, start, reset } = useRunPolling(() => {
    void refreshMe();
    void refreshAssets();
  });

  const cost = count * POINTS_PER_IMAGE[quality];
  const missingSlots = useMemo(
    () => (tpl ? tpl.slots.filter((s) => s.required !== false && !slotValues[s.key]) : []),
    [tpl, slotValues],
  );

  if (!tpl) return null;

  const submit = async () => {
    if (submitting) return;
    if (missingSlots.length > 0) {
      showToast(`请先填必填图片槽位：${missingSlots.map((s) => s.label).join('、')}`);
      return;
    }
    const missingVar = tpl.varsSchema.find((v) => v.required && !(vars[v.key] ?? v.default));
    if (missingVar) {
      showToast(`模板变量必填：${missingVar.label}`);
      return;
    }
    setSubmitting(true);
    reset();
    const dto: GenerationRequestDto = {
      mode: 'template',
      templateId: tpl.id,
      inputs: {
        slots: tpl.slots.map((s) => slotValues[s.key]).filter((v): v is string => !!v),
        vars: Object.fromEntries(
          tpl.varsSchema.map((v) => [v.key, vars[v.key] ?? v.default ?? '']),
        ),
        prompt: prompt.trim() || undefined,
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
      <div className="mb-5 flex items-center gap-3">
        <Button size="sm" onClick={() => setActiveTplId(null)}>
          <ArrowLeft size={13} /> 场景模板
        </Button>
        <div>
          <div className="text-[16px] font-bold">{tpl.title}</div>
          <div className="text-[11.5px] text-faint">{tpl.description}</div>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_420px]">
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-line bg-panel p-4">
            {tpl.slots.map((slot, i) => (
              <AssetPicker
                key={slot.key}
                label={`图片槽位 ${i + 1} · ${slot.label}`}
                required={slot.required !== false}
                value={slotValues[slot.key] ?? null}
                onChange={(id) => setSlotValues((v) => ({ ...v, [slot.key]: id }))}
              />
            ))}
          </div>

          <div className="rounded-2xl border border-line bg-panel p-4">
            <div className="mb-3 text-[11.5px] font-semibold text-dim">
              🎛️ 业务变量（填空 + 选项，不暴露 prompt）
            </div>
            {tpl.varsSchema.map((v) => (
              <div key={v.key} className="mb-3 last:mb-0">
                <div className="mb-1.5 text-[11.5px] text-dim">
                  {v.label} {v.required && <span className="text-accent">*</span>}
                </div>
                {v.type === 'text' ? (
                  <input
                    value={vars[v.key] ?? ''}
                    onChange={(e) => setVars((s) => ({ ...s, [v.key]: e.target.value }))}
                    placeholder={v.placeholder}
                    className="w-full rounded-[9px] border border-line bg-panel2 px-3 py-2 text-[12.5px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
                  />
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {(v.options ?? []).map((opt) => (
                      <Chip
                        key={opt}
                        active={(vars[v.key] ?? v.default) === opt}
                        onClick={() => setVars((s) => ({ ...s, [v.key]: opt }))}
                      >
                        {opt}
                      </Chip>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-line bg-panel p-4">
            <div className="mb-2 text-[11.5px] font-semibold text-dim">💬 补充描述（可选）</div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="用一句话补充想要的效果，可留空"
              className="min-h-[56px] w-full resize-y rounded-[10px] border border-line bg-panel2 px-3 py-2.5 text-[12.5px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
            />
            <OutputSettings
              ratio={ratio}
              quality={quality}
              count={count}
              onRatio={setRatio}
              onQuality={setQuality}
              onCount={setCount}
            />
            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                size="lg"
                disabled={submitting}
                onClick={() => void submit()}
              >
                <Sparkles size={14} /> {submitting ? '提交中…' : `生成 · ${cost} 点`}
              </Button>
              <span className="text-[11px] text-faint">生成成功自动存入资产库，参数快照可追溯</span>
            </div>
          </div>
        </div>

        <ResultPanel run={run} submitting={submitting} expectedCount={count} ratio={ratio} />
      </div>
    </div>
  );
}
