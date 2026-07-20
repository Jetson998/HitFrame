import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { objectKey, POINTS_PER_IMAGE, Quality } from '@hitframe/shared';
import { ProviderError } from '@hitframe/image-provider';
import { DB, Db } from '../db/db.module';
import { assets, generationJobs, generationRuns, usageEvents } from '../db/schema';
import { StorageService } from '../storage/storage.service';
import { CreditsService } from '../credits/credits.service';
import { getImageProvider } from '../provider.factory';

const TENANT = 'default';
/** running 超过此时限视为孤儿（fetch 层 300s 超时 + 下载重试，留足余量） */
export const ORPHAN_TIMEOUT_MS = 10 * 60 * 1000;

/** 图片魔数校验（供应商文档：获取结果 → 校验 → 转存自有存储） */
function sniffImage(buf: Buffer): 'png' | 'jpeg' | 'webp' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP')
    return 'webp';
  return null;
}

interface JobInputParams {
  prompt: string;
  size: string;
  quality: Quality;
  slots: string[];
  inputFidelity?: 'high';
}

/**
 * 全局并发信号量（2026-07-20 拍板）：进程内执行器对引擎的并发闸门，
 * 默认 2（种子配置基线 Worker 并发 2–4 的下限），EXECUTOR_CONCURRENCY 可调。
 * S2 迁移 BullMQ 后由 Worker concurrency 配置取代。
 */
class Semaphore {
  private inFlight = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async acquire(): Promise<void> {
    if (this.inFlight < this.limit) {
      this.inFlight++;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.inFlight++;
  }

  release(): void {
    this.inFlight--;
    this.waiters.shift()?.();
  }
}

const EXECUTOR_CONCURRENCY = Math.max(1, Number(process.env.EXECUTOR_CONCURRENCY ?? 2) || 2);
const engineGate = new Semaphore(EXECUTOR_CONCURRENCY);

/**
 * M1 进程内非持久执行器（ADR-9）。
 * 接受的限制：进程重启时运行中任务失败，不自动恢复；由启动孤儿清理兜底。
 * M2a 将本类替换为 BullMQ Worker，API 契约不变。
 */
@Injectable()
export class ExecutorService implements OnApplicationBootstrap {
  private readonly log = new Logger('Executor');

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly storage: StorageService,
    private readonly credits: CreditsService,
  ) {}

  /**
   * 启动收敛（S1 起按 outbox 语义分流）：
   * - running → 进程内执行器不可恢复中断（ADR-9）→ failed + refund；
   * - queued（含 enqueueState=pending 的「已提交未派发」）→ 补投重新执行。
   */
  async onApplicationBootstrap(): Promise<void> {
    const interrupted = await this.db.query.generationJobs.findMany({
      where: inArray(generationJobs.status, ['running']),
    });
    for (const job of interrupted) {
      await this.failJobWithRefund(job, 'orphaned: process restarted', 'retryable');
    }
    if (interrupted.length > 0) {
      const runIds = [...new Set(interrupted.map((o) => o.runId))];
      for (const runId of runIds) await this.aggregateRun(runId);
      this.log.warn(`orphan sweep: ${interrupted.length} running job(s) → failed+refund`);
    }

    const queued = await this.db
      .selectDistinct({ runId: generationJobs.runId })
      .from(generationJobs)
      .where(eq(generationJobs.status, 'queued'));
    for (const { runId } of queued) {
      this.log.log(`reconciler: redispatch run ${runId}`);
      void this.execute(runId);
    }
  }

  async execute(runId: string): Promise<void> {
    try {
      // outbox 流转：派发即标记 enqueued（S2 起由 BullMQ add 成功后回写，jobId=job.id）
      await this.db
        .update(generationJobs)
        .set({ enqueueState: 'enqueued', queueJobId: sql`${generationJobs.id}` })
        .where(and(eq(generationJobs.runId, runId), eq(generationJobs.status, 'queued')));
      await this.db
        .update(generationRuns)
        .set({ status: 'running' })
        .where(eq(generationRuns.id, runId));
      const jobs = await this.db.query.generationJobs.findMany({
        where: and(eq(generationJobs.runId, runId), eq(generationJobs.status, 'queued')),
      });
      await Promise.allSettled(jobs.map((job) => this.runJob(job)));
      await this.aggregateRun(runId);
    } catch (err) {
      this.log.error(`run ${runId} executor crashed: ${String(err)}`);
      await this.aggregateRun(runId).catch(() => undefined);
    }
  }

  private async runJob(job: typeof generationJobs.$inferSelect): Promise<void> {
    // 幂等（S0 §4 第 4 条）：执行前查 DB 终态，重复派发直接跳过
    const fresh = await this.db.query.generationJobs.findFirst({
      where: eq(generationJobs.id, job.id),
    });
    if (!fresh || fresh.status === 'succeeded' || fresh.status === 'failed') return;

    // 全局并发闸门：同一时刻最多 EXECUTOR_CONCURRENCY 个 Job 触达引擎
    await engineGate.acquire();
    try {
      await this.runJobInner(job);
    } finally {
      engineGate.release();
    }
  }

  private async runJobInner(job: typeof generationJobs.$inferSelect): Promise<void> {
    const params = job.inputParams as unknown as JobInputParams;
    const provider = getImageProvider();
    await this.db
      .update(generationJobs)
      .set({ status: 'running', attempts: sql`${generationJobs.attempts} + 1` })
      .where(eq(generationJobs.id, job.id));
    try {
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

      // 引擎 URL 有时效：立即取二进制并转存（DB 永不存临时 URL）；下载带退避重试（供应商文档建议）
      const item = result.images[0];
      const buf = item.b64
        ? Buffer.from(item.b64, 'base64')
        : await this.downloadWithRetry(item.url!);
      const ext = sniffImage(buf);
      if (!ext) {
        throw new ProviderError('引擎返回内容不是有效图片（魔数校验失败）', 'retryable');
      }
      const key = objectKey(job.projectId ?? 'unassigned', job.runId, job.id, ext === 'jpeg' ? 'jpg' : ext);
      const stored = await this.storage.save(key, buf);

      const pointsCost = POINTS_PER_IMAGE[params.quality];
      const assetId = `asset_${randomUUID()}`;
      await this.db.transaction(async (tx) => {
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
        await tx
          .update(generationJobs)
          .set({ status: 'succeeded', resultUrl: stored.url, pointsCost, finishedAt: new Date() })
          .where(eq(generationJobs.id, job.id));
        // S1：hold 已在入队事务扣减，此处只记 settle 确认凭证（amount=0）
        await this.credits.settle(tx as unknown as Db, TENANT, job.runId, job.id, pointsCost);
      });
      this.log.log(`job ${job.id} succeeded (${pointsCost} pts, ${buf.length} bytes)`);
    } catch (err) {
      const kind = err instanceof ProviderError ? err.kind : 'non_retryable';
      const message = err instanceof Error ? err.message : String(err);
      await this.failJobWithRefund(job, message, kind, provider.name, provider.model);
      this.log.warn(`job ${job.id} failed (${kind}): ${message.slice(0, 200)}`);
    }
  }

  /** 失败终态 + refund 同事务（S1）：hold 已扣，失败按单 Job 点数退还 */
  async failJobWithRefund(
    job: typeof generationJobs.$inferSelect,
    message: string,
    kind: string,
    providerName?: string,
    providerModel?: string,
  ): Promise<void> {
    const params = job.inputParams as unknown as JobInputParams;
    const refundAmount = POINTS_PER_IMAGE[params.quality] ?? 0;
    await this.db.transaction(async (tx) => {
      const updated = await tx
        .update(generationJobs)
        .set({
          status: 'failed',
          error: message.slice(0, 1000),
          errorKind: kind,
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
    throw new ProviderError(`结果图片下载失败：${String(lastErr)}`, 'retryable');
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
          throw new ProviderError(`槽位资产不存在或无存储键：${id}`, 'non_retryable');
        return {
          data: await this.storage.read(key),
          filename: `${id}.png`,
          contentType: 'image/png',
        };
      }),
    );
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
}
