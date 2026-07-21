import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DB, Db } from '../db/db.module';
import { generationJobs, generationRuns } from '../db/schema';
import { JobRunnerService } from './job-runner.service';
import { ProviderError } from '@hitframe/image-provider';
import { executionMode } from '../queue/queue.constants';

/** running 超过此时限视为孤儿（fetch 层 300s 超时 + 下载重试，留足余量） */
export const ORPHAN_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * 全局并发信号量（2026-07-20 拍板）：inline 执行器对引擎的并发闸门，
 * 默认 2，EXECUTOR_CONCURRENCY 可调；queue 模式下由 Worker concurrency 取代。
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
 * inline 执行器（ADR-9 遗留，EXECUTION_MODE=inline 时启用）：
 * S2 起默认退役，仅作队列内核的互斥回滚开关；执行核心已抽到 JobRunnerService。
 * 与 queue 模式互斥：queue 模式下本类不派发、不清孤儿（Worker/Reconciler 接管）。
 */
@Injectable()
export class ExecutorService implements OnApplicationBootstrap {
  private readonly log = new Logger('Executor');
  private readonly inline = executionMode() === 'inline';

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly runner: JobRunnerService,
  ) {}

  /**
   * 启动收敛（仅 inline 模式）：
   * - running → 进程内执行器不可恢复中断 → failed + refund；
   * - queued → 补投重新执行（outbox 语义）。
   */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.inline) {
      this.log.log('queue mode: inline executor idle（回滚开关 EXECUTION_MODE=inline）');
      return;
    }
    const interrupted = await this.db.query.generationJobs.findMany({
      where: inArray(generationJobs.status, ['running']),
    });
    for (const job of interrupted) {
      await this.runner.failJobWithRefund(job, 'orphaned: process restarted', 'retryable', undefined, undefined, {
        explicitCode: 'JOB_INTERRUPTED',
      });
    }
    if (interrupted.length > 0) {
      const runIds = [...new Set(interrupted.map((o) => o.runId))];
      for (const runId of runIds) await this.runner.aggregateRun(runId);
      this.log.warn(`orphan sweep: ${interrupted.length} running job(s) → failed+refund`);
    }

    const queued = await this.db
      .selectDistinct({ runId: generationJobs.runId })
      .from(generationJobs)
      .where(eq(generationJobs.status, 'queued'));
    for (const { runId } of queued) {
      this.log.log(`inline reconciler: redispatch run ${runId}`);
      void this.execute(runId);
    }
  }

  async execute(runId: string): Promise<void> {
    if (!this.inline) return; // 互斥：queue 模式下禁止 inline 消费
    try {
      // inline 模式下派发即视为入队（占位语义，与 queue 模式共用 outbox 列）
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
      await this.runner.aggregateRun(runId);
    } catch (err) {
      this.log.error(`run ${runId} executor crashed: ${String(err)}`);
      await this.runner.aggregateRun(runId).catch(() => undefined);
    }
  }

  private async runJob(job: typeof generationJobs.$inferSelect): Promise<void> {
    await engineGate.acquire();
    try {
      // CAS 原子抢占（S2 P1）：抢不到（0 行）直接退出，杜绝双调引擎/双产资产
      const claimed = await this.runner.claim(job.id, false);
      if (!claimed) return;
      try {
        await this.runner.execute(claimed);
      } catch (err) {
        // inline 模式无重试（M1 语义）：一次失败即终态 + refund
        const kind = err instanceof ProviderError ? err.kind : 'non_retryable';
        const message = err instanceof Error ? err.message : String(err);
        const pe = err instanceof ProviderError ? err : undefined;
        await this.runner.failJobWithRefund(claimed, message, kind, undefined, undefined, {
          explicitCode: pe?.errorCode,
          httpStatus: pe?.httpStatus,
        });
        this.log.warn(`job ${job.id} failed (${kind}): ${message.slice(0, 200)}`);
      }
    } finally {
      engineGate.release();
    }
  }
}
