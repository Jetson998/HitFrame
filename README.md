# HitFrame

面向品牌内容团队的 AI 出图工作台（M1 开发中）。

口径文档（仓库外，见项目根目录）：
- `HitFrame_产品方案.md` v3.0.2（产品范围权威）
- `HitFrame_技术架构方案.md` v3.0.2（架构与接口权威）
- `output/HitFrame_M1_实施决策记录.md`（M1 实施解释与阶段边界）
- 交互基准：`output/HitFrame_demo.html`

## 结构

```
apps/web                React 18 + Vite + TS + Tailwind + Zustand（shadcn/ui 于阶段 5 引入）
apps/api                NestJS + Drizzle + PostgreSQL；协议异步（202 + Run 轮询）+ 进程内执行器（ADR-9）
packages/shared         A0 契约 DTO / 业务枚举 / 点数与尺寸唯一映射
packages/image-provider ImageProvider 适配接口 + MuskapisProvider（gpt-image-2）
```

## 快速开始

```bash
npm install
cp .env.example .env        # 填 IMAGE_API_KEY（密钥只存服务端）
npm run build               # 全仓构建
npm run dev:api             # API :3001（GET /api/v1/health）
npm run dev:web             # Web :5173（/api 代理到 :3001）
docker compose up -d        # PostgreSQL（阶段 3 起需要；需本机安装 docker）
```

## M1 阶段进度

- [x] 阶段 1 工程骨架（monorepo / TS / lint / env / 健康检查 / Drizzle 配置与 schema）
- [x] 阶段 2 Muskapis 真实出图验证（t2i 66s / i2i 66s，`scripts/verify-provider.mjs`）
- [x] 阶段 3 Run / Job / Asset / UsageEvent 数据闭环（七表迁移 + 种子：`scripts/seed.mjs`）
- [x] 阶段 4 `POST /api/v1/generations`（202 + `GET /runs/:id` 轮询 + 幂等重放 + 启动孤儿清理 + 简单扣点，t2i/template 两链路实测通过）
- [ ] 阶段 5 React 主流程（按 Demo 复刻）
- [ ] 阶段 6 资产库与项目
- [ ] 阶段 7 M1 验收（三链路真实出图）

## 已知问题

- **引擎 size 参数为弱约束**（2026-07-19 实测）：请求 `1024x1024` 返回 1086×1448（3:4）；请求 `1536x1024` 返回 1402×1122（≈5:4）。方向大致生效、精确尺寸不生效。处理：阶段 3 技术校验层记录实际尺寸到 `Asset.meta`，前端按实际尺寸展示；「比例」选项文案避免承诺精确像素；必要时本地按目标比例裁切。待与供应商确认参数口径。
