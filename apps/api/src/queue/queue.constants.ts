import type { ConnectionOptions } from 'bullmq';

// BullMQ 用 : 作 Redis key 前缀分隔，队列名不得含 :（改用 -）
export const GENERATION_QUEUE = 'hitframe-generation';
export const MAX_ATTEMPTS = 3; // S0 状态机：retryable 最多 3 次

/** 执行内核选择（S2 互斥回滚开关）：不允许两个内核同时消费 */
export type ExecutionMode = 'inline' | 'queue';
export function executionMode(): ExecutionMode {
  return (process.env.EXECUTION_MODE ?? 'inline') === 'queue' ? 'queue' : 'inline';
}

/** Valkey 连接（BullMQ 要求 maxRetriesPerRequest=null） */
export function redisConnection(): ConnectionOptions {
  return {
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? 6379),
    maxRetriesPerRequest: null,
  };
}

/** BullMQ payload 极简：只带 jobId，业务状态一律回 DB 查（DB 是唯一状态源） */
export interface GenerationJobData {
  jobId: string;
  runId: string;
}
