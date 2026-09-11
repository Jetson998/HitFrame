import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, lt } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DB, Db } from '../db/db.module';
import { generationLogs } from '../db/schema';

export type GenerationLogEvent =
  | 'accepted'
  | 'enqueued'
  | 'enqueue_failed'
  | 'claimed'
  | 'provider_started'
  | 'provider_response'
  | 'provider_failed'
  | 'retry'
  | 'succeeded'
  | 'failed';

export interface GenerationLogInput {
  event: GenerationLogEvent;
  tenantId?: string;
  actorId?: string;
  runId?: string;
  jobId?: string;
  requestId?: string;
  status?: string;
  mode?: string;
  templateId?: string;
  endpoint?: string;
  attemptNo?: number;
  provider?: string;
  model?: string;
  userPrompt?: string;
  compiledPrompt?: string;
  inputParams?: unknown;
  resultAssetId?: string;
  resultUrl?: string;
  resultBytes?: number;
  providerUsage?: unknown;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  providerRequestId?: string;
  relayRequestId?: string;
  providerTraceId?: string;
  providerHttpStatus?: number;
  errorKind?: string;
  errorCode?: string;
  errorMessage?: string;
  requestIp?: string;
  channelId?: string;
  groupId?: string;
  rateMultiplier?: string | number;
  priceVersion?: string;
  estimatedCost?: string | number;
  currency?: string;
  pointsCost?: number;
  startedAt?: Date;
  finishedAt?: Date;
  durationMs?: number;
  providerDurationMs?: number;
  metadata?: unknown;
}

export interface GenerationLogQuery {
  runId?: string;
  jobId?: string;
  requestId?: string;
  relayRequestId?: string;
  providerTraceId?: string;
  event?: GenerationLogEvent;
  before?: Date;
  limit?: number;
}

/**
 * 生成调用日志：独立于业务状态机的 best-effort 追加写入。
 * 日志故障不能让用户的生成请求失败，所以 record() 会吞掉写入异常并记录进程日志。
 */
@Injectable()
export class GenerationLogsService {
  private readonly log = new Logger('GenerationLogs');

  constructor(@Inject(DB) private readonly db: Db) {}

  async record(input: GenerationLogInput): Promise<void> {
    try {
      await this.db.insert(generationLogs).values({
        id: `glog_${randomUUID()}`,
        tenantId: input.tenantId ?? 'default',
        actorId: input.actorId,
        runId: input.runId,
        jobId: input.jobId,
        requestId: input.requestId,
        event: input.event,
        status: input.status,
        mode: input.mode,
        templateId: input.templateId,
        endpoint: input.endpoint,
        attemptNo: input.attemptNo,
        provider: input.provider,
        model: input.model,
        userPrompt: input.userPrompt,
        compiledPrompt: input.compiledPrompt,
        inputParams: input.inputParams,
        resultAssetId: input.resultAssetId,
        resultUrl: input.resultUrl,
        resultBytes: input.resultBytes,
        providerUsage: input.providerUsage,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        cacheReadTokens: input.cacheReadTokens,
        cacheWriteTokens: input.cacheWriteTokens,
        providerRequestId: input.providerRequestId,
        relayRequestId: input.relayRequestId,
        providerTraceId: input.providerTraceId,
        providerHttpStatus: input.providerHttpStatus,
        errorKind: input.errorKind,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage?.slice(0, 2000),
        requestIp: input.requestIp,
        channelId: input.channelId,
        groupId: input.groupId,
        rateMultiplier: input.rateMultiplier?.toString(),
        priceVersion: input.priceVersion,
        estimatedCost: input.estimatedCost?.toString(),
        currency: input.currency,
        pointsCost: input.pointsCost,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        durationMs: input.durationMs,
        providerDurationMs: input.providerDurationMs,
        metadata: input.metadata,
      });
    } catch (err) {
      this.log.error(
        `persist generation log failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async list(query: GenerationLogQuery = {}) {
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
    const conditions = [];
    if (query.runId) conditions.push(eq(generationLogs.runId, query.runId));
    if (query.jobId) conditions.push(eq(generationLogs.jobId, query.jobId));
    if (query.requestId) conditions.push(eq(generationLogs.requestId, query.requestId));
    if (query.relayRequestId)
      conditions.push(eq(generationLogs.relayRequestId, query.relayRequestId));
    if (query.providerTraceId)
      conditions.push(eq(generationLogs.providerTraceId, query.providerTraceId));
    if (query.event) conditions.push(eq(generationLogs.event, query.event));
    if (query.before) conditions.push(lt(generationLogs.createdAt, query.before));

    const rows = await this.db
      .select()
      .from(generationLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(generationLogs.createdAt))
      .limit(limit);

    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      startedAt: row.startedAt?.toISOString(),
      finishedAt: row.finishedAt?.toISOString(),
    }));
  }
}
