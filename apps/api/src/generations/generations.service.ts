import { HttpException, Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  GenerationAcceptedDto,
  GenerationRequestDto,
  POINTS_PER_IMAGE,
  RATIO_TO_SIZE,
  RunOrigin,
} from '@hitframe/shared';
import { DB, Db } from '../db/db.module';
import { generationJobs, generationRuns, nodeTemplates, projects, tenants } from '../db/schema';
import { CreditsService } from '../credits/credits.service';
import { ExecutorService } from './executor.service';
import { QueueDispatcherService } from '../queue/dispatcher.service';

const TENANT = 'default'; // M1 单租户

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
  ) {}

  async create(dto: GenerationRequestDto, origin: RunOrigin): Promise<GenerationAcceptedDto> {
    this.validateBasics(dto);
    if (dto.projectId) {
      const project = await this.db.query.projects.findFirst({
        where: eq(projects.id, dto.projectId),
      });
      if (!project)
        throw new HttpException({ code: 400, message: `项目不存在：${dto.projectId}` }, 400);
    }
    const { endpoint, prompt, inputFidelity } = await this.resolveInput(dto);

    const est = dto.options.candidateCount * POINTS_PER_IMAGE[dto.options.quality];
    const tenant = await this.db.query.tenants.findFirst({ where: eq(tenants.id, TENANT) });
    if (!tenant) throw new HttpException({ code: 50000, message: '系统繁忙，请稍后再试' }, 500);

    const runId = `run_${randomUUID()}`;
    const jobIds = Array.from({ length: dto.options.candidateCount }, () => `job_${randomUUID()}`);
    const size = RATIO_TO_SIZE[dto.options.ratio];
    const inputParams = {
      prompt,
      size,
      quality: dto.options.quality,
      slots: dto.inputs.slots ?? [],
      inputFidelity,
    };

    try {
      // 入队事务（S1）：Run + Jobs（enqueueState=pending 即 outbox 标记）+ hold 预扣同事务提交；
      // 条件扣减防并发透支；幂等冲突整体回滚 → 不会产生重复 hold
      await this.db.transaction(async (tx) => {
        await tx.insert(generationRuns).values({
          id: runId,
          tenantId: TENANT,
          projectId: dto.projectId,
          mode: dto.mode,
          templateId: dto.templateId,
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
            projectId: dto.projectId,
            mode: dto.mode,
            templateId: dto.templateId,
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
    if (!(ratio in RATIO_TO_SIZE)) throw bad('ratio 非法');
    if (dto.mode === 't2i' && !dto.inputs?.prompt?.trim()) throw bad('t2i 需要 prompt');
    if (dto.mode === 'i2i' && !dto.inputs?.slots?.length) throw bad('i2i 需要至少 1 个图片槽位');
    if (dto.mode === 'template' && !dto.templateId) throw bad('template 模式需要 templateId');
  }

  /** 解析三种输入结构 → 统一的 endpoint + 最终 prompt（模板占位符在此填充，快照进 job） */
  private async resolveInput(
    dto: GenerationRequestDto,
  ): Promise<{ endpoint: 'generations' | 'edits'; prompt: string; inputFidelity?: 'high' }> {
    if (dto.mode === 't2i') return { endpoint: 'generations', prompt: dto.inputs.prompt!.trim() };
    if (dto.mode === 'i2i')
      return { endpoint: 'edits', prompt: dto.inputs.prompt?.trim() || '基于参考图生成同风格新图' };

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
    let prompt = tpl.promptTemplate.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
    if (dto.inputs.prompt?.trim()) prompt += `，${dto.inputs.prompt.trim()}`;
    return {
      endpoint: tpl.endpoint as 'generations' | 'edits',
      prompt,
      inputFidelity: (tpl.defaultParams as { inputFidelity?: 'high' } | null)?.inputFidelity,
    };
  }
}
