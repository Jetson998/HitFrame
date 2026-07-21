import { Inject, Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import { and, eq, lt } from 'drizzle-orm';
import { DB, Db } from '../db/db.module';
import { generationJobs } from '../db/schema';
import {
  executionMode,
  GENERATION_QUEUE,
  GenerationJobData,
  logEvent,
  MAX_ATTEMPTS,
  redisConnection,
} from './queue.constants';

const RECONCILE_INTERVAL_MS = 30_000;
const PENDING_GRACE_MS = 5_000; // 刚提交的行留给 Dispatcher 即时投递的窗口

/**
 * Dispatcher + Reconciler（EXECUTION_MODE=queue 时启用）：
 * - dispatchRun：入队事务提交后即时 queue.add（jobId=GenerationJob.id 天然去重），
 *   成功回写 enqueueState=enqueued；
 * - Reconciler：周期扫描「pending + queued 且超过宽限期」的行补投（双写间隙收口，
 *   覆盖“PG 已提交、queue.add 前崩溃”的场景）。
 */
@Injectable()
export class QueueDispatcherService implements OnApplicationShutdown {
  private readonly log = new Logger('Dispatcher');
  private queue: Queue<GenerationJobData> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(@Inject(DB) private readonly db: Db) {
    if (executionMode() === 'queue') {
      this.queue = new Queue<GenerationJobData>(GENERATION_QUEUE, {
        connection: redisConnection(),
        defaultJobOptions: {
          attempts: MAX_ATTEMPTS,
          backoff: { type: 'exponential', delay: 5_000 }, // 5s/10s/20s
          removeOnComplete: { count: 1000 },
          removeOnFail: false, // 失败留在 failed 集合 = 死信可手工重放
        },
      });
      this.timer = setInterval(() => void this.reconcile(), RECONCILE_INTERVAL_MS);
      this.log.log('queue mode: dispatcher + reconciler active');
    }
  }

  get enabled(): boolean {
    return this.queue !== null;
  }

  /** 入队事务提交后调用：即时投递该 Run 的全部 queued Job */
  async dispatchRun(runId: string): Promise<void> {
    if (!this.queue) return;
    const jobs = await this.db.query.generationJobs.findMany({
      where: and(eq(generationJobs.runId, runId), eq(generationJobs.status, 'queued')),
    });
    for (const job of jobs) await this.dispatchOne(job.id, runId);
  }

  private async dispatchOne(jobId: string, runId: string): Promise<void> {
    if (!this.queue) return;
    try {
      // BullMQ jobId = GenerationJob.id：重复 add 幂等（已存在即忽略）
      await this.queue.add('generate', { jobId, runId }, { jobId });
      await this.db
        .update(generationJobs)
        .set({ enqueueState: 'enqueued', queueJobId: jobId })
        .where(eq(generationJobs.id, jobId));
      logEvent('enqueue', { jobId, runId });
    } catch (err) {
      // 投递失败留在 pending，Reconciler 下轮补投
      this.log.warn(`dispatch ${jobId} failed (reconciler will retry): ${String(err)}`);
    }
  }

  /** Reconciler：补投「已提交未入队」（含 API 在 add 前崩溃后的重启场景） */
  async reconcile(): Promise<number> {
    if (!this.queue) return 0;
    const stale = await this.db.query.generationJobs.findMany({
      where: and(
        eq(generationJobs.status, 'queued'),
        eq(generationJobs.enqueueState, 'pending'),
        lt(generationJobs.createdAt, new Date(Date.now() - PENDING_GRACE_MS)),
      ),
      limit: 100,
    });
    for (const job of stale) {
      this.log.log(`reconciler: redispatch ${job.id}`);
      await this.dispatchOne(job.id, job.runId);
    }
    return stale.length;
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.queue?.close();
  }
}
