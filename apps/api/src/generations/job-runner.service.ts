import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  classifyJobError,
  JobErrorCode,
  JobErrorKind,
  objectKey,
  POINTS_PER_IMAGE,
  Quality,
} from '@hitframe/shared';
import { ProviderError } from '@hitframe/image-provider';
import { DB, Db } from '../db/db.module';
import { assets, generationJobs, generationRuns, usageEvents } from '../db/schema';
import { StorageService } from '../storage/storage.service';
import { CreditsService } from '../credits/credits.service';
import { getImageProvider } from '../provider.factory';

const TENANT = 'default';

export interface JobInputParams {
  prompt: string;
  size: string;
  quality: Quality;
  slots: string[];
  inputFidelity?: 'high';
}

type JobRow = typeof generationJobs.$inferSelect;

/** 图片魔数校验（供应商文档：获取结果 → 校验 → 转存自有存储） */
function sniffImage(buf: Buffer): 'png' | 'jpeg' | 'webp' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (
    buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buf.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'webp';
  return null;
}

/**
 * Job 执行核心（S2 起为 inline 执行器与 BullMQ Worker 的共用内核）：
 * CAS 抢占 → Provider 调用 → 下载/校验/转存 → 资产+UsageEvent+settle 同事务；
 * 失败走 failJobWithRefund（终态 CAS + refund 幂等）。
 */
@Injectable()
export class JobRunnerService {
  private readonly log = new Logger('JobRunner');

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly storage: StorageService,
    private readonly credits: CreditsService,
  ) {}

  /**
   * CAS 原子抢占（S2 P1 阶段门）：queued → running 翻转成功者才能调用 Provider。
   * 队列重投恢复：status 停在 running（上一持有者失联，BullMQ 锁过期重投）时，
   * 以 attempts 值做 CAS 递增，仅一个恢复者胜出——两个 Worker 同抢只有一个成功。
   */
  async claim(
    jobId: string,
    allowRunningRecovery: boolean,
  ): Promise<{ job: JobRow; viaRecovery: boolean } | null> {
    const [first] = await this.db
      .update(generationJobs)
      .set({ status: 'running', attempts: sql`${generationJobs.attempts} + 1` })
      .where(and(eq(generationJobs.id, jobId), eq(generationJobs.status, 'queued')))
      .returning();
    if (first) {
      await this.markRunRunning(first.runId);
      return { job: first, viaRecovery: false };
    }

    const row = await this.db.query.generationJobs.findFirst({
      where: eq(generationJobs.id, jobId),
    });
    if (!row || row.status === 'succeeded' || row.status === 'failed') return null;
    if (!allowRunningRecovery || row.status !== 'running') return null;
    // 到此：DB 仍 running 但无 BullMQ 处理者 = 上一持有者失联，本次为崩溃/失联恢复
    const [recovered] = await this.db
      .update(generationJobs)
      .set({ attempts: sql`${generationJobs.attempts} + 1` })
      .where(
        and(
          eq(generationJobs.id, jobId),
          eq(generationJobs.status, 'running'),
          eq(generationJobs.attempts, row.attempts),
        ),
      )
      .returning();
    if (!recovered) return null;
    await this.markRunRunning(recovered.runId);
    return { job: recovered, viaRecovery: true };
  }

  /** 首个抢占成功的 Job 把 Run 收敛为 running（条件更新，天然幂等无并发问题）——S2.1 P1 */
  private async markRunRunning(runId: string): Promise<void> {
    await this.db
      .update(generationRuns)
      .set({ status: 'running' })
      .where(and(eq(generationRuns.id, runId), eq(generationRuns.status, 'queued')));
  }

  /** 执行已抢占的 Job；抛出 ProviderError（含 kind）或普通错误由调用方决定重试/终态 */
  async execute(job: JobRow): Promise<void> {
    const params = job.inputParams as unknown as JobInputParams;
    const provider = getImageProvider();

    const result =
      job.endpoint === 'edits'
        ? await provider.edit({
            prompt: params.prompt,
            images: await this.loadSlots(params.slots),
            size: params.size,
            quality: params.quality,
            inputFidelity: params.inputFidelity,
          })
        : await provider.generate({
            prompt: params.prompt,
            size: params.size,
            quality: params.quality,
          });

    // 引擎 URL 有时效：立即取二进制并转存（DB 永不存临时 URL）；下载带退避重试
    const item = result.images[0];
    const buf = item.b64 ? Buffer.from(item.b64, 'base64') : await this.downloadWithRetry(item.url!);
    const ext = sniffImage(buf);
    if (!ext)
      throw new ProviderError(
        '引擎返回内容不是有效图片（魔数校验失败）',
        'retryable',
        undefined,
        undefined,
        'JOB_RESULT_INVALID',
      );
    const key = objectKey(
      job.projectId ?? 'unassigned',
      job.runId,
      job.id,
      ext === 'jpeg' ? 'jpg' : ext,
    );
    let stored: { key: string; url: string };
    try {
      stored = await this.storage.save(key, buf);
    } catch (err) {
      // 存储层异常（对象存储不可达/写失败）：retryable，脱敏为 JOB_STORAGE_ERROR
      throw new ProviderError(
        `结果保存失败：${String(err)}`,
        'retryable',
        undefined,
        undefined,
        'JOB_STORAGE_ERROR',
      );
    }

    const pointsCost = POINTS_PER_IMAGE[params.quality];
    const assetId = `asset_${randomUUID()}`;
    await this.db.transaction(async (tx) => {
      // 终态 CAS：只有仍处 running 的行才能翻 succeeded（防重复投递双写资产）
      const done = await tx
        .update(generationJobs)
        .set({ status: 'succeeded', resultUrl: stored.url, pointsCost, finishedAt: new Date() })
        .where(and(eq(generationJobs.id, job.id), eq(generationJobs.status, 'running')))
        .returning({ id: generationJobs.id });
      if (done.length === 0) return; // 已被他方终态化：放弃本次写入（文件为孤儿，S3 巡检回收）
      await tx.insert(assets).values({
        id: assetId,
        tenantId: TENANT,
        projectId: job.projectId,
        type: 'result',
        url: stored.url,
        name: `${job.mode}-${job.id.slice(4, 12)}`,
        genParams: { ...params, mode: job.mode, templateId: job.templateId, runId: job.runId },
        sourceJobId: job.id,
        meta: { storageKey: key, bytes: buf.length },
      });
      await tx.insert(usageEvents).values({
        id: `ue_${randomUUID()}`,
        tenantId: TENANT,
        runId: job.runId,
        jobId: job.id,
        operation: job.endpoint === 'edits' ? 'edit' : 'generate',
        provider: provider.name,
        model: result.model,
        quantity: 1,
        providerUsage: result.usage as Record<string, unknown> | undefined,
        status: 'succeeded',
      });
      // S1：hold 已在入队事务扣减，此处只记 settle 确认凭证（amount=0）
      await this.credits.settle(tx as unknown as Db, TENANT, job.runId, job.id, pointsCost);
    });
    this.log.log(`job ${job.id} succeeded (${pointsCost} pts, ${buf.length} bytes)`);
  }

  /**
   * 失败终态 + refund 同事务：终态 CAS 幂等（重复调用不重复退款）。
   * S4：错误码由 classifyJobError 推导（显式 code 优先），对外只出 code + 目录文案；
   * message 原文仅落 DB error 列供内部排障，绝不进 API 响应。
   */
  async failJobWithRefund(
    job: JobRow,
    message: string,
    kind: string,
    providerName?: string,
    providerModel?: string,
    signal?: { explicitCode?: JobErrorCode; httpStatus?: number },
  ): Promise<void> {
    const params = job.inputParams as unknown as JobInputParams;
    const refundAmount = POINTS_PER_IMAGE[params.quality] ?? 0;
    const errorCode = classifyJobError({
      explicitCode: signal?.explicitCode,
      kind: kind as JobErrorKind,
      httpStatus: signal?.httpStatus,
    });
    await this.db.transaction(async (tx) => {
      const updated = await tx
        .update(generationJobs)
        .set({
          status: 'failed',
          error: message.slice(0, 1000),
          errorKind: kind,
          errorCode,
          finishedAt: new Date(),
        })
        .where(
          and(eq(generationJobs.id, job.id), inArray(generationJobs.status, ['queued', 'running'])),
        )
        .returning({ id: generationJobs.id });
      if (updated.length === 0) return; // 已终态：幂等跳过（不重复 refund）
      await this.credits.refund(tx as unknown as Db, TENANT, job.runId, job.id, refundAmount);
      await tx.insert(usageEvents).values({
        id: `ue_${randomUUID()}`,
        tenantId: TENANT,
        runId: job.runId,
        jobId: job.id,
        operation: job.endpoint === 'edits' ? 'edit' : 'generate',
        provider: providerName ?? 'muskapis',
        model: providerModel ?? 'gpt-image-2',
        quantity: 1,
        status: 'failed',
      });
    });
  }

  /** 重试让位：running → queued（本次尝试失败、等待下一次重试认领） */
  async releaseForRetry(jobId: string): Promise<void> {
    await this.db
      .update(generationJobs)
      .set({ status: 'queued' })
      .where(and(eq(generationJobs.id, jobId), eq(generationJobs.status, 'running')));
  }

  /** Run 状态聚合：全成→succeeded；全败→failed；混合→partial */
  async aggregateRun(runId: string): Promise<void> {
    const jobs = await this.db
      .select({ status: generationJobs.status })
      .from(generationJobs)
      .where(eq(generationJobs.runId, runId));
    if (jobs.some((j) => j.status === 'queued' || j.status === 'running')) return;
    const ok = jobs.filter((j) => j.status === 'succeeded').length;
    const status = ok === jobs.length ? 'succeeded' : ok === 0 ? 'failed' : 'partial';
    await this.db
      .update(generationRuns)
      .set({ status, finishedAt: new Date() })
      .where(eq(generationRuns.id, runId));
  }

  /** 结果 URL 下载：4 次尝试，3s/6s/9s 退避（供应商文档生产建议） */
  private async downloadWithRetry(url: string): Promise<Buffer> {
    let lastErr: unknown;
    for (let i = 1; i <= 4; i++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        if (!res.ok) throw new Error(`download http ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
      } catch (err) {
        lastErr = err;
        if (i < 4) await new Promise((s) => setTimeout(s, i * 3000));
      }
    }
    throw new ProviderError(
      `结果图片下载失败：${String(lastErr)}`,
      'retryable',
      undefined,
      undefined,
      'JOB_RESULT_INVALID',
    );
  }

  /** i2i/template：槽位资产 → 本地二进制（经 StorageAdapter，不直接碰路径） */
  private async loadSlots(
    slotAssetIds: string[],
  ): Promise<Array<{ data: Uint8Array; filename: string; contentType?: string }>> {
    const rows = await this.db.query.assets.findMany({ where: inArray(assets.id, slotAssetIds) });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return Promise.all(
      slotAssetIds.map(async (id) => {
        const row = byId.get(id);
        const key = (row?.meta as { storageKey?: string } | null)?.storageKey;
        if (!row || !key)
          throw new ProviderError(
            `槽位资产不存在或无存储键：${id}`,
            'non_retryable',
            undefined,
            undefined,
            'JOB_INPUT_INVALID',
          );
        return {
          data: await this.storage.read(key),
          filename: `${id}.png`,
          contentType: 'image/png',
        };
      }),
    );
  }
}
