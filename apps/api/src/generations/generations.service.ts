import { HttpException, Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  GenerationAcceptedDto,
  GenerationRequestDto,
  MAX_REFERENCE_IMAGES,
  POINTS_PER_IMAGE,
  RATIO_TO_SIZE,
  RunOrigin,
  type CreativeControls,
  type ReferenceInput,
} from '@hitframe/shared';
import { DB, Db } from '../db/db.module';
import {
  generationJobs,
  generationRuns,
  nodeTemplates,
  projects,
  tenants,
  promptCompilations,
} from '../db/schema';
import { CreditsService } from '../credits/credits.service';
import { ExecutorService } from './executor.service';
import { QueueDispatcherService } from '../queue/dispatcher.service';
import { compileImageReferencePrompt, type ImageReferenceEntry } from './reference-prompt';
import { ensureDefaultProject } from '../default-project';
import { GenerationLogsService } from './generation-logs.service';

const TENANT = 'default'; // M1 单租户

export interface GenerationRequestContext {
  /** 多用户认证接入前可为空；日志和 Run schema 已预留该字段。 */
  actorId?: string;
  requestId?: string;
  requestIp?: string;
}

interface TemplateVarDef {
  key: string;
  label: string;
  required?: boolean;
  default?: string;
}
interface TemplateSlotDef {
  key: string;
  label: string;
  required?: boolean;
}

@Injectable()
export class GenerationsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly executor: ExecutorService,
    private readonly credits: CreditsService,
    private readonly dispatcher: QueueDispatcherService,
    private readonly logs: GenerationLogsService,
  ) {}

  async create(
    dto: GenerationRequestDto,
    origin: RunOrigin,
    context: GenerationRequestContext = {},
  ): Promise<GenerationAcceptedDto> {
    this.validateBasics(dto);
    const projectId = dto.projectId ?? (await ensureDefaultProject(this.db));
    if (dto.projectId) {
      const project = await this.db.query.projects.findFirst({
        where: eq(projects.id, dto.projectId),
      });
      if (!project)
        throw new HttpException({ code: 400, message: `项目不存在：${dto.projectId}` }, 400);
    }
    await this.validatePromptCompilation(dto);
    const { endpoint, prompt, inputFidelity, referenceMap } = await this.resolveInput(dto);

    const est = dto.options.candidateCount * POINTS_PER_IMAGE[dto.options.quality];
    const tenant = await this.db.query.tenants.findFirst({ where: eq(tenants.id, TENANT) });
    if (!tenant) throw new HttpException({ code: 50000, message: '系统繁忙，请稍后再试' }, 500);

    const runId = `run_${randomUUID()}`;
    const jobIds = Array.from({ length: dto.options.candidateCount }, () => `job_${randomUUID()}`);
    const size = dto.options.ratio ? RATIO_TO_SIZE[dto.options.ratio] : undefined;
    const inputParams = {
      prompt,
      userPrompt: dto.inputs.prompt?.trim() || undefined,
      requestId: context.requestId,
      size,
      ratio: dto.options.ratio,
      quality: dto.options.quality,
      candidateCount: dto.options.candidateCount,
      slots: dto.inputs.slots ?? [],
      vars: dto.inputs.vars,
      inputFidelity,
      referenceMap,
      promptCompilationId: dto.promptCompilationId,
      references: dto.inputs.references ?? [],
    };

    try {
      // 入队事务（S1）：Run + Jobs（enqueueState=pending 即 outbox 标记）+ hold 预扣同事务提交；
      // 条件扣减防并发透支；幂等冲突整体回滚 → 不会产生重复 hold
      await this.db.transaction(async (tx) => {
        await tx.insert(generationRuns).values({
          id: runId,
          tenantId: TENANT,
          actorId: context.actorId,
          projectId,
          mode: dto.mode,
          templateId: dto.templateId,
          promptCompilationId: dto.promptCompilationId,
          origin,
          candidateCount: dto.options.candidateCount,
          idempotencyKey: dto.idempotencyKey,
          requestParams: dto as unknown as Record<string, unknown>,
          status: 'queued',
        });
        await tx.insert(generationJobs).values(
          jobIds.map((id) => ({
            id,
            runId,
            tenantId: TENANT,
            actorId: context.actorId,
            projectId,
            mode: dto.mode,
            templateId: dto.templateId,
            promptCompilationId: dto.promptCompilationId,
            endpoint,
            inputParams,
            status: 'queued' as const,
          })),
        );
        await this.credits.hold(tx as unknown as Db, TENANT, runId, est);
      });
    } catch (err) {
      if (err instanceof HttpException) throw err; // 40201 点数不足等业务错误直接透出
      // 幂等：同 (tenantId, idempotencyKey) 重复提交 → 返回首次的 runId + jobs[]
      // Drizzle 将 pg 错误包装为 DrizzleQueryError，唯一约束码在 cause.code
      const pgCode =
        (err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code;
      if (pgCode === '23505') {
        return this.findExisting(dto.idempotencyKey);
      }
      throw err;
    }

    await this.logs.record({
      event: 'accepted',
      tenantId: TENANT,
      actorId: context.actorId,
      runId,
      requestId: context.requestId,
      status: 'queued',
      mode: dto.mode,
      templateId: dto.templateId,
      endpoint,
      userPrompt: dto.inputs.prompt?.trim() || undefined,
      compiledPrompt: prompt,
      inputParams,
      requestIp: context.requestIp,
      attemptNo: 0,
      metadata: { candidateCount: dto.options.candidateCount },
    });

    // 202 之后按 EXECUTION_MODE 互斥派发：queue → BullMQ（S2）；inline → 进程内执行器（回滚开关）
    if (this.dispatcher.enabled) void this.dispatcher.dispatchRun(runId);
    else void this.executor.execute(runId);

    return {
      runId,
      jobs: jobIds.map((jobId) => ({ jobId, status: 'queued' as const })),
      pointsEstimated: est,
    };
  }

  private async findExisting(idempotencyKey: string): Promise<GenerationAcceptedDto> {
    const run = await this.db.query.generationRuns.findFirst({
      where: and(
        eq(generationRuns.tenantId, TENANT),
        eq(generationRuns.idempotencyKey, idempotencyKey),
      ),
    });
    if (!run)
      throw new HttpException({ code: 1, message: 'idempotency conflict but run missing' }, 500);
    const jobs = await this.db
      .select({ id: generationJobs.id, status: generationJobs.status })
      .from(generationJobs)
      .where(eq(generationJobs.runId, run.id));
    return {
      runId: run.id,
      jobs: jobs.map((j) => ({ jobId: j.id, status: j.status as never })),
      pointsEstimated:
        run.candidateCount *
        POINTS_PER_IMAGE[(run.requestParams as GenerationRequestDto).options.quality],
    };
  }

  private validateBasics(dto: GenerationRequestDto): void {
    const bad = (message: string) => new HttpException({ code: 400, message }, 400);
    if (!dto.idempotencyKey) throw bad('idempotencyKey 必填');
    if (!['t2i', 'i2i', 'template'].includes(dto.mode)) throw bad('mode 非法');
    const { candidateCount, quality, ratio } = dto.options ?? {};
    if (!Number.isInteger(candidateCount) || candidateCount < 1 || candidateCount > 4)
      throw bad('candidateCount 取值 1–4');
    if (!(quality in POINTS_PER_IMAGE)) throw bad('quality 非法');
    if (ratio !== undefined && !Object.prototype.hasOwnProperty.call(RATIO_TO_SIZE, ratio))
      throw bad('ratio 非法');
    const slots = dto.inputs?.slots ?? [];
    if (slots.length > MAX_REFERENCE_IMAGES) throw bad(`参考图片最多 ${MAX_REFERENCE_IMAGES} 张`);
    if ((dto.mode === 'i2i' || dto.mode === 'template') && new Set(slots).size !== slots.length)
      throw bad('不能重复添加同一张参考图片');
    const references = dto.inputs?.references ?? [];
    if (references.length > 0) {
      if (references.length !== slots.length) throw bad('参考图角色与图片数量不一致');
      if (references.some((reference, index) => reference.assetId !== slots[index])) {
        throw bad('参考图角色顺序与图片顺序不一致');
      }
      const roles = new Set(['product', 'person', 'background', 'style', 'logo']);
      const fidelities = new Set(['auto', 'strict', 'flexible']);
      if (references.some((reference) => !roles.has(reference.role))) throw bad('参考图角色非法');
      if (references.some((reference) => !fidelities.has(reference.fidelity))) {
        throw bad('参考图保真等级非法');
      }
    }
    if (dto.mode === 't2i' && !dto.inputs?.prompt?.trim()) throw bad('t2i 需要 prompt');
    if (dto.mode === 'i2i' && !dto.inputs?.slots?.length) throw bad('i2i 需要至少 1 个图片槽位');
    if (dto.mode === 'template' && !dto.templateId) throw bad('template 模式需要 templateId');
  }

  /** A compilation is a tenant-scoped preview snapshot. It is never trusted for billing or auth. */
  private async validatePromptCompilation(dto: GenerationRequestDto): Promise<void> {
    if (!dto.promptCompilationId) return;
    const compilation = await this.db.query.promptCompilations.findFirst({
      where: and(
        eq(promptCompilations.id, dto.promptCompilationId),
        eq(promptCompilations.tenantId, TENANT),
      ),
    });
    if (!compilation) {
      throw new HttpException({ code: 400, message: '提示词编译已失效，请重新分析' }, 400);
    }
    if (compilation.generationMode !== dto.mode) {
      throw new HttpException({ code: 400, message: '提示词编译与当前生成方式不匹配' }, 400);
    }
    if (compilation.templateId && compilation.templateId !== dto.templateId) {
      throw new HttpException({ code: 400, message: '提示词编译与当前模板不匹配' }, 400);
    }
    const controls = (compilation.creativeControls ?? {}) as CreativeControls;
    if (
      controls.ratio !== dto.options.ratio ||
      controls.quality !== dto.options.quality ||
      controls.candidateCount !== dto.options.candidateCount
    ) {
      throw new HttpException({ code: 400, message: '输出参数已变化，请重新分析' }, 400);
    }
    const compiledReferences = (compilation.referenceRoles ?? []) as ReferenceInput[];
    if (stableStringify(compiledReferences) !== stableStringify(dto.inputs.references ?? [])) {
      throw new HttpException({ code: 400, message: '参考图或图片角色已变化，请重新分析' }, 400);
    }
  }

  /** 解析三种输入结构 → 统一的 endpoint + 最终 prompt（模板占位符在此填充，快照进 job） */
  private async resolveInput(dto: GenerationRequestDto): Promise<{
    endpoint: 'generations' | 'edits';
    prompt: string;
    inputFidelity?: 'high';
    referenceMap?: ImageReferenceEntry[];
  }> {
    if (dto.mode === 't2i') return { endpoint: 'generations', prompt: dto.inputs.prompt!.trim() };
    if (dto.mode === 'i2i') {
      try {
        const compiled = compileImageReferencePrompt(
          this.withReferenceInstructions(
            dto.inputs.prompt?.trim() || '基于参考图生成同风格新图',
            dto.inputs.references,
          ),
          dto.inputs.slots ?? [],
        );
        return {
          endpoint: 'edits',
          prompt: compiled.prompt,
          referenceMap: compiled.referenceMap,
        };
      } catch (error) {
        throw new HttpException({ code: 400, message: (error as Error).message }, 400);
      }
    }

    const tpl = await this.db.query.nodeTemplates.findFirst({
      where: eq(nodeTemplates.id, dto.templateId!),
    });
    if (!tpl) throw new HttpException({ code: 404, message: `模板不存在：${dto.templateId}` }, 404);

    const slotDefs = tpl.slots as TemplateSlotDef[];
    const requiredSlots = slotDefs.filter((s) => s.required !== false).length;
    if ((dto.inputs.slots?.length ?? 0) < requiredSlots)
      throw new HttpException(
        { code: 400, message: `模板需要 ${requiredSlots} 个必填图片槽位` },
        400,
      );

    const varDefs = tpl.varsSchema as TemplateVarDef[];
    const vars: Record<string, string> = {};
    for (const def of varDefs) {
      const value = dto.inputs.vars?.[def.key] ?? def.default;
      if (def.required && !value)
        throw new HttpException({ code: 400, message: `模板变量必填：${def.label}` }, 400);
      vars[def.key] = value ?? '';
    }
    const slotAssetIds = dto.inputs.slots ?? [];
    if (dto.promptCompilationId && dto.inputs.prompt?.trim()) {
      try {
        const compiledPrompt = compileImageReferencePrompt(
          this.withReferenceInstructions(dto.inputs.prompt.trim(), dto.inputs.references),
          slotAssetIds,
        );
        return {
          endpoint: tpl.endpoint as 'generations' | 'edits',
          prompt: compiledPrompt.prompt,
          inputFidelity: (tpl.defaultParams as { inputFidelity?: 'high' } | null)?.inputFidelity,
          referenceMap: compiledPrompt.referenceMap,
        };
      } catch (error) {
        throw new HttpException({ code: 400, message: (error as Error).message }, 400);
      }
    }
    const roleMapping = slotAssetIds
      .map((_, index) => `Image ${index + 1} 是${slotDefs[index]?.label ?? '补充参考图'}`)
      .join('；');
    let rawPrompt = tpl.promptTemplate.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
    if (roleMapping) rawPrompt = `输入图片角色：${roleMapping}。${rawPrompt}`;
    if (dto.inputs.prompt?.trim()) rawPrompt += `，${dto.inputs.prompt.trim()}`;
    rawPrompt = this.withReferenceInstructions(rawPrompt, dto.inputs.references);
    let compiled: ReturnType<typeof compileImageReferencePrompt>;
    try {
      compiled = compileImageReferencePrompt(rawPrompt, slotAssetIds);
    } catch (error) {
      throw new HttpException({ code: 400, message: (error as Error).message }, 400);
    }
    return {
      endpoint: tpl.endpoint as 'generations' | 'edits',
      prompt: compiled.prompt,
      inputFidelity: (tpl.defaultParams as { inputFidelity?: 'high' } | null)?.inputFidelity,
      referenceMap: compiled.referenceMap,
    };
  }

  private withReferenceInstructions(prompt: string, references?: ReferenceInput[]): string {
    if (!references?.length) return prompt;
    const roleLabels: Record<ReferenceInput['role'], string> = {
      product: '商品主体',
      person: '人物主体',
      background: '背景参考',
      style: '风格参考',
      logo: 'Logo / 品牌素材',
    };
    const fidelityLabels: Record<ReferenceInput['fidelity'], string> = {
      auto: '按角色合理使用',
      strict: '严格保留，不重绘身份、外观、Logo 或包装文字',
      flexible: '允许艺术化变化',
    };
    const instructions = references
      .map(
        (reference, index) =>
          `Image ${index + 1} 是${roleLabels[reference.role]}，${fidelityLabels[reference.fidelity]}`,
      )
      .join('；');
    return `输入参考图角色：${instructions}。\n\n${prompt}`;
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
