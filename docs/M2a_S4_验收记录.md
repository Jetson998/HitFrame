# M2a S4 验收记录

**阶段目标**：错误码收敛落库（`JOB_*`）→ 错误响应脱敏 → 死信/恢复/可观测性 → 孤儿对象巡检回收。

**阶段门（评审锁定）**：fake 破坏性测试全覆盖、不打真实额度；S2/S3 回归仍绿；错误响应扫描不到本地路径/上游原文/密钥。

---

## 一、S4.1 errorCode 落库 + JOB_* 映射

- `shared`：`JobErrorCode` 类型 + `JOB_ERROR_CATALOG`（code→{kind, 用户文案}）+ `classifyJobError`（显式 code 优先，否则按 kind/httpStatus 归类）+ `jobErrorMessage`。
- schema：`generation_jobs.error_code` 列（迁移 0004，M1/存量数据无损）。
- `ProviderError` 携带 `errorCode`；内部抛错点显式赋码：魔数/下载失败→`JOB_RESULT_INVALID`、槽位缺失→`JOB_INPUT_INVALID`、存储写失败→`JOB_STORAGE_ERROR`（新捕获包裹）。
- 中断路径（orphan/stalled/崩溃恢复）显式 `JOB_INTERRUPTED`。
- `failJobWithRefund` 计算并写 `errorCode`；worker/executor 三处调用传 signal（explicitCode/httpStatus）。

## 二、S4.2 错误响应脱敏

- `runs.controller`：`jobs[].error` 由「透传 DB 原文」改为「`errorCode` + `errorKind` + 目录文案」；DB `error` 原文仅内部排障。
- 全局 `AllExceptionsFilter`：HttpException 透出干净 `{code,message}`；其它任何异常（DB 错误/供应商原文/未预期抛错）**只进服务器日志**，对外统一 `{code:50000}`——杜绝堆栈/路径/上游原文/密钥经 500 泄漏。
- **R10**：前端弃用 `import.meta.env.VITE_API_TOKEN`（构建期被 Vite 静态内联进 JS 产物→泄漏），改运行时 `window.__HF_CONFIG__`（`/config.js` 部署注入，独立于构建产物）。构建产物验证：bundle 内 `VITE_API_TOKEN` 出现 0 次、`__HF_CONFIG__` 存在、`config.js` 随产物发布。

**脱敏实测**（fake 注入）：

| 注入 | errorCode | 用户文案 | 泄漏扫描 |
| --- | --- | --- | --- |
| `[fail:non_retryable]` | `JOB_ENGINE_ERROR` | 引擎返回错误 | 无 fake原文/路径/token |
| `[fail:moderation]` | `JOB_ENGINE_REJECTED` | 内容未通过引擎审核 | 无 |

## 三、S4.3 死信 / 恢复 / 可观测性

- **可观测事件**（`logEvent`，单行 JSON，只出脱敏字段）：`enqueue / claim / succeeded / retry / dead_letter / failed / recovered`。
  实测事件序列：成功=`claim→succeeded`；retryable 耗尽=`claim→retry→claim→retry→claim→dead_letter`（3 尝试）；无误报 `recovered`。
- **claim() 语义精确化**：返回 `{job, viaRecovery}`——`viaRecovery=true` 仅当 DB 仍 running 的失联持有者残留被本 Worker 恢复认领（崩溃/失联恢复），与普通重试重认领区分。
- **死信留存**：BullMQ `removeOnFail=false`，failed 集合可查/可导出；`scripts/ops/dead-letters.mjs` 只读列举（BullMQ failed 计数 + DB `error_code` 分布）。
- **死信重放口径（评审拍板：重放仅诊断，不改账）**：retryable 耗尽的 Job 在终态失败时已「自动退款」（S2 场景5），hold 已回退。若程序化重放成功→用户白得一张图，且 `credit_tx` 单发键 `(tenant,run,job,type)` 不允许二次 hold。故**不做程序化重放**；用户侧恢复 = 前端重新发起一单（走正常 hold/settle）。

## 四、S4.4 孤儿对象巡检回收

- `StorageDriver.list()`（local 递归遍历 / s3 分页 ListObjectsV2）；`StorageReclaimService.reclaimOnce(graceMs)`。
- 判据：存储中存在、无任何 `asset.meta.storageKey` 指向、且 `lastModified` 早于宽限期→回收。覆盖 job-runner 终态 CAS 落败留下的孤儿文件。
- 宽限期默认 60min（`RECLAIM_GRACE_MS`）防误删在途上传；缺 `lastModified` 保守跳过；巡检默认 15min（`RECLAIM_INTERVAL_MS`），单机只在 API 进程挂一个。
- **实测**：grace=0 回收 3 孤儿、live 22 未误删；grace=1h 新孤儿受宽限保护保留。

---

## 五、回归 / 阶段门

- **S2 队列破坏性套件**：`node --env-file=.env scripts/accept/s2-queue.mjs` → 10/10（claim() 签名变更后回归）。
- **S3 存储套件**：9/9；迁移 `--verify` 22/22 sha256 一致（S4 未触存储契约）。
- **账实恒等**：全程 fake、零真实额度；测试数据清场后 462=462。
- **脱敏扫描**：错误响应与 500 兜底均无本地路径 / 上游原文 / 密钥。

## 六、遗留

- 存量 74 条历史 failed Job 的 `error_code` 为 null（早于迁移 0004）；新失败均带码，不回填历史。
- 供应商是否支持请求幂等键（消除 R11 引擎重复调用）仍待答复。
