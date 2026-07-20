# M2a S1 验收记录（补录）+ S2 验收记录

> 2026-07-20 ｜ 全部场景走 FakeProvider（零真实额度、零上游流量）｜ S2 套件已固化为可重复脚本：`scripts/accept/s2-queue.mjs`（`node --env-file=.env scripts/accept/s2-queue.mjs`）

## S1 验收（2026-07-20 现场执行，本文档为补录存档）

环境：inline 执行器 + FakeProvider + EXECUTOR_CONCURRENCY=2。

| # | 场景 | 结果 | 证据 |
|---|---|---|---|
| 1 | 同 idempotencyKey 并发 6 连发 | ✅ | 全部 202，唯一 runId 数 = 1，仅 1 笔 hold |
| 2 | 并发闸门 | ✅ | 4 个 3s 任务总耗时 6.2s（严格两批 = 上限 2 生效） |
| 3 | 失败注入分流 | ✅ | `[fail]`→retryable、`[fail:moderation]`→moderation_rejected；失败即退款，余额净不变 |
| 4 | 32 并发抢余额（high×4=16 点/单，余额 462） | ✅ | 通过 28 = 容量 floor(462/16)，4 个 402，余额全程 ≥0 零透支 |
| 5 | 账实恒等 | ✅ | 压测全程与清场后 `pointsBalance == Σ流水`（470=470） |

遗留（评审已提出、S2 修复）：非原子抢占与 reconcile 无锁 → 见下文 S2 P1。

## S2 验收（队列内核，`scripts/accept/s2-queue.mjs` 10/10 通过，110s）

环境：EXECUTION_MODE=queue + Valkey 8 + BullMQ（attempts=3，退避 5s/10s/20s）+ 独立 Worker（concurrency=2）+ FakeProvider。

**P1 阶段门（评审要求，已实现并验证）：**
- **CAS 原子抢占**：`UPDATE … SET status='running', attempts=attempts+1 WHERE id=:id AND status='queued' RETURNING *`——只有拿到返回行的执行者调用 Provider；running 残留恢复用 attempts 值二次 CAS，同抢仅一个胜出（场景 3 双并发 CAS 实测胜者=1、attempts=1）。
- **安全 reconcile**：单事务 `SELECT … FOR UPDATE` 锁租户行后重新聚合流水再比对修复，支持 `repair=false` 只告警模式。

| # | 必验场景（评审清单） | 结果 | 证据 |
|---|---|---|---|
| 1 | PG 提交后、queue.add 前崩溃 → Reconciler 补投 | ✅ | SQL 伪造 pending+hold 现场，30s 内补投并 succeeded |
| 2 | 同一 jobId 重复投递，Provider 只调用一次 | ✅ | 绕过 BullMQ 幂等直发重复消息，资产仍=1（CAS 兜底） |
| 3 | 两个执行者同抢一个 Job，仅一个 CAS 成功 | ✅ | 并发双 UPDATE 胜者=1，attempts=1 |
| 4 | Worker 执行中 SIGKILL，stalled/retry 恢复 | ✅ | 8s 慢任务执行中杀 Worker，新 Worker 恢复认领后 succeeded |
| 5 | retryable ≤3 次，最终失败只退款一次 | ✅ | attempts=3、refund 行=1、余额净不变 |
| 6 | non_retryable/moderation 不重试 | ✅ | attempts 均=1，errorKind 正确 |
| 7 | API 重启不影响执行中 Worker | ✅ | 执行中杀 API 再启，Job 照常 succeeded |
| 8 | Worker 停机 API 照常接单存 pending | ✅ | 停机时 202 + queued，Worker 回来即消化 |
| 9 | partial：成功 Job settle、失败 Job refund | ✅ | `[fail:alternate]` 2 候选：settle=1、refund=1、净扣 2 点 |
| 10 | 队列模式三链路复验 + 账实恒等 | ✅ | t2i(×2)/i2i/template 全 succeeded，账 442=442；清场后终核 462=462 |

**架构要点**：BullMQ payload 只带 jobId（DB 是唯一状态源）；`BullMQ jobId = GenerationJob.id` 队列层去重；`EXECUTION_MODE=queue|inline` 互斥（queue 模式下 inline 执行器 idle，作回滚开关）；Worker SIGTERM 优雅停机；stalled 超限兜底收敛 failed+refund。

**执行语义口径（S2.1 评审收口）**：
- **重复投递**：数据库资产与结算严格幂等；Provider 正常情况下只调用一次（CAS 抢占拦截）。
- **Worker 崩溃 / stalled 恢复**：**至少一次（at-least-once）执行**——若旧 Worker 在 BullMQ 锁过期后仍未真正退出，新 Worker 恢复认领时 Provider 可能被再次调用；数据库最终结果仍幂等（终态 CAS 保证只产一份资产/一笔退款），但**外部引擎可能重复调用并产生一次额外消耗**。此项登记为 M2a 已知风险（技术方案风险表 R11）；若供应商支持请求幂等键，后续以 `jobId` 作为 Provider 幂等键消除。

## S2.1 修正（评审 P1×2，2026-07-20）

1. **Run 状态收敛**：`claim()` 首次 CAS 抢到 Job（含 running 恢复）后，条件更新 `generation_runs: queued → running`——修复队列模式下 Job 已执行而 `GET /runs/:runId` 仍返回 queued 的用户可见错位；
2. **孤儿超时按模式分流**：RunsController 的 10 分钟 orphan timeout 仅 `EXECUTION_MODE=inline` 启用；queue 模式恢复/终态化由 BullMQ stalled + Reconciler 负责，轮询端点不再误杀正常长任务；
3. 验证：fake 慢任务执行中轮询 Run 返回 running（此前为 queued）；queue 模式下超时路径不触发（代码分支 + 复跑 `s2-queue.mjs` 10/10）。

## 结论

S2 + S2.1 完成，评审阶段门全部关闭。ADR-9 进程内执行器退役为回滚开关。下一阶段 S3：StorageAdapter + SeaweedFS/客户 OSS + 签名 URL + M1 存量迁移。
