/**
 * M1 种子数据：默认租户（点数）+ 商品换背景模板（NodeTemplate，M3 前以种子维护）。
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

const tplBg = {
  id: 'tpl_bg',
  sceneType: 'bg',
  endpoint: 'edits',
  slots: [{ key: 'product', label: '商品图', required: true }],
  varsSchema: [
    { key: 'bgStyle', label: '背景风格', required: false, default: '木质桌面' },
    { key: 'light', label: '光影氛围', required: false, default: '柔光' },
  ],
  promptTemplate: '保持图中商品主体不变，背景替换为{bgStyle}，{light}，电商主图风格，高质感',
  defaultParams: { inputFidelity: 'high' },
};

await pool.query(
  `INSERT INTO node_templates (id, scene_type, endpoint, slots, vars_schema, prompt_template, default_params, version)
   VALUES ($1,$2,$3,$4,$5,$6,$7,1)
   ON CONFLICT (id) DO UPDATE SET
     slots = EXCLUDED.slots, vars_schema = EXCLUDED.vars_schema,
     prompt_template = EXCLUDED.prompt_template, default_params = EXCLUDED.default_params,
     version = node_templates.version + 1, updated_at = now()`,
  [
    tplBg.id,
    tplBg.sceneType,
    tplBg.endpoint,
    JSON.stringify(tplBg.slots),
    JSON.stringify(tplBg.varsSchema),
    tplBg.promptTemplate,
    JSON.stringify(tplBg.defaultParams),
  ],
);

const { rows } = await pool.query(
  `SELECT (SELECT points_balance FROM tenants WHERE id='default') AS balance,
          (SELECT count(*) FROM node_templates) AS templates`,
);
console.log(`seeded: tenant balance=${rows[0].balance}, templates=${rows[0].templates}`);
await pool.end();
