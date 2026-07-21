/**
 * StorageDriver（技术方案 ADR-9）：对象键与「稳定 URL」语义在驱动切换时不变。
 * 业务层只见对象键 `key` 与网关 URL `/files/{key}`；文件真实位置由驱动决定。
 *
 * 关键设计：DB 永远只存稳定网关 URL（`{publicBase}/files/{key}`），
 * 从不落引擎临时 URL，也不落带签名的 S3 直链——签名会过期。
 * `/files/{key}` 由 FilesController 每次请求即时解析：
 *   - local 驱动 → 直接读盘回流
 *   - s3 驱动   → 302 重定向到「即刻签发」的短时效 presigned URL（过期即刷新）
 */
export interface StoredObjectMeta {
  /** 字节数（不存在时为 null） */
  bytes: number | null;
  /** 内容哈希：local=sha256 hex；s3 优先返回写入的 sha256 元数据，缺失时回退 ETag */
  checksum: string | null;
  /** 是否存在 */
  exists: boolean;
}

/** 巡检列举项：孤儿回收据此比对 DB 资产并按 lastModified 施加宽限期 */
export interface StorageListItem {
  key: string;
  bytes: number | null;
  /** 对象最后修改时间（ms epoch）；用于宽限期判定，避免误删在途上传 */
  lastModifiedMs: number | null;
}

export interface StorageDriver {
  readonly kind: 'local' | 's3';

  /** 保存对象；返回其对象键（URL 由 StorageService 统一拼稳定网关 URL） */
  save(key: string, data: Buffer, contentType?: string): Promise<void>;

  /** 列举全部对象键（分页内部处理）；孤儿巡检用 */
  list(): Promise<StorageListItem[]>;

  /** 读回二进制（i2i 取素材、local 网关回流用） */
  read(key: string): Promise<Buffer>;

  /** 删除对象（缺失视为已删，不报错） */
  delete(key: string): Promise<void>;

  /** 对象元数据（迁移校验、巡检用）；不存在时 exists=false */
  head(key: string): Promise<StoredObjectMeta>;

  /**
   * 签发短时效直链（仅 s3 驱动有意义）。
   * local 驱动返回 null（由网关直接回流，无需签名）。
   */
  presign(key: string, ttlSeconds: number): Promise<string | null>;
}
