import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DB, Db } from '../db/db.module';
import { creditTransactions, tenants } from '../db/schema';

/**
 * 点数流水（M2a S1，口径见 docs/M2a_S0_状态机与错误码.md §3）：
 * - tenants.pointsBalance 是事务性维护的权威快速余额；
 * - CreditTransaction 是可审计、可重放的凭证（hold 负 / settle 0 / refund/topup/opening 正）；
 * - 全部方法要求调用方传入事务句柄 tx，与 Run/Job 状态变更同事务提交；
 * - 幂等：唯一约束 (tenantId, runId, jobId, type) NULLS NOT DISTINCT，重复入账静默跳过。
 */
@Injectable()
export class CreditsService {
  private readonly log = new Logger('Credits');

  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * 预扣（Run 级，入队事务内）：条件扣减防并发透支。
   * 余额不足抛 40201；成功写入 hold 流水（amount 为负）。
   */
  async hold(tx: Db, tenantId: string, runId: string, amount: number): Promise<void> {
    const updated = await tx
      .update(tenants)
      .set({ pointsBalance: sql`${tenants.pointsBalance} - ${amount}` })
      .where(and(eq(tenants.id, tenantId), sql`${tenants.pointsBalance} >= ${amount}`))
      .returning({ balance: tenants.pointsBalance });
    if (updated.length === 0) {
      const t = await tx.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
      throw new HttpException(
        { code: 40201, message: `点数不足：需 ${amount}，余 ${t?.pointsBalance ?? 0}` },
        402,
      );
    }
    await tx.insert(creditTransactions).values({
      id: `ct_${randomUUID()}`,
      tenantId,
      runId,
      type: 'hold',
      amount: -amount,
      balanceAfter: updated[0].balance,
      note: `预扣 ${amount} 点`,
    });
  }

  /** 结算（Job 级，成功落库事务内）：amount=0 确认凭证，余额不变。 */
  async settle(
    tx: Db,
    tenantId: string,
    runId: string,
    jobId: string,
    pointsCost: number,
  ): Promise<void> {
    await this.insertIdempotent(tx, {
      tenantId,
      runId,
      jobId,
      type: 'settle',
      amount: 0,
      note: `结算确认 ${pointsCost} 点（已含于 hold）`,
    });
  }

  /** 退还（Job 级，失败终态事务内）：按单 Job 点数回加余额。 */
  async refund(
    tx: Db,
    tenantId: string,
    runId: string,
    jobId: string,
    amount: number,
  ): Promise<void> {
    const inserted = await this.insertIdempotent(tx, {
      tenantId,
      runId,
      jobId,
      type: 'refund',
      amount,
      note: `失败退还 ${amount} 点`,
    });
    // 只有首次写入流水才回加余额（幂等：重复退还不重复加钱）
    if (inserted) {
      await tx
        .update(tenants)
        .set({ pointsBalance: sql`${tenants.pointsBalance} + ${amount}` })
        .where(eq(tenants.id, tenantId));
    }
  }

  /**
   * 对账：pointsBalance == Σ amount。全程在单事务内 SELECT … FOR UPDATE 锁住租户行，
   * 锁定后再重新聚合流水比对（S2 P1：防读取与修复之间有并发 hold/refund 提交被覆盖）。
   * repair=false 时只告警不改写快照（人工维护窗口修复）。返回是否一致。
   */
  async reconcile(tenantId: string, repair = true): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      // 先锁租户行，阻塞并发的 hold/settle/refund 事务，直到本事务结束
      const [locked] = await tx
        .select({ balance: tenants.pointsBalance })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .for('update');
      if (!locked) return false;
      // 锁定后重新聚合，读到的是被锁点之前的全部已提交流水
      const [{ ledger }] = await tx
        .select({
          ledger: sql<number>`COALESCE(SUM(${creditTransactions.amount}), 0)::int`,
        })
        .from(creditTransactions)
        .where(eq(creditTransactions.tenantId, tenantId));
      if (locked.balance === ledger) return true;
      this.log.error(
        `reconcile mismatch tenant=${tenantId}: balance=${locked.balance} ledger=${ledger}${
          repair ? ' → 以流水修复快照' : ' → 仅告警（人工修复）'
        }`,
      );
      if (repair) {
        await tx.update(tenants).set({ pointsBalance: ledger }).where(eq(tenants.id, tenantId));
      }
      return false;
    });
  }

  /**
   * 幂等写入流水：balanceAfter 在同一语句内取当前余额快照。
   * 返回 true=首次写入，false=唯一约束冲突（已存在，跳过）。
   */
  private async insertIdempotent(
    tx: Db,
    row: {
      tenantId: string;
      runId: string;
      jobId?: string;
      type: 'settle' | 'refund' | 'topup';
      amount: number;
      note: string;
    },
  ): Promise<boolean> {
    const res = await tx
      .insert(creditTransactions)
      .values({
        id: `ct_${randomUUID()}`,
        tenantId: row.tenantId,
        runId: row.runId,
        jobId: row.jobId,
        type: row.type,
        amount: row.amount,
        balanceAfter: sql`(SELECT ${tenants.pointsBalance} + ${row.amount} FROM ${tenants} WHERE ${tenants.id} = ${row.tenantId})`,
        note: row.note,
      })
      .onConflictDoNothing()
      .returning({ id: creditTransactions.id });
    return res.length > 0;
  }
}
