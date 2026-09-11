/**
 * M1 种子数据：默认租户（点数）+ 三场景模板（NodeTemplate，M3 前以种子维护）。
 * 运行：node --env-file=.env scripts/seed.mjs（可重复执行，upsert 语义）
 */
import pg from 'pg';

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://hitframe:hitframe@localhost:5432/hitframe',
});

await pool.query(
  `INSERT INTO tenants (id, name, points_balance) VALUES ('default', 'HitFrame Dev', 500)
   ON CONFLICT (id) DO NOTHING`,
);

await pool.query(
  `INSERT INTO projects (id, tenant_id, name) VALUES ('proj_default', 'default', '默认项目')
   ON CONFLICT (id) DO NOTHING`,
);

const tplBg = {
  id: 'tpl_bg',
  title: '商品换背景',
  description: '一张商品图，分钟级换出 N 套场景/背景，替代外包摄影精修。',
  sceneType: 'bg',
  endpoint: 'edits',
  slots: [{ key: 'product', label: '商品图', required: true }],
  varsSchema: [
    {
      key: 'bgStyle',
      label: '背景风格',
      required: false,
      default: '木质桌面',
      type: 'chips',
      options: ['木质桌面', '大理石台面', 'ins 柔光', '纯色背景', '节日氛围'],
    },
    {
      key: 'light',
      label: '光影氛围',
      required: false,
      default: '柔光',
      type: 'chips',
      options: ['自然光', '柔光', '暖光', '冷光'],
    },
  ],
  promptTemplate:
    '以 Image 1 为唯一商品主体，保持其外观、比例、材质、包装文字与品牌标识不变，背景替换为{bgStyle}，{light}，电商主图风格，高质感',
  defaultParams: { inputFidelity: 'high' },
};

const tplModel = {
  id: 'tpl_model',
  title: '模特上身 / 真人试穿',
  description: '服装/配饰商品图 + 可选模特参考，生成模特上身效果图，用于电商详情页/营销素材。',
  sceneType: 'model',
  endpoint: 'edits',
  slots: [
    { key: 'product', label: '服装/商品图', required: true },
    { key: 'modelRef', label: '模特参考图（可选）', required: false },
  ],
  varsSchema: [
    {
      key: 'modelType',
      label: '人物风格',
      required: false,
      default: '时尚模特',
      type: 'chips',
      options: ['时尚模特', '日常穿搭', '运动健身', '商务正装', '街头潮流'],
    },
    {
      key: 'pose',
      label: '姿态',
      required: false,
      default: '自然站姿',
      type: 'chips',
      options: ['自然站姿', '侧身展示', '动态pose', '半身特写'],
    },
    {
      key: 'scene',
      label: '场景',
      required: false,
      default: '纯色背景',
      type: 'chips',
      options: ['纯色背景', '室内场景', '户外街景', '工作室'],
    },
  ],
  promptTemplate:
    'Image 1 是必须准确保留版型、颜色、材质、纹理与标识的服装或商品；若提供 Image 2，则 Image 2 是必须保持身份、面部、发型与体态的模特参考。让{modelType}自然穿着 Image 1 中的服装，{pose}，{scene}，服装与人体结构贴合真实，时尚摄影，高质感，电商主图风格',
  defaultParams: { inputFidelity: 'high' },
};

const tplPoster = {
  id: 'tpl_poster',
  title: '电商海报 / 小红书封面',
  description: '商品图 + 标题/卖点，生成营销海报或小红书封面图，直接可用于投放。',
  sceneType: 'poster',
  endpoint: 'edits',
  slots: [{ key: 'product', label: '商品图', required: true }],
  varsSchema: [
    {
      key: 'title',
      label: '标题文案',
      required: true,
      default: '',
      type: 'text',
      placeholder: '例如：夏日新品 / 限时特惠',
    },
    {
      key: 'sellingPoint',
      label: '核心卖点',
      required: false,
      default: '',
      type: 'text',
      placeholder: '例如：买二送一 / 全场包邮',
    },
    {
      key: 'style',
      label: '设计风格',
      required: false,
      default: '简约现代',
      type: 'chips',
      options: ['简约现代', '国潮风', '小清新', '高端奢华', '活力撞色'],
    },
  ],
  promptTemplate:
    '以 Image 1 为唯一商品主体并保持产品外观、包装文字与品牌标识准确，{style}风格电商营销海报，商品主体清晰突出，围绕标题「{title}」和卖点「{sellingPoint}」形成完整、饱满、有视觉冲击力的画面；不要生成、改写或臆造任何中文标题、卖点、Logo 或随机文字',
  defaultParams: { inputFidelity: 'high' },
};

const templates = [tplBg, tplModel, tplPoster];

for (const tpl of templates) {
  await pool.query(
    `INSERT INTO node_templates (id, title, description, scene_type, endpoint, slots, vars_schema, prompt_template, default_params, version)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title, description = EXCLUDED.description,
       slots = EXCLUDED.slots, vars_schema = EXCLUDED.vars_schema,
       prompt_template = EXCLUDED.prompt_template, default_params = EXCLUDED.default_params,
       version = node_templates.version + 1, updated_at = now()`,
    [
      tpl.id,
      tpl.title,
      tpl.description,
      tpl.sceneType,
      tpl.endpoint,
      JSON.stringify(tpl.slots),
      JSON.stringify(tpl.varsSchema),
      tpl.promptTemplate,
      JSON.stringify(tpl.defaultParams),
    ],
  );
}

const { rows } = await pool.query(
  `SELECT (SELECT points_balance FROM tenants WHERE id='default') AS balance,
          (SELECT count(*) FROM node_templates) AS templates`,
);
console.log(`seeded: tenant balance=${rows[0].balance}, templates=${rows[0].templates}`);
await pool.end();
