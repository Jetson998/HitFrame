import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { objectKey, POINTS_PER_IMAGE, Quality } from '@hitframe/shared';
import { ProviderError } from '@hitframe/image-provider';
import { DB, Db } from '../db/db.module';
import { assets, generationJobs, generationRuns, tenants, usageEvents } from '../db/schema';
import { StorageService } from '../storage/storage.service';
import { getImageProvider } from '../provider.factory';

const TENANT = 'default';
/** running 超过此时限视为孤儿（引擎单张实测 ~66s，fetch 层 180s 超时兜底） */
export const ORPHAN_TIMEOUT_MS = 10 * 60 * 1000;

interface JobInputParams {
  prompt: string;
  size: string;
  quality: Quality;
  slots: string[];
  inputFidelity?: 'high';
}

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
  ) {}

  /** 启动孤儿清理：上次进程留下的 queued/running 全部收敛为 failed（失败不扣点） */
  async onApplicationBootstrap(): Promise<void> {
    const orphans = await this.db
      .update(generationJobs)
      .set({ status: 'failed', error: 'orphaned: process restarted', errorKind: 'non_retryable' })
      .where(inArray(generationJobs.status, ['queued', 'running']))
      .returning({ runId: generationJobs.runId });
    if (orphans.length > 0) {
      const runIds = [...new Set(orphans.map((o) => o.runId))];
      for (const runId of runIds) await this.aggregateRun(runId);
      this.log.warn(`orphan sweep: ${orphans.length} job(s) in ${runIds.length} run(s) → failed`);
    }
  }

  async execute(runId: string): Promise<void> {
    try {
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
    const params = job.inputParams as unknown as JobInputParams;
    const provider = getImageProvider();
    await this.db
      .update(generationJobs)
      .set({ status: 'running' })
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

      // 引擎 URL 有时效：立即取二进制并转存（DB 永不存临时 URL）
      const item = result.images[0];
      const buf = item.b64
        ? Buffer.from(item.b64, 'base64')
        : Buffer.from(
            await (await fetch(item.url!, { signal: AbortSignal.timeout(60_000) })).arrayBuffer(),
          );
      const key = objectKey(job.projectId ?? 'unassigned', job.runId, job.id, 'png');
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
        // M1 简单扣减（成功才扣）；M2a 起换预扣/结算 + CreditTransaction 流水
        await tx
          .update(tenants)
          .set({ pointsBalance: sql`${tenants.pointsBalance} - ${pointsCost}` })
          .where(eq(tenants.id, TENANT));
      });
      this.log.log(`job ${job.id} succeeded (${pointsCost} pts, ${buf.length} bytes)`);
    } catch (err) {
      const kind = err instanceof ProviderError ? err.kind : 'non_retryable';
      const message = err instanceof Error ? err.message : String(err);
      await this.db.transaction(async (tx) => {
        await tx
          .update(generationJobs)
          .set({
            status: 'failed',
            error: message.slice(0, 1000),
            errorKind: kind,
            finishedAt: new Date(),
          })
          .where(eq(generationJobs.id, job.id));
        await tx.insert(usageEvents).values({
          id: `ue_${randomUUID()}`,
          tenantId: TENANT,
          runId: job.runId,
          jobId: job.id,
          operation: job.endpoint === 'edits' ? 'edit' : 'generate',
          provider: provider.name,
          model: provider.model,
          quantity: 1,
          status: 'failed',
        });
      });
      this.log.warn(`job ${job.id} failed (${kind}): ${message.slice(0, 200)}`);
    }
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
