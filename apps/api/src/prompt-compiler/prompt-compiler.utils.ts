import type {
  CreativeBrief,
  CreationSkill,
  CreativeControls,
  DirectorSuggestions,
  PromptMode,
  ReferenceInput,
} from '@hitframe/shared';
import type { PromptCompilerInput, PromptCompilerOutput } from './prompt-compiler.provider';

const SAFE_AREA_REQUEST_RE =
  /(?:安全区|留白|排版区|文案区|标题区|文字区|预留.*(?:标题|文案|文字|Logo)|留出.*(?:标题|文案|文字|Logo))/i;

export function userRequestsSafeArea(rawPrompt: string): boolean {
  return SAFE_AREA_REQUEST_RE.test(rawPrompt);
}

export function buildBaseBrief(input: PromptCompilerInput): CreativeBrief {
  const subjectLocks: string[] = [];
  for (const reference of input.references) {
    if (reference.role === 'product')
      subjectLocks.push('保持商品外观、比例、材质、Logo 和包装文字不变');
    if (reference.role === 'person') subjectLocks.push('保持人物身份、脸部、姿态和服装特征');
    if (reference.role === 'logo') subjectLocks.push('Logo 原样保留，不重新绘制');
  }

  const warnings: string[] = [];
  const textOnlySkillRun =
    input.generationMode === 't2i' && input.skill.supportsTextOnly && input.references.length === 0;
  if (
    !textOnlySkillRun &&
    input.skill.requiredReferences.some(
      (role) => !input.references.some((ref) => ref.role === role),
    )
  ) {
    const missing = input.skill.requiredReferences.filter(
      (role) => !input.references.some((ref) => ref.role === role),
    );
    warnings.push(`当前 Skill 还缺少参考图角色：${missing.join('、')}`);
  }
  const controls = input.controls;
  const wantsSafeArea = userRequestsSafeArea(input.rawPrompt);
  const controlSummary = [
    controls.composition && controls.composition !== 'auto' ? `构图：${controls.composition}` : '',
    controls.shot && controls.shot !== 'auto' ? `景别：${controls.shot}` : '',
    controls.lighting && controls.lighting !== 'auto' ? `光线：${controls.lighting}` : '',
    wantsSafeArea && controls.safeArea && controls.safeArea !== 'none'
      ? `安全区：${controls.safeArea}`
      : '',
  ].filter(Boolean);

  return {
    intent: input.skill.name,
    subject: input.rawPrompt,
    userFacts: { productFacts: [], sellingPoints: [] },
    composition: controlSummary.find((item) => item.startsWith('构图')),
    shot: controlSummary.find((item) => item.startsWith('景别')),
    lighting: controlSummary.find((item) => item.startsWith('光线')),
    referenceRoles: input.references,
    subjectLocks,
    executionEnhancements: [],
    negativeConstraints: input.skill.promptRules.defaultNegativeConstraints.filter(
      (constraint) =>
        input.references.some((reference) => reference.role === 'product') ||
        !/第二个商品|改变商品外观|商品.*(?:Logo|包装文字)/i.test(constraint),
    ),
    textLayer: { renderMode: wantsSafeArea ? 'overlay_later' : 'none' },
    warnings,
  };
}

function directorSuggestions(input: PromptCompilerInput): DirectorSuggestions {
  const subject = input.rawPrompt.replace(/\s+/g, ' ').trim();
  const shortSubject = subject.length > 24 ? `${subject.slice(0, 24)}…` : subject;
  const wantsSafeArea = userRequestsSafeArea(input.rawPrompt);
  return {
    concept: `${input.skill.name}：${shortSubject}`,
    palette: ['主题主色', '主体材质色', '对比强调色'],
    composition: wantsSafeArea
      ? '主体清晰聚焦，并按用户要求保留排版区域'
      : '采用完整饱满的成片构图，主体聚焦、层次连贯',
    title: `围绕「${shortSubject}」的商业主视觉`,
    subtitle: wantsSafeArea ? '按用户要求处理构图' : '先完成可直接预览的高质量视觉成片',
    sellingPoints: ['主体识别清晰', '场景氛围统一', '画面完整且具有视觉冲击力'],
  };
}

function referencesSummary(references: ReferenceInput[]): string {
  if (references.length === 0) return '无参考图';
  return references
    .map((ref, index) => `Image ${index + 1}：${ref.role}（${ref.fidelity}）`)
    .join('；');
}

export function renderCompiledPrompt(
  input: PromptCompilerInput,
  brief: CreativeBrief,
  suggestions?: DirectorSuggestions,
): string {
  if (input.mode === 'raw') return input.rawPrompt.trim();

  const wantsSafeArea = userRequestsSafeArea(input.rawPrompt);
  const hasReferences = input.references.length > 0;

  const lines = [
    `用户目标：${input.rawPrompt.trim()}`,
    `Skill：${input.skill.name}`,
    `主体：${brief.subject}`,
    `参考图：${referencesSummary(input.references)}`,
    brief.subjectLocks.length > 0 ? `主体保护：${brief.subjectLocks.join('；')}` : '',
    '执行细节：形成完整、高完成度的商业视觉，强化主体层次、场景氛围、光影和材质表现；画面饱满统一、层次自然、视觉重点明确。',
    brief.composition ?? '',
    brief.shot ?? '',
    brief.lighting ?? '',
    hasReferences && input.controls.subjectPreservation === 'strict'
      ? '主体保真：严格保持参考主体。'
      : '',
    wantsSafeArea
      ? '排版策略：仅按用户明确要求保留排版区域，准确文字由后期添加。'
      : '成片策略：优先完成饱满连贯、可直接预览的视觉画面。',
    brief.negativeConstraints.length > 0 ? `禁止项：${brief.negativeConstraints.join('；')}` : '',
  ];
  if (suggestions) {
    lines.push(
      `已确认创意方向：${suggestions.concept ?? ''}`,
      `已确认色彩：${(suggestions.palette ?? []).join('、')}`,
      `已确认构图：${suggestions.composition ?? ''}`,
    );
  }
  return lines.filter(Boolean).join('\n');
}

export function buildFakeOutput(input: PromptCompilerInput): PromptCompilerOutput {
  const brief = buildBaseBrief(input);
  if (
    input.mode === 'director' &&
    input.skill.id === 'skill_xhs_cover' &&
    input.references.length === 0
  ) {
    brief.subject = '选择一个清晰、有记忆点的原创商业主体作为视觉中心，不虚构真实品牌背书';
    brief.scene = '围绕主题建立具有生活方式氛围和社交传播感的完整场景';
    brief.visualStyle = '小红书竖版商业视觉，鲜明、精致、可直接预览';
  }
  const director = input.mode === 'director' ? directorSuggestions(input) : undefined;
  const executionEnhancements =
    input.mode === 'enhance' || input.mode === 'director'
      ? [
          '补齐主体、场景和视觉主题',
          '增强商业构图、光影、色彩和材质表现',
          ...(input.references.length > 0 ? ['按参考图增加必要的主体保真约束'] : []),
          userRequestsSafeArea(input.rawPrompt)
            ? '按用户要求保留排版区域'
            : '生成完整、饱满、可直接预览的成片',
        ]
      : [];
  brief.executionEnhancements = executionEnhancements;
  if (director) brief.directorSuggestions = director;

  const changeSummary = [...executionEnhancements];
  if (director) changeSummary.push('新增待确认的主题、色彩、标题和卖点建议');
  return {
    normalizedBrief: brief,
    compiledPrompt: renderCompiledPrompt(input, brief, director),
    changeSummary,
    warnings: brief.warnings,
    directorSuggestions: director,
  };
}

export function mergeBrief(base: CreativeBrief, candidate: Partial<CreativeBrief>): CreativeBrief {
  return {
    ...base,
    ...candidate,
    userFacts: { ...base.userFacts, ...(candidate.userFacts ?? {}) },
    referenceRoles: base.referenceRoles,
    subjectLocks: candidate.subjectLocks ?? base.subjectLocks,
    executionEnhancements: candidate.executionEnhancements ?? base.executionEnhancements,
    negativeConstraints: candidate.negativeConstraints ?? base.negativeConstraints,
    textLayer: { ...base.textLayer, ...(candidate.textLayer ?? {}) },
    warnings: candidate.warnings ?? base.warnings,
  };
}

export function normalizeControls(
  controls: CreativeControls | undefined,
  skill: CreationSkill,
): CreativeControls {
  return {
    ratio: controls?.ratio ?? skill.defaultRatio,
    quality: controls?.quality ?? skill.defaultQuality,
    candidateCount: controls?.candidateCount ?? skill.defaultCandidateCount,
    composition: controls?.composition ?? 'auto',
    shot: controls?.shot ?? 'auto',
    lighting: controls?.lighting ?? 'auto',
    subjectPreservation: controls?.subjectPreservation ?? 'auto',
    creativity: controls?.creativity ?? 'medium',
    textStrategy: 'no_text',
    safeArea: 'none',
  };
}

export function modeRequiresConfirmation(mode: PromptMode): boolean {
  return mode !== 'raw';
}
