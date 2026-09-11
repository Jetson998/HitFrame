# HitFrame

面向品牌内容团队的 AI 出图工作台（M1 开发中）。

口径文档（仓库外，见项目根目录）：

- `HitFrame_产品方案.md` v3.0.2（产品范围权威）
- `HitFrame_技术架构方案.md` v3.0.2（架构与接口权威）
- `output/HitFrame_M1_实施决策记录.md`（M1 实施解释与阶段边界）
- 交互基准：`output/HitFrame_demo.html`

## 结构

```
apps/web                React 18 + Vite + TS + Tailwind 4 + Zustand + shadcn 风组件（radix/cva/cn）
apps/api                NestJS + Drizzle + PostgreSQL；协议异步（202 + Run 轮询）+ 进程内执行器（ADR-9）
packages/shared         A0 契约 DTO / 业务枚举 / 点数与尺寸唯一映射
packages/image-provider ImageProvider 适配接口 + MuskapisProvider（gpt-image-2）
```

## 快速开始

```bash
npm install
cp .env.example .env        # 填 IMAGE_API_KEY（密钥只存服务端）
docker compose up -d        # PostgreSQL + Valkey + SeaweedFS（需本机安装 docker）
npm run build               # 全仓构建
node --env-file=.env scripts/seed.mjs   # 种子：默认租户点数 + 三场景模板
npm run dev:api             # API :3001（node --env-file=.env apps/api/dist/main.js）
npm run dev:web             # Web :5173（/api、/files 代理到 :3001）
npm run dev:worker          # Worker（后台队列消费，node --env-file=.env apps/api/dist/worker-main.js）
```

打开 <http://localhost:5173>，首屏粘贴服务端 `.env` 的 `API_TOKEN`（dev 环境默认 `dev-token-change-me`）。引擎密钥只存服务端，前端只持有本系统 API 令牌。

### 验收/测试启动口径（重要）

启动前**必须检查端口归属**，避免前端代理连到错误后端：

```bash
# 检查端口归属（macOS/Linux）
lsof -i :3001 -i :5173 -i :8333

# 预期输出示例（确保 3001 是 HitFrame node 进程，不是其他项目）
# node    12345  user   23u  IPv4  TCP *:3001 (LISTEN)   # HitFrame API
# node    12346  user   24u  IPv4  TCP *:5173 (LISTEN)   # Vite dev server
# seaweedf 12347 user   25u  IPv4  TCP *:8333 (LISTEN)   # SeaweedFS S3 gateway
```

如果 3001 被其他项目占用，先停掉该进程或改 HitFrame 端口（`apps/api/src/main.ts` + `apps/web/vite.config.ts` proxy target）。

验收记录模板（每次跑验收时记录实际进程/端口）：

```
启动环境：
- API    : node --env-file=.env apps/api/dist/main.js (PID 12345, :3001)
- Worker : node --env-file=.env apps/api/dist/worker-main.js (PID 12346)
- Web    : npm run dev:web (Vite :5173, proxy → :3001)
- Docker : postgres:5432, valkey:6379, seaweedfs:8333
```

## M1 阶段进度

- [x] 阶段 1 工程骨架（monorepo / TS / lint / env / 健康检查 / Drizzle 配置与 schema）
- [x] 阶段 2 Muskapis 真实出图验证（t2i 66s / i2i 66s，`scripts/verify-provider.mjs`）
- [x] 阶段 3 Run / Job / Asset / UsageEvent 数据闭环（七表迁移 + 种子：`scripts/seed.mjs`）
- [x] 阶段 4 `POST /api/v1/generations`（202 + `GET /runs/:id` 轮询 + 幂等重放 + 启动孤儿清理 + 简单扣点，t2i/template 两链路实测通过）
- [x] 阶段 5 React 主流程（按 Demo 复刻：三 Tab 输入结构 / 模板配置页数据驱动 / 上传与资产选择 / 成本前置 / 202+轮询结果卡 / 资产详情与再次引用；新增 `GET /templates`、`GET /me`）
- [x] 阶段 6 资产库与项目（项目新建/切换、上传与生成归入当前项目、类型/项目筛选、改归属、删除含存储清理；`GET/POST /projects`、`PATCH/DELETE /assets/:id`）
- [x] 阶段 7 M1 验收（12 项全过，见 `docs/M1_验收记录.md`）

**M1 已完成。** 后续 M2a：执行内核换 BullMQ/Valkey + 对象存储 + 三模板 + 规则路由 Agent + CreditTransaction（种子客户试用）。

## M2a 阶段进度（方案：`HitFrame_M2a_实施方案草案.md` v0.3，M1 基线 tag `m1-accepted`）

- [x] S0 拍板收尾（迁移 0002：credit_transactions + jobs 队列列；状态机/错误码/幂等键定稿：`docs/M2a_S0_状态机与错误码.md`）
- [x] S0.1 opening 流水基线（迁移 0003；`pointsBalance = Σ流水` 自基线起严格成立）+ 记账口径修正
- [x] S1 CreditTransaction 预扣/结算/退还 + 入队 outbox（hold 条件扣减防透支；失败/孤儿统一 refund；fake 压测：并发闸门=2、注入分流、32 并发抢余额零透支）
- [x] 测试加固（2026-07-20 拍板）：**FakeProvider**（`IMAGE_PROVIDER=fake`，秒级占位图，支持 `[fail]` / `[fail:non_retryable]` / `[fail:moderation]` / `[slow:ms]` 注入）+ **执行器全局并发信号量**（默认 2，`EXECUTOR_CONCURRENCY` 可调，S2 后由 Worker concurrency 取代）。破坏性/压测一律走 fake，真实引擎只用于单张回归与演示图
- [x] S2 BullMQ/Valkey/Worker 迁移（CAS 抢占 + FOR UPDATE reconcile 两 P1 阶段门关闭；EXECUTION_MODE=queue|inline 互斥回滚开关；破坏性验收 10/10：`scripts/accept/s2-queue.mjs`，记录 `docs/M2a_S1_S2_验收记录.md`）
- [x] S2.1 评审修正（claim 后 Run queued→running 条件更新；queue 模式关闭轮询孤儿判定，交由 BullMQ stalled+Reconciler；at-least-once 执行语义入档，风险 R11）
- [x] S3 StorageAdapter 双驱动（Local/S3）+ SeaweedFS/客户 OSS + 稳定网关 `/files/{key}`（s3 302→短时效签名，过期即刷新）+ 存量迁移（幂等+校验和+三方一致）；验收 9/9：`scripts/accept/s3-storage.mjs`，迁移 `scripts/migrate/local-to-s3.mjs`，记录 `docs/M2a_S3_验收记录.md`
- [x] S4 errorCode 收敛 + 脱敏（API 只返 errorCode/文案，路径/堆栈/密钥只进日志）+ 死信/恢复/观测（logEvent 单行 JSON，死信重放仅诊断不改账）+ 孤儿对象巡检回收（StorageReclaimService）；验收记录 `docs/M2a_S4_验收记录.md`
- [x] S5 三模板（tpl_bg/tpl_model/tpl_poster）+ Agent 规则路由（意图→模板，比例/数量/质量解析，16:9→4:3 映射，无副作用 route）+ 前端集成（模板分类筛选、Agent 页、缺图门禁、确认才建 Run、错误态诊断补齐）；验收 18/18：`scripts/accept/s5-templates-agent.mjs`
- [x] 生成调用日志库（迁移 0005：`generation_logs` 生命周期事件、提示词/错误/耗时快照、未来多用户 `actorId` 字段）+ 内部查询接口 `/api/v1/internal/generation-logs`；开发与排障口径见 [`docs/M2a_日志库与调用审计.md`](docs/M2a_日志库与调用审计.md)
- [ ] S6-Creation Agent 创意导演：Creation.1 已完成模块边界、Skill、参考图角色、提示词编译/追溯与确认后接入原队列；多轮追问、独立图片组分镜/执行和确定性文字合成仍未完成，见 [`docs/S6_Creation_1_验收记录.md`](docs/S6_Creation_1_验收记录.md)
- [ ] S6 种子客户验收
- [ ] S7 （可选）Socket.IO/SSE

## 已知问题

- **引擎 size 参数为弱约束**（2026-07-19 实测）：请求 `1024x1024` 返回 1086×1448（3:4）；请求 `1536x1024` 返回 1402×1122（≈5:4）。方向大致生效、精确尺寸不生效。处理：阶段 3 技术校验层记录实际尺寸到 `Asset.meta`，前端按实际尺寸展示；「比例」选项文案避免承诺精确像素；必要时本地按目标比例裁切。待与供应商确认参数口径。
