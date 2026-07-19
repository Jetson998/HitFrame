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
