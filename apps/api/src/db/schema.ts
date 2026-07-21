import {
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  integer,
} from 'drizzle-orm/pg-core';

/**
 * M1 数据模型（技术方案 v3.0.2 §五 的 M1 子集）。
 * 单租户：tenantId 统一默认 'default'，M3 多租户时收紧。
 * 表由阶段 3 正式建库迁移（drizzle-kit generate/migrate）；此文件为唯一 schema 来源。
 */

const tenantId = () => text('tenant_id').notNull().default('default');

/** M1 单租户：一行 'default'。简单扣点走 pointsBalance 同事务扣减；M2a 起配 CreditTransaction 流水 */
export const tenants = pgTable('tenants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  pointsBalance: integer('points_balance').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  tenantId: tenantId(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const nodeTemplates = pgTable('node_templates', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default(''), // 卡片展示名（模板数据化，前端不硬编码）
  description: text('description'),
  sceneType: text('scene_type').notNull(),
  endpoint: text('endpoint').notNull(), // generations | edits
  slots: jsonb('slots').notNull(), // 图片槽位定义：数量/必填性
  varsSchema: jsonb('vars_schema').notNull(), // 业务变量定义：chips/text/必填
  promptTemplate: text('prompt_template').notNull(), // 含占位符 {标题}{背景风格}…
  defaultParams: jsonb('default_params'),
  version: integer('version').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const generationRuns = pgTable(
  'generation_runs',
  {
    id: text('id').primaryKey(),
    tenantId: tenantId(),
    projectId: text('project_id'),
    mode: text('mode').notNull(), // t2i | i2i | template
    templateId: text('template_id'),
    origin: text('origin').notNull(), // quick | template（预留 agent|plan|workflow）
    candidateCount: integer('candidate_count').notNull(), // 候选数 ≠ 最终交付数
    rerunOfRunId: text('rerun_of_run_id'),
    idempotencyKey: text('idempotency_key').notNull(),
    requestParams: jsonb('request_params').notNull(), // 请求级参数快照
    status: text('status').notNull(), // queued|running|partial|succeeded|failed
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('runs_idempotency_uq').on(t.tenantId, t.idempotencyKey)],
);

export const generationJobs = pgTable('generation_jobs', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  tenantId: tenantId(),
  projectId: text('project_id'),
  mode: text('mode').notNull(),
  templateId: text('template_id'),
  endpoint: text('endpoint').notNull(), // generations | edits
  inputParams: jsonb('input_params').notNull(), // 参数快照（槽位/变量/prompt/上游图）
  status: text('status').notNull(), // queued|running|succeeded|failed
  resultUrl: text('result_url'), // 转存后的自有 URL（永不存引擎临时 URL）
  pointsCost: integer('points_cost'),
  error: text('error'), // 原文（供应商/内部）——仅内部排障，绝不出 API
  errorKind: text('error_kind'), // retryable | non_retryable | moderation_rejected
  errorCode: text('error_code'), // S4：JOB_* 稳定错误码（对外只出 code + 目录文案）
  // ---- M2a S0 起：队列执行与 outbox（M2a 方案 §二/§三）----
  attempts: integer('attempts').notNull().default(0), // Worker 已尝试次数
  queueJobId: text('queue_job_id'), // BullMQ 关联（约定 = job.id，留列便于排障）
  enqueueState: text('enqueue_state').notNull().default('pending'), // pending|enqueued（Reconciler 只扫 pending+queued）
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const assets = pgTable('assets', {
  id: text('id').primaryKey(),
  tenantId: tenantId(),
  projectId: text('project_id'), // 可空 = 未归档
  type: text('type').notNull(), // source | result
  url: text('url').notNull(),
  name: text('name').notNull(),
  genParams: jsonb('gen_params'), // 生成参数快照（结果类），详情追溯与回流复现
  sourceJobId: text('source_job_id'),
  meta: jsonb('meta'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** 内部资源账（M1 起）：只记账不计费；M2a CreditTransaction、M3 PriceBook/BillingLedger 另建 */
export const usageEvents = pgTable('usage_events', {
  id: text('id').primaryKey(),
  tenantId: tenantId(),
  runId: text('run_id'),
  jobId: text('job_id'),
  operation: text('operation').notNull(), // generate | edit | …
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  quantity: integer('quantity').notNull().default(1),
  providerUsage: jsonb('provider_usage'), // Provider 原始用量
  estimatedCost: numeric('estimated_cost'),
  currency: text('currency'),
  status: text('status').notNull(), // succeeded | failed
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 点数流水（M2a S1 起启用）：可审计、可重放的凭证；tenants.pointsBalance 仍是
 * 事务性维护的权威快速余额（同一 PG 事务条件更新），流水用于审计与对账修复。
 * hold 记 Run 级（jobId 空）；settle/refund 记 Job 级；唯一约束防重复入账。
 */
export const creditTransactions = pgTable(
  'credit_transactions',
  {
    id: text('id').primaryKey(),
    tenantId: tenantId(),
    runId: text('run_id'),
    jobId: text('job_id'),
    type: text('type').notNull(), // opening | hold | settle | refund | topup
    amount: integer('amount').notNull(), // 有符号：hold 负、settle 0（确认凭证）、refund/topup/opening 正
    balanceAfter: integer('balance_after').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // NULLS NOT DISTINCT（PG15+）：同一 Run 的 hold（jobId 为空）也只允许一条
    unique('credit_tx_uq').on(t.tenantId, t.runId, t.jobId, t.type).nullsNotDistinct(),
  ],
);
