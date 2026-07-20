-- S0.1: 为已有租户补 opening 流水基线（评审 P1）
-- 使「pointsBalance = Σ CreditTransaction.amount」自迁移时刻起严格成立；
-- 幂等：唯一约束 (tenant_id, run_id, job_id, type) NULLS NOT DISTINCT 天然防重复写入。
INSERT INTO "credit_transactions" ("id", "tenant_id", "run_id", "job_id", "type", "amount", "balance_after", "note")
SELECT
  'ct_opening_' || t."id",
  t."id",
  NULL,
  NULL,
  'opening',
  t."points_balance",
  t."points_balance",
  'M1 余额结转基线（迁移 0003 写入）'
FROM "tenants" t
ON CONFLICT ON CONSTRAINT "credit_tx_uq" DO NOTHING;
