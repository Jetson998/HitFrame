import { Injectable } from '@nestjs/common';
import type { StorageDriver, StoredObjectMeta } from './driver';
import { LocalStorageDriver } from './local.driver';
import { S3StorageDriver } from './s3.driver';

/** 稳定网关 URL 的签名默认时效（秒）——每次访问 /files/{key} 即时刷新。 */
export const SIGNED_URL_TTL = Number(process.env.SIGNED_URL_TTL ?? 900);

/** 进程级驱动单例：网关中间件与 Nest 服务共用同一实例。 */
let sharedDriver: StorageDriver | undefined;
export function storageDriver(): StorageDriver {
  if (!sharedDriver) {
    const kind = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
    sharedDriver = kind === 's3' ? new S3StorageDriver() : new LocalStorageDriver();
  }
  return sharedDriver;
}

/**
 * StorageAdapter（ADR-9）门面：业务层只见对象键与稳定网关 URL；
 * 驱动切换（local↔s3）时 DB 中的 URL 与对象键语义不变。
 */
@Injectable()
export class StorageService {
  private readonly driver = storageDriver();
  private readonly publicBase = (process.env.PUBLIC_BASE_URL ?? 'http://localhost:3001').replace(
    /\/$/,
    '',
  );

  /** 保存并返回稳定网关 URL（DB 永不存引擎临时 URL / 签名直链） */
  async save(key: string, data: Buffer, contentType?: string): Promise<{ key: string; url: string }> {
    await this.driver.save(key, data, contentType);
    return { key, url: this.urlFor(key) };
  }

  async read(key: string): Promise<Buffer> {
    return this.driver.read(key);
  }

  async delete(key: string): Promise<void> {
    await this.driver.delete(key);
  }

  head(key: string): Promise<StoredObjectMeta> {
    return this.driver.head(key);
  }

  /** 稳定网关 URL（不随驱动变化） */
  urlFor(key: string): string {
    return `${this.publicBase}/files/${key}`;
  }

  get driverKind(): 'local' | 's3' {
    return this.driver.kind;
  }
}
