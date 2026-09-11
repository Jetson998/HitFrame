import { useState } from 'react';
import { Check, FileText, Sparkles, WandSparkles } from 'lucide-react';
import type {
  CreativeControls,
  GenerationMode,
  PromptCompileResponseDto,
  PromptMode,
  ReferenceFidelity,
  ReferenceInput,
  ReferenceRole,
} from '@hitframe/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PromptCompilerPanelProps {
  rawPrompt: string;
  mode: PromptMode;
  generationMode: GenerationMode;
  skillId?: string;
  templateId?: string;
  references?: ReferenceInput[];
  controls?: CreativeControls;
  compilation: PromptCompileResponseDto | null;
  editedPrompt: string;
  onControlsChange?: (patch: Partial<CreativeControls>) => void;
  onReferenceRoleChange?: (index: number, role: ReferenceRole) => void;
  onReferenceFidelityChange?: (index: number, fidelity: ReferenceFidelity) => void;
  showModePicker?: boolean;
  onModeChange: (mode: PromptMode) => void;
  onCompile: (result: PromptCompileResponseDto) => void;
  onEditedPrompt: (value: string) => void;
}

const MODES: Array<{
  id: PromptMode;
  label: string;
  hint: string;
  icon: typeof FileText;
}> = [
  { id: 'raw', label: '按我的描述执行', hint: '不改创意', icon: FileText },
  { id: 'enhance', label: '智能补全执行方案', hint: '补齐执行细节', icon: Sparkles },
  { id: 'director', label: '让 Agent 设计方案', hint: '提出新创意', icon: WandSparkles },
];

export function PromptCompilerPanel({
  rawPrompt,
  mode,
  generationMode,
  skillId,
  templateId,
  references = [],
  controls,
  compilation,
  editedPrompt,
  onControlsChange,
  onReferenceRoleChange,
  onReferenceFidelityChange,
  showModePicker = true,
  onModeChange,
  onCompile,
  onEditedPrompt,
}: PromptCompilerPanelProps) {
  const [compiling, setCompiling] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);

  const compile = async () => {
    if (mode === 'raw' || !rawPrompt.trim() || compiling) return;
    setCompiling(true);
    setCompileError(null);
    try {
      const result = await api.compilePrompt({
        mode,
        generationMode,
        rawPrompt: rawPrompt.trim(),
        skillId,
        templateId,
        references,
        controls,
      });
      onCompile(result);
    } catch (error) {
      setCompileError(error instanceof Error ? error.message : '分析失败，请稍后重试');
    } finally {
      setCompiling(false);
    }
  };

  return (
    <div className="mt-3 rounded-[var(--radius-card)] border border-line-soft bg-panel-muted/60 p-3">
      {showModePicker && (
        <div className="grid grid-cols-3 gap-1 rounded-[var(--radius-control)] border border-line-soft bg-panel p-1">
          {MODES.map(({ id, label, hint, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onModeChange(id)}
              className={cn(
                'flex min-w-0 flex-col items-center gap-0.5 rounded-[7px] px-1.5 py-2 text-center transition-colors',
                mode === id ? 'bg-ink text-white' : 'text-dim hover:bg-panel-muted hover:text-ink',
              )}
            >
              <span className="flex items-center gap-1 text-[10.5px] font-medium">
                <Icon size={13} /> {label}
              </span>
              <span className={cn('text-[9.5px]', mode === id ? 'text-white/65' : 'text-faint')}>
                {hint}
              </span>
            </button>
          ))}
        </div>
      )}

      {onControlsChange && (
        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <ControlSelect
            label="构图"
            value={controls?.composition ?? 'auto'}
            options={[
              ['auto', '自动'],
              ['center', '主体居中'],
              ['left_subject', '主体偏左'],
              ['right_subject', '主体偏右'],
              ['full_bleed', '满幅构图'],
            ]}
            onChange={(value) =>
              onControlsChange({ composition: value as CreativeControls['composition'] })
            }
          />
          <ControlSelect
            label="景别"
            value={controls?.shot ?? 'auto'}
            options={[
              ['auto', '自动'],
              ['close_up', '特写'],
              ['medium', '中景'],
              ['wide', '广角'],
            ]}
            onChange={(value) => onControlsChange({ shot: value as CreativeControls['shot'] })}
          />
          <ControlSelect
            label="光线"
            value={controls?.lighting ?? 'auto'}
            options={[
              ['auto', '自动'],
              ['natural', '自然光'],
              ['soft', '柔光'],
              ['dramatic', '戏剧光'],
              ['studio', '棚拍光'],
            ]}
            onChange={(value) =>
              onControlsChange({ lighting: value as CreativeControls['lighting'] })
            }
          />
          <ControlSelect
            label="主体保真"
            value={controls?.subjectPreservation ?? 'auto'}
            options={[
              ['auto', '自动'],
              ['strict', '严格保真'],
              ['flexible', '允许变化'],
            ]}
            onChange={(value) =>
              onControlsChange({
                subjectPreservation: value as CreativeControls['subjectPreservation'],
              })
            }
          />
          <ControlSelect
            label="创意强度"
            value={controls?.creativity ?? 'medium'}
            options={[
              ['low', '克制'],
              ['medium', '平衡'],
              ['high', '大胆'],
            ]}
            onChange={(value) =>
              onControlsChange({ creativity: value as CreativeControls['creativity'] })
            }
          />
        </div>
      )}

      {references.length > 0 && onReferenceRoleChange && (
        <div className="mt-2.5 rounded-[var(--radius-control)] border border-line-soft bg-panel px-3 py-2.5">
          <div className="mb-2 text-[10px] font-medium text-faint">参考图角色</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {references.map((reference, index) => (
              <label
                key={`${reference.assetId}-${index}`}
                className="flex min-w-0 items-center gap-2"
              >
                <span className="min-w-0 flex-1 truncate text-[10.5px] text-dim">
                  图片 {index + 1}
                </span>
                <div className="flex shrink-0 gap-1.5">
                  <select
                    value={reference.role}
                    onChange={(event) =>
                      onReferenceRoleChange(index, event.target.value as ReferenceRole)
                    }
                    aria-label={`图片 ${index + 1} 角色`}
                    className="h-7 max-w-[116px] rounded-[var(--radius-control)] border border-line-soft bg-panel-muted px-2 text-[10.5px] text-dim outline-none focus:border-primary"
                  >
                    {ROLE_OPTIONS.map(([role, label]) => (
                      <option key={role} value={role}>
                        {label}
                      </option>
                    ))}
                  </select>
                  {onReferenceFidelityChange && (
                    <select
                      value={reference.fidelity}
                      onChange={(event) =>
                        onReferenceFidelityChange(index, event.target.value as ReferenceFidelity)
                      }
                      aria-label={`图片 ${index + 1} 保真等级`}
                      className="h-7 max-w-[104px] rounded-[var(--radius-control)] border border-line-soft bg-panel-muted px-2 text-[10.5px] text-dim outline-none focus:border-primary"
                    >
                      <option value="auto">自动</option>
                      <option value="strict">严格保留</option>
                      <option value="flexible">允许艺术化</option>
                    </select>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {mode !== 'raw' && (
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0 text-[10.5px] leading-relaxed text-faint">
            {mode === 'director'
              ? '先提出主题和画面方案，确认后再生成。'
              : '只补齐执行细节，不改变你的创意。'}
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="shrink-0"
            disabled={compiling || !rawPrompt.trim()}
            onClick={() => void compile()}
          >
            <Sparkles size={13} />{' '}
            {compiling
              ? '分析中…'
              : compilation
                ? mode === 'director'
                  ? '重新设计'
                  : '重新增强'
                : mode === 'director'
                  ? '生成创意方案'
                  : '分析并增强'}
          </Button>
        </div>
      )}

      {compilation && mode !== 'raw' && (
        <div className="mt-3 space-y-2.5">
          <div className="grid gap-2.5 md:grid-cols-2">
            <div className="rounded-[var(--radius-control)] border border-line-soft bg-panel p-3">
              <div className="mb-1.5 text-[10.5px] font-medium text-faint">我的原始需求</div>
              <div className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-dim">
                {compilation.rawPrompt}
              </div>
            </div>
            <div className="rounded-[var(--radius-control)] border border-primary/25 bg-primary-soft/35 p-3">
              <div className="mb-1.5 flex items-center gap-1 text-[10.5px] font-medium text-primary">
                <Check size={12} /> Agent 结构化方案
              </div>
              <div className="max-h-[150px] overflow-y-auto whitespace-pre-wrap text-[11.5px] leading-relaxed text-ink">
                {compilation.compiledPrompt}
              </div>
            </div>
          </div>

          {compilation.changeSummary.length > 0 && (
            <div className="rounded-[var(--radius-control)] border border-line-soft bg-panel px-3 py-2 text-[10.5px] leading-relaxed text-faint">
              本次增强：{compilation.changeSummary.join(' · ')}
            </div>
          )}

          {compilation.directorSuggestions && (
            <div className="rounded-[var(--radius-control)] border border-accent/30 bg-accent/10 p-3">
              <div className="mb-2 text-[10.5px] font-semibold text-accent-ink">
                AI 建议，待确认
              </div>
              <div className="grid gap-1 text-[11.5px] leading-relaxed text-dim">
                {compilation.directorSuggestions.concept && (
                  <div>主题：{compilation.directorSuggestions.concept}</div>
                )}
                {compilation.directorSuggestions.composition && (
                  <div>构图：{compilation.directorSuggestions.composition}</div>
                )}
                {compilation.directorSuggestions.title && (
                  <div>标题建议：{compilation.directorSuggestions.title}</div>
                )}
                {compilation.directorSuggestions.sellingPoints?.length ? (
                  <div>卖点建议：{compilation.directorSuggestions.sellingPoints.join(' / ')}</div>
                ) : null}
              </div>
            </div>
          )}

          <label className="block rounded-[var(--radius-control)] border border-line-soft bg-panel p-3">
            <span className="mb-1.5 block text-[10.5px] font-medium text-faint">
              最终执行提示词（可编辑）
            </span>
            <textarea
              value={editedPrompt}
              onChange={(event) => onEditedPrompt(event.target.value)}
              className="min-h-[112px] w-full resize-y border-0 bg-transparent text-[11.5px] leading-relaxed text-ink outline-none"
              aria-label="最终生成说明"
            />
          </label>

          {compilation.warnings.length > 0 && (
            <div className="text-[10.5px] leading-relaxed text-warn">
              {compilation.warnings.join('；')}
            </div>
          )}
        </div>
      )}
      {compileError && (
        <div className="mt-2 text-[10.5px] leading-relaxed text-err">{compileError}</div>
      )}
    </div>
  );
}

const ROLE_OPTIONS: Array<[ReferenceRole, string]> = [
  ['product', '商品主体'],
  ['person', '人物 / 模特'],
  ['background', '背景'],
  ['style', '风格参考'],
  ['logo', 'Logo'],
];

function ControlSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="min-w-0">
      <span className="mb-1 block text-[10px] text-faint">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full min-w-0 rounded-[var(--radius-control)] border border-line-soft bg-panel px-2 text-[11px] text-dim outline-none focus:border-primary"
      >
        {options.map(([option, optionLabel]) => (
          <option key={option} value={option}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
