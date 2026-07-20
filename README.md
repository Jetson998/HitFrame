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
docker compose up -d        # PostgreSQL（需本机安装 docker）
npm run build               # 全仓构建
node --env-file=.env scripts/seed.mjs   # 种子：默认租户点数 + 商品换背景模板
npm run dev:api             # API :3001（GET /api/v1/health）
npm run dev:web             # Web :5173（/api、/files 代理到 :3001）
```

打开 <http://localhost:5173>，首屏粘贴服务端 `.env` 的 `API_TOKEN`（或在 `apps/web/.env.local` 配 `VITE_API_TOKEN` 免粘贴）。引擎密钥只存服务端，前端只持有本系统 API 令牌。

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
- [ ] S2 BullMQ/Valkey/Worker 迁移
- [ ] S3 StorageAdapter + SeaweedFS/OSS + 存量迁移
- [ ] S4 重试/死信/恢复/观测 + 错误码收敛实现
- [ ] S5 三模板 + Agent 规则路由
- [ ] S6 种子客户验收
- [ ] S7 （可选）Socket.IO/SSE

## 已知问题

- **引擎 size 参数为弱约束**（2026-07-19 实测）：请求 `1024x1024` 返回 1086×1448（3:4）；请求 `1536x1024` 返回 1402×1122（≈5:4）。方向大致生效、精确尺寸不生效。处理：阶段 3 技术校验层记录实际尺寸到 `Asset.meta`，前端按实际尺寸展示；「比例」选项文案避免承诺精确像素；必要时本地按目标比例裁切。待与供应商确认参数口径。

