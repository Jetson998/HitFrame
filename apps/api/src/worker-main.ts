import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { UnrecoverableError, Worker } from 'bullmq';
import { ProviderError } from '@hitframe/image-provider';
import { getImageProvider } from './provider.factory';
import { WorkerModule } from './worker.module';
import { JobRunnerService } from './generations/job-runner.service';
import { GenerationLogsService } from './generations/generation-logs.service';
import {
  GENERATION_QUEUE,
  GenerationJobData,
  logEvent,
  MAX_ATTEMPTS,
  redisConnection,
} from './queue/queue.constants';

/**
 * 独立 Worker 进程（M2a S2，取代 ADR-9 进程内执行器）：
 *   node apps/api/dist/worker-main.js   （仓库根目录启动，读根 .env）
 * - CAS 抢占后才调 Provider（重复投递/双 Worker 同抢只有一个执行）；
 * - retryable 按 BullMQ 退避重试（≤3 次），non_retryable/moderation 一次即终态；
 * - 最终失败 failJobWithRefund（幂等，只退一次）；
 * - SIGTERM/SIGINT 优雅停机：等待在执行的 Job 完成后退出。
 */
async function bootstrap() {
  const log = new Logger('Worker');
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const runner = app.get(JobRunnerService);
  const logs = app.get(GenerationLogsService);
  const provider = getImageProvider();
  const concurrency = Math.max(1, Number(process.env.WORKER_CONCURRENCY ?? 2) || 2);

  const worker = new Worker<GenerationJobData>(
    GENERATION_QUEUE,
    async (job) => {
      const { jobId, runId } = job.data;
      // BullMQ 锁保证同一时刻仅本 Worker 持有该 job → DB 若仍是 running，
      // 必为失联持有者残留（stalled 重投/崩溃恢复），允许 CAS 恢复认领
      const result = await runner.claim(jobId, true);
      if (!result) {
        log.log(`skip ${jobId}: 未抢占到（已终态或他方持有）`);
        return;
      }
      const claimed = result.job;
      const attemptNo = claimed.attempts;
      // viaRecovery = DB 仍 running 的失联持有者残留被本 Worker 恢复认领
      logEvent(result.viaRecovery ? 'recovered' : 'claim', { jobId, runId, attempts: attemptNo });
      try {
        await runner.execute(claimed);
        await runner.aggregateRun(runId);
        logEvent('succeeded', { jobId, runId, attempts: attemptNo });
      } catch (err) {
        const kind = err instanceof ProviderError ? err.kind : 'non_retryable';
        const message = err instanceof Error ? err.message : String(err);
        const pe = err instanceof ProviderError ? err : undefined;
        const isLastAttempt = attemptNo >= (job.opts.attempts ?? MAX_ATTEMPTS);
        if (kind === 'retryable' && !isLastAttempt) {
          // 让位下一次重试认领：running → queued，再抛错触发 BullMQ 退避
          await runner.releaseForRetry(jobId);
          await logs.record({
            event: 'retry',
            tenantId: claimed.tenantId,
            actorId: claimed.actorId ?? undefined,
            runId,
            jobId,
            status: 'retrying',
            mode: claimed.mode,
            templateId: claimed.templateId ?? undefined,
            endpoint: claimed.endpoint,
            attemptNo: attemptNo,
            provider: provider.name,
            model: provider.model,
            userPrompt: (claimed.inputParams as { userPrompt?: string }).userPrompt,
            compiledPrompt: (claimed.inputParams as { prompt?: string }).prompt,
            inputParams: claimed.inputParams,
            requestId: (claimed.inputParams as { requestId?: string }).requestId,
            providerRequestId: pe?.responseMeta?.relayRequestId,
            relayRequestId: pe?.responseMeta?.relayRequestId,
            providerTraceId: pe?.responseMeta?.providerTraceId,
            providerHttpStatus: pe?.responseMeta?.httpStatus ?? pe?.httpStatus,
            errorKind: kind,
            errorCode: pe?.errorCode,
            errorMessage: message,
            metadata: pe?.responseMeta
              ? { outcome: 'response_error', relayCode: pe.responseMeta.relayCode }
              : { outcome: 'transport_error' },
          });
          logEvent('retry', { jobId, runId, attempts: attemptNo, errorKind: kind });
          log.warn(
            `job ${jobId} attempt ${attemptNo} failed (retryable): ${message.slice(0, 160)}`,
          );
          throw err;
        }
        const finalCode = await runner.failJobWithRefund(claimed, message, kind, undefined, undefined, {
          explicitCode: pe?.errorCode,
          httpStatus: pe?.httpStatus,
        });
        await runner.aggregateRun(runId);
        // retryable 耗尽 = 落死信（removeOnFail=false，留 failed 集合可重放）
        logEvent(kind === 'retryable' ? 'dead_letter' : 'failed', {
          jobId,
          runId,
          attempts: attemptNo,
          errorKind: kind,
          errorCode: finalCode, // P2 修复：内部抛错推导码也进观测事件
        });
        log.warn(`job ${jobId} failed terminally (${kind}): ${message.slice(0, 160)}`);
        // non_retryable/moderation 立即终止重试；retryable 耗尽本身已是最后一次
        throw kind === 'retryable' ? err : new UnrecoverableError(message.slice(0, 300));
      }
    },
    { connection: redisConnection(), concurrency },
  );

  worker.on('ready', () => log.log(`worker ready (concurrency=${concurrency})`));
  worker.on('error', (err) => log.error(`worker error: ${String(err)}`));
  // stalled 超限（maxStalledCount）由 BullMQ 直接判失败、不进 processor：
  // 兜底把 DB 收敛为 failed + refund，避免行悬在 running 等 10 分钟孤儿超时
  worker.on('failed', (job, err) => {
    if (!job || !/stalled/i.test(err.message)) return;
    void (async () => {
      const result = await runner.claim(job.data.jobId, true);
      if (!result) return;
      await runner.failJobWithRefund(result.job, `stalled: ${err.message}`, 'retryable', undefined, undefined, {
        explicitCode: 'JOB_INTERRUPTED',
      });
      await runner.aggregateRun(job.data.runId);
      log.warn(`job ${job.data.jobId} stalled beyond limit → failed+refund`);
    })();
  });

  const shutdown = async (signal: string) => {
    log.log(`${signal} received: 优雅停机（等待在执行 Job 完成）`);
    await worker.close();
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void bootstrap();
