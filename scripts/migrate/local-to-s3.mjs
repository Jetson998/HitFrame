/**
 * M1 本地存量 → S3 迁移（幂等 + 校验和）。
 * 前置：docker compose up -d seaweedfs；.env 配好 S3_*（STORAGE_DRIVER 可仍为 local）。
 * 用法：
 *   node --env-file=.env scripts/migrate/local-to-s3.mjs           # 迁移
 *   node --env-file=.env scripts/migrate/local-to-s3.mjs --verify  # 只校验三方一致
 *
 * 策略：遍历 assets.meta.storageKey → 读本地文件算 sha256 → PutObject →
 * HeadObject 比对字节数 → 幂等（S3 已存在且字节数一致则跳过）。
 * DB 中 URL 恒为稳定网关 /files/{key}，迁移不改任何 DB 记录。
 */
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  CreateBucketCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const VERIFY_ONLY = process.argv.includes('--verify');
const ROOT = resolve(process.env.STORAGE_DIR ?? './storage');
const BUCKET = process.env.S3_BUCKET ?? 'hitframe';

const s3 = new S3Client({
  region: process.env.S3_REGION ?? 'us-east-1',
  endpoint: process.env.S3_ENDPOINT || undefined,
  forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? 'true') !== 'false',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? '',
    secretAccessKey: process.env.S3_SECRET_KEY ?? '',
  },
});

const psql = (q) =>
  execSync(
    `docker exec -i $(docker ps --format '{{.Names}}' | grep postgres) psql -U hitframe -d hitframe -t -A`,
    { shell: '/bin/bash', input: q },
  )
    .toString()
    .trim();

async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    console.log(`[bucket] created ${BUCKET}`);
  }
}

const contentTypeOf = (key) => {
  const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
  return ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
};

async function main() {
  await ensureBucket();

  // 取所有带 storageKey 的资产（迁移目标全集）
  const rows = psql(
    `SELECT id || '\t' || (meta->>'storageKey') FROM assets WHERE meta->>'storageKey' IS NOT NULL ORDER BY created_at;`,
  )
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [id, key] = l.split('\t');
      return { id, key };
    });

  let migrated = 0;
  let skipped = 0;
  let localMissing = 0;
  let mismatch = 0;
  let s3Present = 0;

  for (const { id, key } of rows) {
    const localPath = join(ROOT, key);
    let buf;
    try {
      buf = await fs.readFile(localPath);
    } catch {
      localMissing++;
      console.log(`[local-missing] ${id} ${key}`);
      continue;
    }
    const sha = createHash('sha256').update(buf).digest('hex');

    // S3 现状
    let head = null;
    try {
      head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    } catch {
      head = null;
    }

    // AWS SDK 把用户元数据键小写化；上传时写入的 sha256 在此读回
    const s3Sha = head?.Metadata?.sha256 ?? null;
    const bytesMatch = head?.ContentLength === buf.length;
    // 幂等/一致判据：字节数一致 且 sha256 一致（缺 sha256 元数据视为不一致，需重传补齐）
    if (head && bytesMatch && s3Sha === sha) {
      s3Present++;
      skipped++;
      continue;
    }
    if (VERIFY_ONLY) {
      mismatch++;
      const reason = !head
        ? 'absent'
        : !bytesMatch
          ? `bytes local=${buf.length} s3=${head.ContentLength}`
          : s3Sha == null
            ? 'no-sha256-meta'
            : `sha local=${sha.slice(0, 12)} s3=${s3Sha.slice(0, 12)}`;
      console.log(`[verify-miss] ${key} ${reason}`);
      continue;
    }

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buf,
        ContentType: contentTypeOf(key),
        Metadata: { sha256: sha },
      }),
    );
    // 上传后即刻 HeadObject 校验字节数 + sha256 元数据
    const verify = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    if (verify.ContentLength !== buf.length || verify.Metadata?.sha256 !== sha) {
      mismatch++;
      console.log(
        `[upload-mismatch] ${key} bytes exp=${buf.length} got=${verify.ContentLength} sha exp=${sha.slice(0, 12)} got=${(verify.Metadata?.sha256 ?? 'none').slice(0, 12)}`,
      );
      continue;
    }
    migrated++;
    s3Present++;
  }

  console.log('\n==== 三方一致核对 ====');
  console.log(`Asset 记录（有 storageKey）: ${rows.length}`);
  console.log(`本地文件缺失            : ${localMissing}`);
  console.log(`S3 存在且字节一致       : ${s3Present}`);
  console.log(`本次迁移                : ${migrated}`);
  console.log(`幂等跳过（已一致）      : ${skipped}`);
  console.log(`不一致                  : ${mismatch}`);

  const consistent = mismatch === 0 && s3Present === rows.length - localMissing;
  console.log(
    `\n三方一致（Asset==S3==校验）: ${consistent ? '✅ PASS' : '❌ FAIL'}` +
      (localMissing ? `（另有 ${localMissing} 条本地文件缺失，需人工核查）` : ''),
  );
  process.exit(consistent ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
