import { Inject, Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { DB, Db } from '../db/db.module';
import { StorageService } from './storage.service';

/** 巡检周期：默认 15 分钟（比队列 Reconciler 30s 慢得多，属重活低频） */
const RECLAIM_INTERVAL_MS = Number(process.env.RECLAIM_INTERVAL_MS ?? 15 * 60_000);
/** 宽限期：默认 60 分钟。仅回收「早于此」的孤儿，避免误删刚上传、DB 事务尚未提交的在途对象 */
const RECLAIM_GRACE_MS = Number(process.env.RECLAIM_GRACE_MS ?? 60 * 60_000);

export interface ReclaimResult {
  scanned: number;
  live: number;
  orphanTotal: number;
  withinGrace: number;
  reclaimed: number;
}

/**
 * 孤儿对象巡检回收（S4.4）。
 * 覆盖「对象已上传但 DB 终态 CAS 落败/事务未提交」的路径——job-runner 在
 * done.length===0（终态被他方抢先）时明确留下孤儿文件，此处按宽限期安全回收。
 *
 * 判据：存储中存在、但无任何 asset.meta.storageKey 指向它，且对象 lastModified
 * 早于宽限期。缺 lastModified（无法判龄）的对象一律保守跳过，绝不误删。
 */
@Injectable()
export class StorageReclaimService implements OnApplicationShutdown {
  private readonly log = new Logger('Reclaim');
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly storage: StorageService,
  ) {
    // 单机单点：只在 API 进程挂一个巡检器即可（Worker 不重复挂）
    if ((process.env.RECLAIM_ENABLED ?? 'true') !== 'false') {
      this.timer = setInterval(() => {
        void this.reclaimOnce().catch((e) => this.log.error(`reclaim failed: ${String(e)}`));
      }, RECLAIM_INTERVAL_MS);
    }
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** 一次巡检回收；返回统计。graceMs 可传 0 用于测试即时回收。 */
  async reclaimOnce(graceMs: number = RECLAIM_GRACE_MS): Promise<ReclaimResult> {
    const objects = await this.storage.list();
    // DB 现存全部对象键（result + source 资产）——存活集合
    const rows = await this.db.query.assets.findMany({ columns: { meta: true } });
    const live = new Set<string>();
    for (const r of rows) {
      const k = (r.meta as { storageKey?: string } | null)?.storageKey;
      if (k) live.add(k);
    }

    const cutoff = Date.now() - graceMs;
    let orphanTotal = 0;
    let withinGrace = 0;
    let reclaimed = 0;
    for (const obj of objects) {
      if (live.has(obj.key)) continue;
      orphanTotal++;
      // 无法判龄的对象保守跳过（绝不误删）
      if (obj.lastModifiedMs == null) {
        withinGrace++;
        continue;
      }
      if (obj.lastModifiedMs > cutoff) {
        withinGrace++; // 仍在宽限期：可能是在途上传
        continue;
      }
      await this.storage.delete(obj.key);
      reclaimed++;
      this.log.warn(`reclaimed orphan object: ${obj.key}`);
    }

    const result: ReclaimResult = {
      scanned: objects.length,
      live: live.size,
      orphanTotal,
      withinGrace,
      reclaimed,
    };
    if (reclaimed > 0 || orphanTotal > 0) {
      this.log.log(
        `reclaim: scanned=${result.scanned} live=${result.live} orphan=${result.orphanTotal} withinGrace=${result.withinGrace} reclaimed=${result.reclaimed}`,
      );
    }
    return result;
  }
}
