import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageDriver, StoredObjectMeta } from './driver';

/**
 * S3 兼容驱动：SeaweedFS（Apache-2.0）或客户 OSS（阿里云/腾讯云/AWS）通吃。
 * SeaweedFS S3 网关须开 forcePathStyle。
 */
export class S3StorageDriver implements StorageDriver {
  readonly kind = 's3' as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const endpoint = process.env.S3_ENDPOINT;
    this.bucket = required('S3_BUCKET');
    this.client = new S3Client({
      region: process.env.S3_REGION ?? 'us-east-1',
      endpoint: endpoint || undefined,
      forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') !== 'false',
      credentials: {
        accessKeyId: required('S3_ACCESS_KEY'),
        secretAccessKey: required('S3_SECRET_KEY'),
      },
    });
  }

  async save(key: string, data: Buffer, contentType?: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      }),
    );
  }

  async read(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return Buffer.from(await res.Body!.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (err) {
      if (!isNotFound(err)) throw err; // 缺失视为已删
    }
  }

  async head(key: string): Promise<StoredObjectMeta> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        bytes: res.ContentLength ?? null,
        checksum: res.ETag ? res.ETag.replace(/"/g, '') : null,
        exists: true,
      };
    } catch (err) {
      if (isNotFound(err)) return { bytes: null, checksum: null, exists: false };
      throw err;
    }
  }

  async presign(key: string, ttlSeconds: number): Promise<string | null> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: ttlSeconds },
    );
  }
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`S3 驱动缺少环境变量 ${name}`);
  return v;
}

function isNotFound(err: unknown): boolean {
  const meta = (err as { $metadata?: { httpStatusCode?: number }; name?: string }) ?? {};
  return meta.$metadata?.httpStatusCode === 404 || meta.name === 'NotFound' || meta.name === 'NoSuchKey';
}
