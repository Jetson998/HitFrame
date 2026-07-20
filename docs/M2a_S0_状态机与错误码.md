# M2a S0 · 状态机与错误码定稿

> 2026-07-20 ｜ 依据：《HitFrame_M2a_实施方案草案.md》v0.3 ｜ 配套迁移：`drizzle/0002`（credit_transactions + jobs.attempts/queueJobId/enqueueState）
> 本表为 S1–S4 实现的唯一口径；改动需回到本文件先改表。

## 1 Run 状态机

```
queued ──► running ──► succeeded   （全部 Job 成功）
                  ├──► partial     （部分 Job 成功；成功结算、失败退还）
                  └──► failed      （全部 Job 失败；hold 全额退还）
```

- 写入者：API 建 Run（queued）；聚合器（Worker 完成回调 / 轮询端点孤儿判定）负责终态。
- 终态不可逆；`finishedAt` 只在进入终态时写一次。

## 2 Job 状态机（M2a 扩展）

```
queued ──► running ──► succeeded
   ▲           │
   │      （retryable 且 attempts < MAX_ATTEMPTS=3：BullMQ 退避重试，attempts++）
   │           │
   └───────────┴──► failed（non_retryable / moderation_rejected / 重试耗尽 / 死信）
```

- `enqueueState`: `pending`（PG 事务已提交、未确认入队）→ `enqueued`（BullMQ add 成功后回写）。
  Reconciler 只扫 `enqueueState='pending' AND status='queued'`（M1 存量行均已终态，天然不命中）。
- `queueJobId = generationJobs.id`（BullMQ jobId 去重约定）。
- Worker 消费入口先查 DB：status 已终态 → 直接 ack（幂等）。
- 重试只对 `errorKind='retryable'`；`non_retryable` / `moderation_rejected` 一次失败即终态。

## 3 CreditTransaction 流转

| 时机 | type | 级别 | amount | 幂等键 `(tenantId, runId, jobId, type)` |
|---|---|---|---|---|
| 入队事务（与 Run/Job 创建同事务） | `hold` | Run（jobId=NULL） | −预估总额 | (t, run, NULL, hold) |
| Job 成功落库事务 | `settle` | Job | 0（hold 已扣，settle 记确认；见下） | (t, run, job, settle) |
| Job 失败终态事务 | `refund` | Job | +单张点数 | (t, run, job, refund) |
| 人工充值 | `topup` | — | +N | (t, NULL, NULL, topup) 不唯一约束限制（runId 空但 id 各异 → 用 note 记凭证） |

记账口径（定稿）：**hold 即时从 `pointsBalance` 条件扣减**（`UPDATE tenants SET points_balance = points_balance - :est WHERE id=:t AND points_balance >= :est`，0 行 = 40201 点数不足）；settle 金额记 0 仅作确认凭证（余额不再变动）；refund 按失败 Job 单张点数回加。任意时刻 `pointsBalance == 初始 + Σ amount`。对账任务发现不一致 → 以流水重放修复快照 + 告警。

> topup 注：唯一约束对 `(t, NULL, NULL, topup)` 因 NULLS NOT DISTINCT 只允许一行——**topup 必须带唯一 runId 占位**（约定 `runId = 'topup_' + 凭证号`），S1 实现时落此约定。

## 4 幂等键清单（缺一不可）

1. `generation_runs (tenant_id, idempotency_key)` UNIQUE — 请求重放返回原 Run（M1 已有）；
2. BullMQ `jobId = generation_jobs.id` — 队列层去重；
3. `credit_transactions (tenant_id, run_id, job_id, type)` UNIQUE NULLS NOT DISTINCT — 不重复入账；
4. Worker 执行前查 DB 终态 — 重复投递不重复执行/扣点/产资产。

## 5 错误码表（对外收敛；服务端日志保留全文）

信封不变：`{ code, message, data? }`。**message 不得包含服务器路径、堆栈、供应商原文**（修 M1 已知问题 3）；详情只进服务端日志（带 runId/jobId 关联）。

### 5.1 API 请求级

| code | 场景 | message 示例 |
|---|---|---|
| 0 | 成功 | ok / accepted |
| 40001 | 参数无效（mode/ratio/quality/candidateCount 等） | candidateCount 取值 1–4 |
| 40002 | 模板不存在 | 模板不存在 |
| 40003 | 槽位/变量缺失 | 模板需要 1 个必填图片槽位 |
| 40004 | 项目不存在 | 项目不存在 |
| 40101 | 未授权 | 令牌无效 |
| 40201 | 点数不足 | 点数不足：需 N，余 M |
| 40401 | 资源不存在（run/asset） | 资源不存在 |
| 50000 | 内部错误（兜底） | 系统繁忙，请稍后再试 |

### 5.2 Job 级（`jobs[].errorCode` 新字段，S4 实现；`error` 原文仅日志）

| errorCode | errorKind | 用户可见文案 | 处置 |
|---|---|---|---|
| JOB_ENGINE_TIMEOUT | retryable | 引擎响应超时，已自动重试 | 退避重试→耗尽落死信 |
| JOB_ENGINE_BUSY | retryable | 引擎繁忙（限流/5xx），已自动重试 | 同上 |
| JOB_ENGINE_REJECTED | moderation_rejected | 内容未通过引擎审核 | 不重试；退还点数 |
| JOB_ENGINE_ERROR | non_retryable | 引擎返回错误 | 不重试；退还点数 |
| JOB_INPUT_INVALID | non_retryable | 输入素材缺失或已删除 | 不重试；退还点数 |
| JOB_RESULT_INVALID | retryable | 结果图片校验失败，已自动重试 | 魔数/下载失败归此 |
| JOB_STORAGE_ERROR | retryable | 结果保存失败，已自动重试 | 存储层异常 |
| JOB_INTERRUPTED | retryable | 执行中断已恢复/待恢复 | Worker 崩溃恢复路径 |

## 6 S0 完成判定

- [x] 迁移 0002 在 M1 数据上无损应用（本机已验证）；
- [x] 幂等键四项定稿；
- [x] Run/Job/流水状态机定稿；
- [x] 错误码表定稿（实现排 S4；R10 VITE_API_TOKEN 运行时注入同批处理）。
