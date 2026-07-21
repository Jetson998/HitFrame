import { createHash } from 'node:crypto';
import { mkdirSync, promises as fs } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { StorageDriver, StorageListItem, StoredObjectMeta } from './driver';

/** M1 本地 Volume 驱动：保留原 StorageService 行为，供回滚与开发默认。 */
export class LocalStorageDriver implements StorageDriver {
  readonly kind = 'local' as const;
  private readonly root: string;

  constructor(dir?: string) {
    this.root = resolve(dir ?? process.env.STORAGE_DIR ?? './storage');
  }

  async save(key: string, data: Buffer): Promise<void> {
    const path = this.safePath(key);
    mkdirSync(dirname(path), { recursive: true });
    await fs.writeFile(path, data);
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFile(this.safePath(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.safePath(key), { force: true });
  }

  async head(key: string): Promise<StoredObjectMeta> {
    try {
      const buf = await fs.readFile(this.safePath(key));
      return {
        bytes: buf.length,
        checksum: createHash('sha256').update(buf).digest('hex'),
        exists: true,
      };
    } catch {
      return { bytes: null, checksum: null, exists: false };
    }
  }

  async presign(): Promise<string | null> {
    return null; // 本地无签名：网关直接回流
  }

  async list(): Promise<StorageListItem[]> {
    const out: StorageListItem[] = [];
    const walk = async (dir: string): Promise<void> => {
      let entries: import('node:fs').Dirent[];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        return; // 根目录不存在（尚无任何对象）
      }
      for (const e of entries) {
        const full = resolve(dir, e.name);
        if (e.isDirectory()) {
          await walk(full);
        } else if (e.isFile()) {
          const st = await fs.stat(full);
          // 对象键 = 相对 root 的 posix 路径
          out.push({
            key: relative(this.root, full).split(sep).join('/'),
            bytes: st.size,
            lastModifiedMs: st.mtimeMs,
          });
        }
      }
    };
    await walk(this.root);
    return out;
  }

  private safePath(key: string): string {
    const path = resolve(this.root, key);
    // 用 relative 判逃逸：结果以 .. 开头或本身是绝对路径 → 逃出 root
    // （规避 startsWith 的 `/storage` 误判 `/storage2` 前缀问题）
    const rel = relative(this.root, path);
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`invalid storage key: ${key}`);
    }
    return path;
  }
}
