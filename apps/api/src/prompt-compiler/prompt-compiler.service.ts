import { HttpException, Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  POINTS_PER_IMAGE,
  PromptCompileRequestDto,
  PromptCompileResponseDto,
  RATIO_TO_SIZE,
} from '@hitframe/shared';
import { DB, Db } from '../db/db.module';
import { promptCompilations } from '../db/schema';
import { findCreationSkill } from '../creative/creation-skills.registry';
import { modeRequiresConfirmation, normalizeControls } from './prompt-compiler.utils';
import {
  PROMPT_COMPILER_PROVIDER,
  PromptCompilerInput,
  PromptCompilerOutput,
  PromptCompilerProvider,
} from './prompt-compiler.provider';

@Injectable()
export class PromptCompilerService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(PROMPT_COMPILER_PROVIDER) private readonly provider: PromptCompilerProvider,
  ) {}

  async compile(dto: PromptCompileRequestDto): Promise<PromptCompileResponseDto> {
    this.validate(dto);
    const skill = findCreationSkill(dto.skillId);
    if (dto.skillId && !skill)
      throw new HttpException({ code: 40001, message: 'Skill 不存在' }, 400);
    const fallbackSkill =
      skill ??
      findCreationSkill(
        dto.generationMode === 't2i' ? 'skill_general_image' : 'skill_product_atmosphere',
      )!;
    const references = dto.references ?? [];
    const controls = normalizeControls(dto.controls, fallbackSkill);
    const input: PromptCompilerInput = {
      mode: dto.mode,
      generationMode: dto.generationMode,
      rawPrompt: dto.rawPrompt.trim(),
      skill: fallbackSkill,
      templateId: dto.templateId,
      references,
      controls,
    };
    const result: PromptCompilerOutput = await this.provider.compile(input);
    const requestHash = createHash('sha256')
      .update(stableStringify({ ...dto, references, controls, skillId: fallbackSkill.id }))
      .digest('hex');
    const compileId = `pc_${randomUUID()}`;
    const response: PromptCompileResponseDto = {
      compileId,
      mode: dto.mode,
      compilerVersion: this.provider.version,
      rawPrompt: input.rawPrompt,
      normalizedBrief: result.normalizedBrief,
      compiledPrompt: result.compiledPrompt,
      changeSummary: result.changeSummary,
      warnings: result.warnings,
      directorSuggestions: result.directorSuggestions,
      requiresConfirmation: modeRequiresConfirmation(dto.mode),
      requestHash,
    };
    await this.db.insert(promptCompilations).values({
      id: compileId,
      tenantId: 'default',
      mode: dto.mode,
      generationMode: dto.generationMode,
      skillId: fallbackSkill.id,
      templateId: dto.templateId,
      rawPrompt: response.rawPrompt,
      normalizedBrief: response.normalizedBrief,
      compiledPrompt: response.compiledPrompt,
      creativeControls: controls,
      referenceRoles: references,
      changeSummary: response.changeSummary,
      warnings: response.warnings,
      directorSuggestions: response.directorSuggestions,
      compilerProvider: this.provider.name,
      compilerModel: this.provider.model,
      compilerVersion: this.provider.version,
      requestHash,
    });
    return response;
  }

  private validate(dto: PromptCompileRequestDto): void {
    if (!dto || typeof dto.rawPrompt !== 'string' || !dto.rawPrompt.trim()) {
      throw new HttpException({ code: 40001, message: '请输入创作需求' }, 400);
    }
    if (dto.rawPrompt.length > 12_000) {
      throw new HttpException({ code: 40001, message: '创作需求过长' }, 400);
    }
    if (!['raw', 'enhance', 'director'].includes(dto.mode)) {
      throw new HttpException({ code: 40001, message: '提示词模式非法' }, 400);
    }
    if (!['t2i', 'i2i', 'template'].includes(dto.generationMode)) {
      throw new HttpException({ code: 40001, message: '生成模式非法' }, 400);
    }
    const controls = dto.controls;
    if (
      controls?.candidateCount !== undefined &&
      (!Number.isInteger(controls.candidateCount) ||
        controls.candidateCount < 1 ||
        controls.candidateCount > 4)
    ) {
      throw new HttpException({ code: 40001, message: 'candidateCount 取值 1–4' }, 400);
    }
    if (controls?.quality !== undefined && !(controls.quality in POINTS_PER_IMAGE)) {
      throw new HttpException({ code: 40001, message: 'quality 非法' }, 400);
    }
    if (controls?.ratio !== undefined && !(controls.ratio in RATIO_TO_SIZE)) {
      throw new HttpException({ code: 40001, message: 'ratio 非法' }, 400);
    }
    const refs = dto.references ?? [];
    if (new Set(refs.map((ref) => ref.assetId)).size !== refs.length) {
      throw new HttpException({ code: 40001, message: '不能重复添加同一张参考图片' }, 400);
    }
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      (key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`,
    )
    .join(',')}}`;
}
