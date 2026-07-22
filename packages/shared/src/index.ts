/**
 * HitFrame 共享契约（A0）与业务枚举。
 * 口径来源：HitFrame_技术架构方案.md v3.0.2 §四·五 A0 / §五。
 */

// ---- 业务枚举 ----

export type GenerationMode = 't2i' | 'i2i' | 'template';

/** 生成来源（非执行器类型）；M1 仅写入 quick | template，其余为保留值 */
export type RunOrigin = 'quick' | 'template' | 'agent' | 'plan' | 'workflow';

/** 画质内部枚举；引擎参数映射由 Provider 内部消化（standard→medium, high→high） */
export type Quality = 'standard' | 'high';

export type Ratio = '1:1' | '3:4' | '4:3' | '9:16';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type RunStatus = 'queued' | 'running' | 'partial' | 'succeeded' | 'failed';

// ---- S4 Job 级错误码（对外只出 code + 用户文案；原文/路径/密钥仅进日志） ----

export type JobErrorKind = 'retryable' | 'non_retryable' | 'moderation_rejected';

export type JobErrorCode =
  | 'JOB_ENGINE_TIMEOUT'
  | 'JOB_ENGINE_BUSY'
  | 'JOB_ENGINE_REJECTED'
  | 'JOB_ENGINE_ERROR'
  | 'JOB_INPUT_INVALID'
  | 'JOB_RESULT_INVALID'
  | 'JOB_STORAGE_ERROR'
  | 'JOB_INTERRUPTED';

export interface JobErrorEntry {
  kind: JobErrorKind;
  /** 用户可见文案（脱敏后对外的唯一错误说明） */
  message: string;
}

/** JOB_* 错误码目录（S0 §5.2 定稿）：code → {kind, 用户文案}。对外文案不含任何内部细节。 */
export const JOB_ERROR_CATALOG: Record<JobErrorCode, JobErrorEntry> = {
  JOB_ENGINE_TIMEOUT: { kind: 'retryable', message: '引擎响应超时，已自动重试' },
  JOB_ENGINE_BUSY: { kind: 'retryable', message: '引擎繁忙，已自动重试' },
  JOB_ENGINE_REJECTED: { kind: 'moderation_rejected', message: '内容未通过引擎审核' },
  JOB_ENGINE_ERROR: { kind: 'non_retryable', message: '引擎返回错误' },
  JOB_INPUT_INVALID: { kind: 'non_retryable', message: '输入素材缺失或已删除' },
  JOB_RESULT_INVALID: { kind: 'retryable', message: '结果图片校验失败，已自动重试' },
  JOB_STORAGE_ERROR: { kind: 'retryable', message: '结果保存失败，已自动重试' },
  JOB_INTERRUPTED: { kind: 'retryable', message: '执行中断，已恢复或待恢复' },
};

/** 用户可见文案（未知 code 落兜底文案，绝不回显原文） */
export function jobErrorMessage(code?: string | null): string | undefined {
  if (!code) return undefined;
  return JOB_ERROR_CATALOG[code as JobErrorCode]?.message ?? '生成失败，请重试';
}

/**
 * 由错误信号推导 JOB_* 错误码（S4）。显式 code 优先；否则按 kind + httpStatus 归类。
 * 只吃原始信号（不依赖 ProviderError 类型，避免循环依赖）。
 * 中断/恢复路径（Worker 崩溃、orphan、stalled）由调用方显式传 JOB_INTERRUPTED；
 * 未预期内部异常按 kind='non_retryable' 落 JOB_ENGINE_ERROR（安全：不自动重试、退点）。
 */
export function classifyJobError(signal: {
  explicitCode?: JobErrorCode;
  kind?: JobErrorKind;
  httpStatus?: number;
}): JobErrorCode {
  if (signal.explicitCode) return signal.explicitCode;
  switch (signal.kind) {
    case 'moderation_rejected':
      return 'JOB_ENGINE_REJECTED';
    case 'retryable':
      // 408 超时归 TIMEOUT；429/5xx 及其余 retryable 归 BUSY
      return signal.httpStatus === 408 ? 'JOB_ENGINE_TIMEOUT' : 'JOB_ENGINE_BUSY';
    case 'non_retryable':
    default:
      return 'JOB_ENGINE_ERROR';
  }
}

// ---- 唯一口径映射 ----

/** 画质 → 点数/张（技术方案 A0 画质档位映射表） */
export const POINTS_PER_IMAGE: Record<Quality, number> = {
  standard: 2,
  high: 4,
};

/** 比例 → 引擎 size（gpt-image 仅支持三种，3:4/9:16 均落竖版，4:3 落横版） */
export const RATIO_TO_SIZE: Record<Ratio, string> = {
  '1:1': '1024x1024',
  '3:4': '1024x1536',
  '9:16': '1024x1536',
  '4:3': '1536x1024',
};

/** StorageAdapter 对象键唯一口径：M1 本地 Volume 与 M2a 对象存储共用 */
export function objectKey(projectId: string, runId: string, jobId: string, ext: string): string {
  return `${projectId}/${runId}/${jobId}.${ext}`;
}

// ---- A0 契约 DTO ----

export interface GenerationOptionsDto {
  ratio: Ratio;
  quality: Quality;
  /** 本次 Run 生成的候选数（≠ 最终交付数；taskCount/finalOutputCount 属 M2b 计划层） */
  candidateCount: number;
}

export interface GenerationInputsDto {
  /** 图片槽位：资产 id 列表（mode=i2i/template） */
  slots?: string[];
  /** 业务变量（mode=template） */
  vars?: Record<string, string>;
  /** 补充描述，一律可选 */
  prompt?: string;
}

/** POST /api/v1/generations 请求体；origin 由服务端按入口写入，不由客户端传 */
export interface GenerationRequestDto {
  mode: GenerationMode;
  templateId?: string;
  inputs: GenerationInputsDto;
  options: GenerationOptionsDto;
  projectId?: string;
  idempotencyKey: string;
}

export interface JobSummaryDto {
  jobId: string;
  status: JobStatus;
}

/** POST /api/v1/generations 202 响应（重复 idempotencyKey 返回首次的同构响应） */
export interface GenerationAcceptedDto {
  runId: string;
  jobs: JobSummaryDto[];
  pointsEstimated: number;
}

export interface JobStatusDto {
  jobId: string;
  status: JobStatus;
  resultAssetId?: string;
  resultUrl?: string;
  /** S4：稳定错误码（前端据此本地化/分支）；无错误时省略 */
  errorCode?: JobErrorCode;
  /** S4：重试策略分类（retryable/non_retryable/moderation_rejected） */
  errorKind?: JobErrorKind;
  /** S4：脱敏后的用户可见文案（来自 JOB_ERROR_CATALOG，绝不含原文/路径/密钥） */
  error?: string;
}

/** GET /api/v1/runs/{runId} 轮询响应 */
export interface RunStatusDto {
  runId: string;
  status: RunStatus;
  origin: RunOrigin;
  candidateCount: number;
  jobs: JobStatusDto[];
  createdAt: string;
  finishedAt?: string;
}

// ---- 模板 / 租户（M1 只读端点） ----

export interface TemplateSlotDto {
  key: string;
  label: string;
  required?: boolean;
}

export interface TemplateVarDto {
  key: string;
  label: string;
  required?: boolean;
  default?: string;
  /** chips = 选项点选；text = 自由输入（默认 chips） */
  type?: 'chips' | 'text';
  options?: string[];
  placeholder?: string;
}

/** GET /api/v1/templates 列表项；promptTemplate/defaultParams 不下发前端（不暴露 prompt） */
export interface TemplateSummaryDto {
  id: string;
  title: string;
  description?: string;
  sceneType: string;
  endpoint: 'generations' | 'edits';
  slots: TemplateSlotDto[];
  varsSchema: TemplateVarDto[];
  version: number;
}

/** GET /api/v1/me：M1 单租户余额展示 */
export interface MeDto {
  tenantId: string;
  name: string;
  pointsBalance: number;
}

/** 项目：资产归档单位（阶段 6）；projectId 同时决定结果对象键前缀 */
export interface ProjectDto {
  id: string;
  name: string;
  createdAt: string;
}

/** GET /api/v1/showcase（公开，免鉴权）：灵感/案例墙，未登录与空产出态展示 */
export interface ShowcaseItemDto {
  id: string;
  url: string;
  title: string;
  prompt?: string;
  mode?: string; // t2i | i2i | template
}

/** POST /api/v1/agent/route 响应（S5.4）：Agent 规则路由方案卡（无副作用） */
export interface AgentPlanDto {
  /** 推荐路径：t2i(文生图) / i2i(图生图，无模板) / template(模板) */
  mode: 't2i' | 'i2i' | 'template';
  /** 模板 ID（mode=template 时） */
  templateId?: string;
  /** 解析的参数 */
  params: {
    ratio?: Ratio;
    candidateCount?: number;
    quality?: Quality;
  };
  /** 槽位缺失提示（有值时前端只允许补图，不允许提交） */
  missingSlots?: string[];
  /** 预计点数 */
  estimatedPoints: number;
  /** 补充描述（用户模糊表达，进 prompt 不结构化） */
  additionalPrompt?: string;
}
