import type { JobErrorCode, Quality } from '@hitframe/shared';

/** 错误三分类：M1 消费方 = 扣点（失败不扣）+ 前端文案；M2a 复用为重试策略 */
export type ProviderErrorKind = 'retryable' | 'non_retryable' | 'moderation_rejected';

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: ProviderErrorKind,
    public readonly httpStatus?: number,
    public readonly raw?: unknown,
    /** S4：显式错误码（内部抛错点直接指定；缺省时由 classifyJobError 从 kind/httpStatus 推导） */
    public readonly errorCode?: JobErrorCode,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface GenerateInput {
  prompt: string;
  /** 引擎 size（由 shared 的 RATIO_TO_SIZE 映射而来） */
  size: string;
  quality: Quality;
}

export interface EditImageFile {
  data: Uint8Array;
  filename: string;
  contentType?: string;
}

export interface EditInput {
  prompt: string;
  /** 多图输入：槽位顺序即 image[] 顺序（模特模板双槽位 M2a 使用） */
  images: EditImageFile[];
  size: string;
  quality: Quality;
  /** 商品主体保真（换背景场景传 'high'） */
  inputFidelity?: 'high';
}

export interface ImageResultItem {
  /** 引擎返回二进制（base64）——优先 */
  b64?: string;
  /** 引擎返回临时 URL（有时效，调用方必须立即转存） */
  url?: string;
}

export interface ImageResult {
  images: ImageResultItem[];
  model: string;
  /** Provider 原始用量元数据，原样写入 UsageEvent.providerUsage */
  usage?: unknown;
}

/**
 * 统一图像引擎适配接口（技术方案 A4）。
 * 上层只用 HitFrame 标准枚举；端点协议差异、画质映射由实现内部消化。
 */
export interface ImageProvider {
  readonly name: string;
  readonly model: string;
  generate(input: GenerateInput): Promise<ImageResult>;
  edit(input: EditInput): Promise<ImageResult>;
}
