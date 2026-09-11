# M2a · 生成日志库与调用审计

**状态**：已实现（2026-09-01）
**迁移**：`apps/api/drizzle/0005_outstanding_the_fury.sql`
**范围**：后端持久化与内部查询；本阶段不做前端日志页面。

## 1. 目标与边界

HitFrame 原有 `logEvent` 只把队列事件输出到 Worker stdout，适合实时观察，但不能按 Run/Job 回查，也不保存提示词、供应商错误和耗时。新增 `generation_logs` 作为排障日志库，按生命周期追加记录。

日志不是业务状态源：

- `generation_runs` / `generation_jobs` 仍是生成状态机的权威来源。
- `credit_transactions` 仍是点数扣除、结算、退款的账本来源。
- `generation_logs` 只用于还原调用过程、定位失败和统计耗时。

日志写入采用 best-effort。日志数据库不可用时只记录服务进程错误，不阻断生成、队列或点数事务。

## 2. 数据模型

`generation_logs` 一行代表一个生命周期事件，核心字段包括：

| 类别 | 字段 |
| --- | --- |
| 关联 | `tenantId`、`actorId`、`runId`、`jobId`、`requestId` |
| 过程 | `event`、`status`、`attemptNo`、`mode`、`templateId`、`endpoint` |
| 输入 | `userPrompt`、`compiledPrompt`、`inputParams` |
| 供应商 | `provider`、`model`、`providerRequestId`、`relayRequestId`、`providerTraceId`、`providerHttpStatus`、`providerUsage` |
| 结果 | `resultAssetId`、`resultUrl`、`resultBytes`、`pointsCost` |
| 错误 | `errorKind`、`errorCode`、`errorMessage`（仅内部） |
| 计时 | `startedAt`、`finishedAt`、`durationMs`、`providerDurationMs` |
| 计费预留 | `channelId`、`groupId`、`rateMultiplier`、`priceVersion`、`estimatedCost`、`currency` |
| Token 预留 | `inputTokens`、`outputTokens`、`cacheReadTokens`、`cacheWriteTokens` |
| 请求环境 | `requestIp`、`metadata` |

`actorId` 同时已加入 `generation_runs` 和 `generation_jobs`，当前单租户认证尚未提供用户身份，因此为空；多用户认证接入后从认证上下文填充。API Token 不保存原文。

## 3. 事件链路

```text
accepted -> enqueued（queue 模式） -> claimed -> provider_started -> provider_response
  -> succeeded
  -> provider_failed -> retry（可重试）
  -> provider_failed -> failed（终态失败）
```

- API 接收并完成 Run/Job/hold 事务后写入 `accepted`。
- Queue Dispatcher 成功或失败分别写入 `enqueued` / `enqueue_failed`。
- Worker/inline executor 抢占时写入 `claimed`。
- 供应商调用前写入 `provider_started`，结束后写入 `succeeded` 或 `provider_failed`。
- 收到中转 HTTP 响应后写入 `provider_response`，保存 HTTP 状态、响应体 `requestId` 和响应头 `x-request-id`；三者不假设相同。
- BullMQ 可重试错误写入 `retry`；最终退款终态写入 `failed`。
- `providerDurationMs` 只计算供应商请求，不包含图像槽位读取、结果下载和对象存储。

## 4. 查询接口

内部接口：

```text
GET /api/v1/internal/generation-logs
```

由全局 `API_TOKEN` 保护，暂不接入前端。支持 `runId`、`jobId`、本地 `requestId`、中转 `relayRequestId`、响应头 `providerTraceId`、`event`、ISO 时间游标 `before` 和 `limit`（1–500）。完整命令和示例见 [generation-logs.md](generation-logs.md)。

字段语义：

- `requestId`：HitFrame 入站请求 ID，进入 Job 参数快照并贯穿尝试日志。
- `relayRequestId`：中转响应体中的 `requestId`；同时写入旧字段 `providerRequestId` 以兼容已有查询。
- `providerTraceId`：中转响应头 `x-request-id`（若存在）。在中转协议确认前，不与 `relayRequestId` 合并。

## 5. 隐私与后续工作

- 原始 prompt、IP、供应商原始错误属于内部排障数据，不得回显给普通业务 API。
- 多用户上线前，需要独立的管理员权限、租户过滤和日志保留周期；当前接口仍处于单租户内部工具阶段。
- 供应商未返回 Token 或美元成本时字段保持 `null`，禁止按字符数推算。
- 后续接入渠道路由后，在写入日志时补齐 `channelId/groupId/rateMultiplier/priceVersion`，并保存调用时价格快照。
