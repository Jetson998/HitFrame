# S6-Creation.1 提示词编译器与创意导演

## 范围

本阶段把 Agent 的自然语言创作接入现有 `POST /api/v1/generations` 管线：

`原始需求 + Skill + 参考图角色 + 创意参数 -> 编译预览 -> 原文/增强结果对照 -> 用户确认/编辑 -> Run/Job/hold/queue/settle`

不生成文章正文、PPT 大纲或自由工作流。文章配图、信息图和宫格图只输出图片。

## 前端交互

- `原样`：不调用编译器，可直接使用原始需求生成。
- `智能增强`：补齐主体、构图、光影、保真和负向约束；分析后才允许生成。
- `创意导演`：在智能增强之上给出主题、色彩、构图、标题和卖点建议；用户确认/编辑后才允许生成。
- 面板显示原始需求、完整编译说明、变更摘要和最终可编辑说明。
- 可调参数：构图、景别、光线、主体保真、创意强度、文字策略，以及既有的比例、画质、数量。
- 参考图角色：商品主体、人物/模特、背景、风格参考、Logo；角色与保真等级进入编译快照。

`PromptCompilerPanel` 只存在于 Agent。AI 图片页保持传统直接生图；模板页保持结构化配置。两页仅提供跳转 Agent 的轻入口，并携带当前提示词、参考图、模板与输出参数。修改需求、参考图、角色、Skill、输出设置或创意参数会使旧方案失效。

## 后端契约

- `GET /api/v1/creation-skills`：返回受控 Skill 摘要，不下发 prompt 规则。
- `POST /api/v1/prompts/compile`：只做预览和快照，不创建 Run/Job、不扣点、不调用图片引擎。
- `POST /api/v1/generations` 接受 `promptCompilationId` 与 `inputs.references`，校验快照属于当前租户，且生成模式、模板、参考图角色、比例、质量和数量均与确认时一致。
- 编译结果保存于 `prompt_compilations`；Run、Job 和 `inputParams` 保存快照 ID、最终用户编辑说明及参考图角色。
- Agent 确认请求通过受控请求头记录 `origin=agent`，模板和普通快速生成仍分别记录 `template` / `quick`。

准确品牌名、Logo、中文标题和卖点不要求图像模型绘制；海报模板保留排版安全区，由后续确定性文字层处理。

## 本轮验收边界

```text
npm run typecheck --workspaces --if-present  ✅
npm run lint                               ✅
npm run build -w @hitframe/shared -w @hitframe/api -w @hitframe/web ✅
git diff --check                            ✅
API_BASE_URL=http://localhost:3012/api/v1 node --env-file=.env scripts/accept/s6-creation.mjs ✅ 10/10
```

隔离验收覆盖：三模式差异、导演建议、编译快照版本/hash、四次编译落库、显式 Skill 携带参考图走 i2i、必填图片角色判断、输出参数/图片角色变化后旧编译拒绝，以及 Run/Job/CreditTransaction 计数不变。

本次自动验收前后计数均为 `Run 234 / Job 410 / CreditTransaction 608`，没有创建生成任务或扣点。

浏览器检查应确认：AI 图片页与模板页均不显示编译器或三模式；它们只能跳转 Agent。Agent 页显示 Skill、三模式、图片角色、保真等级、前后对照和确认按钮，控制台无错误。

本轮不把以下能力标记为完成：持久化多轮 Agent 会话、基于缺失字段的连续追问、独立多图分镜与 `generation-set` 执行、确定性文字合成层。`小红书多图组` 当前只完成 Skill 规划并阻止提交，不能用多个同参数候选图冒充图片组。这些属于后续 S6-Creation.2/3。

## 本地评审服务

- Web：`http://localhost:5173/#/generate`
- API：`http://localhost:3001/api/v1/health`

当前 `.env` 使用真实图片供应商。普通页面、Skill、路由和编译预览不调用图片引擎；自动化生成验收必须另起 `IMAGE_PROVIDER=fake` 隔离环境。
