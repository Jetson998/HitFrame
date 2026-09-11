# 生成调用日志排障

架构与字段决策记录见 [M2a · 生成日志库与调用审计](M2a_日志库与调用审计.md)；本文是开发/运维查询手册。

## 能记录什么

`generation_logs` 是追加式生命周期日志，业务状态仍以 `generation_runs` / `generation_jobs` 为准，点数仍以 `credit_transactions` 为准。

一条生成请求通常按以下顺序产生事件：

```text
accepted -> enqueued (queue 模式) -> claimed -> provider_started -> provider_response
  -> succeeded
  -> provider_failed -> retry (可重试)
  -> provider_failed -> failed (终态失败)
```

日志会保留 Run/Job、模式、模板、用户提示词、编译后提示词、输入参数快照、尝试次数、供应商/模型、结果资产、耗时、HTTP 状态、错误码和内部错误信息。中转响应体 `requestId` 写入 `relayRequestId`，响应头 `x-request-id` 写入 `providerTraceId`，两者不假设相同。`actorId`、渠道、分组、倍率、价格版本及 Token 字段已预留；上游尚未提供时保持为空。

日志写入是 best-effort：日志数据库异常只记录服务进程错误，不会让生成请求或点数结算失败。

## 查询

接口暂不接入前端，由全局 `API_TOKEN` 保护：

```bash
TOKEN="$(sed -n 's/^API_TOKEN=//p' .env)"

# 最近 100 条
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:3001/api/v1/internal/generation-logs?limit=100"

# 查询一次 Run 的完整生命周期
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:3001/api/v1/internal/generation-logs?runId=run_xxx&limit=100"

# 只看供应商失败
curl -sS \
  -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:3001/api/v1/internal/generation-logs?event=provider_failed&limit=100"
```

`limit` 范围为 1–500；也支持 `jobId`、`requestId`、`relayRequestId`、`providerTraceId`、`event` 和 ISO 格式 `before` 游标。原始 prompt、IP 和内部错误属于排障数据，当前只能通过受保护的内部接口读取；多用户上线前应再增加独立的管理员权限和保留周期。

每次出站尝试由 `jobId + attemptNo` 区分。若连接在收到响应前断开，HTTP 状态和两个中转 ID 均为 `null`，不能据此推断中转侧没有生成。

## 迁移与进程

迁移文件：`apps/api/drizzle/0005_outstanding_the_fury.sql`。

修改代码后需重启 API 和 Worker，新的生命周期日志才会开始写入：

```bash
npm run build
npm run dev:api
npm run dev:worker
```
