# M2a · 中转请求追踪改造记录

**日期**：2026-09-03
**范围**：图像生成调用的 HTTP 状态、中转请求标识、供应商追踪标识与生命周期日志
**状态**：已实现，已完成 fake 响应验证；待后续真实生图观测

## 1. 改造背景

一次生成可能经过 HitFrame API、队列 Worker、图像供应商和中转 API。此前日志可以关联 Run/Job，但无法确认：

- 中转是否已经返回 HTTP 响应，以及返回的状态码；
- 中转响应体中的 `requestId` 是什么；
- 响应头 `x-request-id` 是否存在；
- 同一 Job 的不同重试尝试分别对应哪一次出站调用。

本次改造把这些信息纳入每次供应商调用的排障记录。目标是让“生成失败”可以区分为 HTTP 响应失败、响应解析失败、图片下载/存储失败和响应前的网络中断，同时保留足够的 ID 供中转方对查。

## 2. ID 与状态码口径

| 字段 | 来源 | 作用 | 是否与其他 ID 合并 |
| --- | --- | --- | --- |
| `requestId` | HitFrame 入站请求头 `x-request-id`，没有时由 API 生成 | 关联一次 HitFrame 请求及其 Run/Job；进入 Job 参数快照，贯穿 Worker 与所有重试 | 不合并 |
| `relayRequestId` | 中转响应 JSON 的 `requestId` 或 `request_id` | 关联中转侧收到并处理的一次请求 | 不与响应头 ID 假设相同 |
| `providerTraceId` | 中转响应头 `x-request-id`，兼容读取 `request-id` | 关联中转网关/上游链路的 HTTP 请求 | 不与响应体 ID 假设相同 |
| `providerHttpStatus` | HTTP 响应状态码 | 判断是否收到响应及其成功/失败类别 | 独立保存 |
| `relayCode` | 中转响应 JSON 的 `code` | 补充中转业务层结果码；没有时为空 | 独立保存 |

历史字段 `providerRequestId` 继续保留，作为 `relayRequestId` 的兼容别名，避免已有查询和报表失效。当前不把两个远端 ID 拼成一个字段，直到中转协议明确它们是同一标识。

## 3. 实现变更

### 3.1 Provider 适配层

`ProviderResponseMeta` 新增：

```ts
{
  httpStatus?: number;
  relayRequestId?: string;
  providerTraceId?: string;
  relayCode?: string | number;
}
```

`MuskapisProvider` 在消费响应体前先读取状态码和响应头，然后解析 JSON 中的 `requestId`/`request_id` 与 `code`。以下路径均尽量带上已取得的元数据：

- 2xx 成功响应；
- 非 2xx 响应；
- 非 JSON 响应；
- 响应体读取失败。

Provider 返回成功图片时，`responseMeta` 随 `ImageResult` 返回；`ProviderError` 也携带 `responseMeta`，供失败、重试和终态日志复用。

### 3.2 持久化日志

`generation_logs` 增加：

- `relay_request_id`；
- `provider_trace_id`。

已有 `provider_http_status` 和 `provider_request_id` 沿用。迁移文件：

```text
apps/api/drizzle/0007_tan_lockheed.sql
```

日志写入保持 best-effort：日志库写入失败只记录进程错误，不阻断生成、队列或点数事务。

### 3.3 生命周期事件

每次出站尝试按以下顺序记录：

```text
accepted -> enqueued -> claimed -> provider_started -> provider_response
  -> succeeded
  -> provider_failed -> retry
  -> provider_failed -> failed / dead_letter
```

`provider_response` 是本次新增的持久化/Worker stdout 事件。它在收到 HTTP 响应后、图片解析/下载/对象存储前写入，因此即使后续因图片内容或存储失败，也能看到中转已经返回的状态码和远端 ID。

每一行通过 `jobId + attemptNo` 区分具体尝试，并同时保留 HitFrame `requestId`。成功、重试和失败日志会复制该次响应元数据，便于不依赖事件拼接即可查询。

## 4. 内部查询

受 `API_TOKEN` 保护的接口：

```text
GET /api/v1/internal/generation-logs
```

支持按以下条件过滤：

```text
runId
jobId
requestId
relayRequestId
providerTraceId
event
before
limit (1-500)
```

示例：

```bash
TOKEN="$(sed -n 's/^API_TOKEN=//p' .env)"

curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:3001/api/v1/internal/generation-logs?requestId=req_xxx&limit=100"

curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:3001/api/v1/internal/generation-logs?relayRequestId=relay_xxx&limit=100"
```

完整字段说明和日常排障示例见 [generation-logs.md](generation-logs.md)。

## 5. 验证记录

- 数据库迁移 `0007` 已生成并应用；
- API 健康检查返回 `code: 0`；
- `npm run typecheck` 通过；
- shared、image-provider、API 构建通过；
- fake 200 响应验证：正确解析 HTTP 状态、响应体 `requestId` 和响应头 `x-request-id`；
- fake 502 响应验证：非 2xx 仍保留 HTTP 状态、响应体 `requestId`、响应头 `x-request-id` 与 `relayCode`；
- 未主动发起真实生图，未消耗真实额度，后续需用新的生图请求观察真实中转字段。

## 6. 边界与解释口径

### 收到 HTTP 响应

只要 `fetch` 收到了响应头，`providerHttpStatus` 就应记录，即使响应体不是 JSON、读取失败或业务结果为空。若中转返回了标识，也会分别记录 `relayRequestId` 和 `providerTraceId`。

### 响应前连接中断

如果超时、DNS/TCP/TLS 失败或连接在收到响应头前断开，HTTP 状态和两个远端 ID 都可能为空。这只能证明 HitFrame 没有拿到可观测的 HTTP 响应，不能证明中转或上游没有生成；需要结合中转方日志，或以新的请求 ID 重试后对查。

### 重试与幂等

`requestId` 贯穿同一个 HitFrame Job，`attemptNo` 区分每次出站尝试；远端 `relayRequestId`/`providerTraceId` 可能每次重试不同。排障时优先按 `jobId` 查看完整链路，再用远端 ID 到中转侧查询。

## 7. 后续观测计划

下一轮发起少量真实生图，至少覆盖：

1. 成功响应；
2. 可重试的 HTTP 错误或超时；
3. 一次失败后重试成功或耗尽。

重点核对 `requestId`、`relayRequestId`、`providerTraceId` 是否在实际中转协议中稳定出现、是否一一对应，并确认 `provider_response`、`provider_failed`、`retry` 与最终业务状态、点数账本一致。
