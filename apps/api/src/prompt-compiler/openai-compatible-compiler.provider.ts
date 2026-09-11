import { Injectable } from '@nestjs/common';
import type { PromptCompilerProvider } from './prompt-compiler.provider';
import type { PromptCompilerInput, PromptCompilerOutput } from './prompt-compiler.provider';
import {
  buildFakeOutput,
  mergeBrief,
  renderCompiledPrompt,
  userRequestsSafeArea,
} from './prompt-compiler.utils';
import { FakeCompilerProvider } from './fake-compiler.provider';

interface CompilerConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

/** Optional text compiler. It only proposes structured data; it never calls the image provider. */
@Injectable()
export class OpenAICompatibleCompilerProvider implements PromptCompilerProvider {
  readonly name = 'openai_compatible';
  readonly model: string;
  readonly version = process.env.PROMPT_COMPILER_VERSION ?? 's6c2-openai-v2';

  constructor(private readonly cfg: CompilerConfig) {
    this.model = cfg.model;
  }

  async compile(input: PromptCompilerInput): Promise<PromptCompilerOutput> {
    const seed = buildFakeOutput(input);
    const system = [
      '你是 HitFrame 的商业图片创意导演和提示词编译器。',
      '只输出 JSON，不要输出 Markdown 或额外说明。',
      '不要编造品牌事实、产品功效、人物身份或官方卖点。',
      '创意导演模式不能只复述用户原句；应补足可执行的主题、主体、场景、构图、色彩、光影、材质和视觉氛围，优先获得完成度高、具有视觉冲击力的效果图。',
      '默认输出饱满连贯的完整成片，不主动为 Logo、标题、卖点或后期排版制造大面积留白、占位区或割裂分区。只有用户原始需求明确要求安全区、留白、排版区、文案区或标题区时才保留排版区域；controls.textStrategy 不能单独证明用户有此要求。',
      '未提供参考图时，不得加入商品外观、Logo、包装文字、人物身份等参考图保真约束；只保留与本次画面真实相关的禁止项。',
      '当 Skill 支持纯文字创作且本次没有参考图时，不得警告缺少商品图或参考图；应直接给出完整创意方案。',
      '准确中文、Logo 和包装文字由后期处理；未明确要求时不要让图像模型生成随机文字或乱码，但这不等于预留空白区域。',
      '有参考图时必须保留输入参考图的角色和保真等级。',
      'JSON 字段：normalizedBrief、compiledPrompt、changeSummary、warnings、directorSuggestions。',
    ].join('\n');
    const user = JSON.stringify({
      mode: input.mode,
      generationMode: input.generationMode,
      skill: input.skill,
      rawPrompt: input.rawPrompt,
      references: input.references,
      controls: input.controls,
    });
    try {
      const response = await fetch(`${this.cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.cfg.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.cfg.model,
          reasoning_effort: 'low',
          max_completion_tokens: 2_000,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
      });
      const body = (await response.json().catch(() => null)) as {
        choices?: Array<{ message?: { content?: string } }>;
      } | null;
      if (!response.ok) throw new Error(`prompt compiler http ${response.status}`);
      const content = body?.choices?.[0]?.message?.content;
      if (!content) throw new Error('prompt compiler returned empty response');
      const start = content.indexOf('{');
      const end = content.lastIndexOf('}');
      const parsed = JSON.parse(
        start >= 0 && end > start ? content.slice(start, end + 1) : content,
      ) as Partial<PromptCompilerOutput>;
      if (typeof parsed.compiledPrompt !== 'string' || !parsed.compiledPrompt.trim()) {
        throw new Error('prompt compiler response missing compiledPrompt');
      }
      return mergeRemoteOutput(input, seed, parsed);
    } catch (error) {
      return {
        ...seed,
        warnings: [
          ...seed.warnings,
          `Agent 模型暂时不可用，本次已使用本地增强规则（${compilerErrorLabel(error)}）`,
        ],
      };
    }
  }
}

export function compilerFromEnvironment(): PromptCompilerProvider {
  const baseUrl = process.env.PROMPT_COMPILER_BASE_URL ?? process.env.IMAGE_BASE_URL;
  const apiKey = process.env.PROMPT_COMPILER_API_KEY ?? process.env.IMAGE_API_KEY;
  const provider =
    process.env.PROMPT_COMPILER_PROVIDER ?? (baseUrl && apiKey ? 'openai_compatible' : 'fake');
  if (provider !== 'openai_compatible') return new FakeCompilerProvider();
  if (!baseUrl || !apiKey)
    throw new Error('PROMPT_COMPILER_BASE_URL and PROMPT_COMPILER_API_KEY are required');
  return new OpenAICompatibleCompilerProvider({
    baseUrl,
    apiKey,
    model: process.env.PROMPT_COMPILER_MODEL ?? 'gpt-5.6-sol',
    timeoutMs: Number(process.env.PROMPT_COMPILER_TIMEOUT_MS ?? 90_000),
  });
}

function mergeRemoteOutput(
  input: PromptCompilerInput,
  seed: PromptCompilerOutput,
  parsed: Partial<PromptCompilerOutput>,
): PromptCompilerOutput {
  const allowsSafeArea = userRequestsSafeArea(input.rawPrompt);
  const brief = mergeBrief(seed.normalizedBrief, parsed.normalizedBrief ?? {});
  if (input.references.length === 0) {
    brief.subjectLocks = [];
    brief.negativeConstraints = brief.negativeConstraints.filter(
      (item) =>
        !/(?:保持|保留|不得改变|不要改变).{0,20}(?:商品|产品|Logo|包装文字|人物身份)/i.test(item),
    );
  }
  if (!allowsSafeArea) {
    brief.textLayer = { renderMode: 'none' };
    brief.composition =
      sanitizeImplicitSafeArea(brief.composition ?? '') || seed.normalizedBrief.composition;
    brief.executionEnhancements = brief.executionEnhancements.filter(
      (item) => !containsImplicitSafeArea(item),
    );
  }
  const directorCandidate = parsed.directorSuggestions ?? seed.directorSuggestions;
  const director =
    directorCandidate && !allowsSafeArea
      ? {
          ...directorCandidate,
          composition:
            sanitizeImplicitSafeArea(directorCandidate.composition ?? '') ||
            seed.directorSuggestions?.composition,
          subtitle:
            sanitizeImplicitSafeArea(directorCandidate.subtitle ?? '') ||
            seed.directorSuggestions?.subtitle,
        }
      : directorCandidate;
  const compiledPrompt = allowsSafeArea
    ? parsed.compiledPrompt!
    : sanitizeImplicitSafeArea(parsed.compiledPrompt!) ||
      renderCompiledPrompt(input, brief, director);
  const parsedChangeSummary = Array.isArray(parsed.changeSummary)
    ? parsed.changeSummary.filter((value): value is string => typeof value === 'string')
    : seed.changeSummary;
  let warnings = Array.isArray(parsed.warnings)
    ? parsed.warnings.filter((value): value is string => typeof value === 'string')
    : seed.warnings;
  if (input.generationMode === 't2i' && input.skill.supportsTextOnly) {
    warnings = warnings.filter(
      (item) => !/(?:缺少|上传|提供).{0,12}(?:参考图|商品图|素材)/.test(item),
    );
  }
  return {
    normalizedBrief: brief,
    compiledPrompt,
    changeSummary: allowsSafeArea
      ? parsedChangeSummary
      : parsedChangeSummary.filter((item) => !containsImplicitSafeArea(item)),
    warnings,
    directorSuggestions: director,
  };
}

function compilerErrorLabel(error: unknown): string {
  if (error instanceof DOMException && error.name === 'TimeoutError') return '请求超时';
  if (error instanceof Error && error.message.startsWith('prompt compiler http')) {
    return error.message.replace('prompt compiler ', '').toUpperCase();
  }
  return '响应异常';
}

function sanitizeImplicitSafeArea(value: string): string {
  return value
    .split('\n')
    .map((line) =>
      line
        .split(/(?<=[；。])/)
        .filter((segment) => !containsImplicitSafeArea(segment))
        .join('')
        .trim(),
    )
    .filter(Boolean)
    .join('\n');
}

function containsImplicitSafeArea(value: string): boolean {
  return /(?:预留|保留|留出|腾出|reserve|leave|keep).{0,28}(?:安全区|留白|排版区|文案区|标题区|文字区|Logo|标题|卖点|safe area|negative space|copy space)/i.test(
    value,
  );
}
