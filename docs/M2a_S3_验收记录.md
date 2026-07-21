# M2a S3 存储阶段验收记录

**阶段目标**：StorageAdapter 通用化 → SeaweedFS / 客户 OSS → 签名 URL → M1 本地存量迁移，验收三方一致（文件数 / 校验和 / Asset 记录）。

**验收口径（评审锁定）**：①新生成走对象存储；②签名 URL 过期可刷新；③存量迁移后 文件数 / 校验和 / Asset 记录 三方一致。

---

## 一、架构改动

| 项 | M1（改前） | S3（改后） |
| --- | --- | --- |
| 存储抽象 | `StorageService` 直接读写本地盘 | `StorageDriver` 接口 + `LocalStorageDriver` / `S3StorageDriver` 双实现；`StorageService` 变门面按 `STORAGE_DRIVER` 分流 |
| 结果/素材 URL | `express.static('/files')` 直挂盘 | `/files/{key}` 稳定网关：local 读盘回流 / s3 **302→即时签发短时效 presigned URL** |
| DB 存的 URL | `{publicBase}/files/{key}` | **不变**（稳定网关 URL；驱动切换零 DB 改写；签名永不入库） |
| 对象键 | `{projectId}/{runId}/{jobId}.{ext}`、`uploads/{assetId}.{ext}` | **不变** |
| 对象存储 | 无 | SeaweedFS（Apache-2.0，S3 网关模式，本地 :8333）；生产改 `.env` 的 `S3_*` 即切客户 OSS，代码零改动 |

**关键设计**：DB 永远只存稳定网关 URL，从不落引擎临时 URL、也不落带签名的 S3 直链（签名会过期）。`/files/{key}` 每次请求即时解析——s3 驱动每次命中都重新签发短时效直链，天然满足「过期可刷新」。

**新增/改动文件**：
- `apps/api/src/storage/driver.ts` — `StorageDriver` 接口 + `StoredObjectMeta`
- `apps/api/src/storage/local.driver.ts` — 本地驱动（保留 M1 行为 + `head` sha256）
- `apps/api/src/storage/s3.driver.ts` — S3 驱动（put/get/delete/head/presign，缺失 404 归一）
- `apps/api/src/storage/storage.service.ts` — 门面 + 进程级驱动单例 `storageDriver()`
- `apps/api/src/storage/files.gateway.ts` — `/files` 网关中间件（local 回流 / s3 302）
- `apps/api/src/main.ts` — `express.static` → `filesGateway()`
- `docker-compose.yml` + `infra/seaweedfs/s3.json` — SeaweedFS S3 端点
- `scripts/migrate/local-to-s3.mjs` — 存量迁移（幂等 + 校验和 + 三方核对）
- `scripts/accept/s3-storage.mjs` — 阶段验收套件

---

## 二、验收结果

### 存量迁移（`node --env-file=.env scripts/migrate/local-to-s3.mjs`）

```
Asset 记录（有 storageKey）: 22
本地文件缺失            : 0
S3 存在且字节一致       : 22
本次迁移                : 22
幂等跳过（已一致）      : 0
不一致                  : 0
三方一致（Asset==S3==校验）: ✅ PASS
```

- **幂等复跑**：再次执行 → 迁移 0 / 幂等跳过 22 / ✅ PASS（已存在且字节一致即跳过）
- **`--verify` 只读校验**：迁移 0 / 不一致 0 / ✅ PASS

### 阶段验收套件（`node --env-file=.env scripts/accept/s3-storage.mjs`，fake，零真实额度）

| # | 场景 | 结果 |
| --- | --- | --- |
| ① | 新生成成功（STORAGE_DRIVER=s3） | ✅ run=succeeded |
| ① | 资产 URL 为稳定网关路径（不含 X-Amz） | ✅ `/files/{key}` |
| ② | 网关 302 重定向到签名直链（含 X-Amz-Signature） | ✅ status=302 |
| ② | 签名直链取回图片字节（PNG 魔数 89504e47） | ✅ |
| ③ | 每次命中网关重新签名（跨秒签名不同） | ✅ |
| ③ | 旧签名过期被拒（TTL=5s 后旧直链 403） | ✅ 403 |
| ③ | 重新命中网关刷新签名可用（新直链 200） | ✅ 200 |
| ④ | 存量三方一致（--verify 通过） | ✅ |
| — | 账实恒等（清场回冲后） | ✅ 462=462 |

**总计 9/9 通过。**

### 回滚 / 兼容

- `STORAGE_DRIVER=local`（默认）：`/files/{key}` 读盘直接回流 200（实测 status=200 type=image/png 无重定向），M1 行为零变化。
- 驱动切换只改 `.env` 一个变量，DB 记录与对象键不动。

---

## 三、遗留 / 风险

- **SigV4 签名精度到秒**：同一秒内多次命中网关得到相同签名属正常（非缺陷）；刷新有效性由「旧签名 TTL 过期 403 → 新命中 200」证明。
- **网关缓存头**：s3 分支返回 `Cache-Control: private, max-age=(TTL-60)`，允许浏览器在有效期内复用重定向，过期回源刷新；TTL 默认 900s，生产可调。
- **SeaweedFS 单点**：与整体单机部署口径一致（首期接受单点、不降一致性/幂等/备份标准）；生产可直接切客户 OSS（高可用由云厂商保证）。
- **孤儿文件**：终态 CAS 落败时已下载文件成孤儿（job-runner 注释已标 S3 巡检回收）——留 S4 巡检项。
