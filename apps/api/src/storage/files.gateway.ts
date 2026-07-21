import type { Request, RequestHandler, Response } from 'express';
import { SIGNED_URL_TTL, storageDriver } from './storage.service';

/**
 * /files/{key} 稳定网关（替代 express.static）：
 *   - local 驱动 → 读盘直接回流
 *   - s3 驱动   → 302 重定向到「即刻签发」的短时效 presigned URL（过期即刷新）
 * DB 中 URL 恒为此稳定路径，签名永不入库。免鉴权（与 M1 静态托管一致）。
 */
export function filesGateway(): RequestHandler {
  return async (req: Request, res: Response) => {
    // req.path 形如 /a/b/c.png（已剥离挂载前缀 /files）
    const key = decodeURIComponent(req.path.replace(/^\/+/, ''));
    if (!key || key.includes('..')) {
      res.status(400).send('bad key');
      return;
    }
    const driver = storageDriver();
    try {
      if (driver.kind === 's3') {
        const signed = await driver.presign(key, SIGNED_URL_TTL);
        // 短缓存：允许 CDN/浏览器在 TTL 内复用重定向，过期后再回源刷新
        res.set('Cache-Control', `private, max-age=${Math.max(0, SIGNED_URL_TTL - 60)}`);
        res.redirect(302, signed!);
        return;
      }
      const buf = await driver.read(key);
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
      res.type(extType(key)).send(buf);
    } catch {
      res.status(404).send('not found');
    }
  };
}

function extType(key: string): string {
  const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
  return ext === 'jpg' || ext === 'jpeg'
    ? 'image/jpeg'
    : ext === 'webp'
      ? 'image/webp'
      : 'image/png';
}
