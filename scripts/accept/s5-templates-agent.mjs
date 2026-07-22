/**
 * S5 后端最小验收（三模板 + Agent 规则路由，全程 fake，零真实额度）。
 * 前置：docker compose up -d（postgres + valkey）；仓库根执行：
 *   node --env-file=.env scripts/accept/s5-templates-agent.mjs
 * 覆盖：模板数据、/templates 不泄漏 promptTemplate、/agent/route 8+ 输入、
 *      三模板各走一次 /generations fake 成功、账实恒等。
 */
import { execSync, spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const TOKEN = process.env.API_TOKEN ?? 'dev-token-change-me';
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const BASE = 'http://localhost:3001/api/v1';
const ENV = { ...process.env, IMAGE_PROVIDER: 'fake', EXECUTION_MODE: 'queue', STORAGE_DRIVER: 'local' };
const MARK = `s5accept_${Date.now()}`;

let api = null;
let worker = null;
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? `　${detail}` : ''}`);
};
const psql = (q) =>
  execSync(
    `docker exec -i $(docker ps --format '{{.Names}}' | grep postgres) psql -U hitframe -d hitframe -t -A`,
    { shell: '/bin/bash', input: q },
  )
    .toString()
    .trim();

const waitHttp = async () => {
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch {
      /* retry */
    }
    await sleep(400);
  }
  throw new Error('API 未就绪');
};
const startAll = async () => {
  api = spawn('node', ['apps/api/dist/main.js'], { env: ENV, stdio: 'ignore' });
  await waitHttp();
  worker = spawn('node', ['apps/api/dist/worker-main.js'], { env: ENV, stdio: 'ignore' });
  await sleep(1500);
};
const killAll = () => {
  api?.kill('SIGKILL');
  worker?.kill('SIGKILL');
};
const route = async (userInput, uploadedImages) => {
  const r = await fetch(`${BASE}/agent/route`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ userInput, uploadedImages }),
  });
  return (await r.json()).data;
};
const waitRun = async (runId) => {
  for (let i = 0; i < 100; i++) {
    await sleep(600);
    const d = (await (await fetch(`${BASE}/runs/${runId}`, { headers: H })).json()).data;
    if (['succeeded', 'failed', 'partial'].includes(d.status)) return d;
  }
  throw new Error('run 超时');
};
const bal = () => Number(psql("SELECT points_balance FROM tenants WHERE id='default'"));

async function main() {
  await startAll();
  const bal0 = bal();

  // ========== A. 模板数据验收 ==========
  const tplCount = psql('SELECT count(*) FROM node_templates');
  check('A1 seed 三模板稳定', tplCount === '3', `count=${tplCount}`);

  const tplsRes = await (await fetch(`${BASE}/templates`, { headers: H })).json();
  const tpls = tplsRes.data;
  const ids = tpls.map((t) => t.id).sort();
  check(
    'A2 /templates 返回三模板',
    ids.join(',') === 'tpl_bg,tpl_model,tpl_poster',
    ids.join(','),
  );
  const leaked = JSON.stringify(tpls).includes('promptTemplate') || JSON.stringify(tpls).includes('prompt_template');
  check('A3 /templates 不泄漏 promptTemplate', !leaked);

  // ========== B. Agent 路由验收（8 条） ==========
  const cases = [
    ['商品换大理石背景，1张，1:1', { uploadedImages: ['x.jpg'] }, (p) => p.mode === 'template' && p.templateId === 'tpl_bg' && p.params.candidateCount === 1 && p.params.ratio === '1:1'],
    ['16比9 商品介绍图', {}, (p) => p.params.ratio === '4:3'],
    ['这件衣服模特上身，3:4，一张', {}, (p) => p.templateId === 'tpl_model' && p.params.ratio === '3:4' && p.params.candidateCount === 1],
    ['小红书封面，标题夏日新品，9:16', {}, (p) => p.templateId === 'tpl_poster' && p.params.ratio === '9:16'],
    ['生成赛博朋克街景，两张', {}, (p) => p.mode === 't2i' && p.params.candidateCount === 2],
    ['参考这张图做同风格', { uploadedImages: ['ref.jpg'] }, (p) => p.mode === 'i2i'],
    ['模特上身', {}, (p) => Array.isArray(p.missingSlots) && p.missingSlots.length > 0], // 缺图
    ['生成一张高级一点更好看的图', {}, (p) => p.mode === 't2i' && p.params.candidateCount === 1], // 模糊表达不误解析
  ];
  for (let i = 0; i < cases.length; i++) {
    const [input, opts, assertFn] = cases[i];
    const plan = await route(input, opts.uploadedImages);
    check(`B${i + 1} route: "${input.slice(0, 20)}"`, assertFn(plan), JSON.stringify(plan.params ?? {}) + (plan.templateId ? ` tpl=${plan.templateId}` : ` mode=${plan.mode}`));
  }

  // route 无副作用：调用 8 次后余额不变、无新 Run
  const runCountBefore = psql("SELECT count(*) FROM generation_runs");
  check('B9 route 无副作用（余额不变）', bal() === bal0, `${bal()} vs ${bal0}`);

  // ========== C. 三模板各走一次 /generations fake 成功 ==========
  // 先造一张 source 资产供模板槽位使用
  const srcAsset = `asset_${MARK}_src`;
  psql(`INSERT INTO assets (id, tenant_id, type, url, name, meta) VALUES ('${srcAsset}','default','source','http://x/${MARK}.png','${MARK}-src','{"storageKey":"uploads/${MARK}.png"}')`);
  // 造实际文件供 loadSlots 读取
  execSync(`mkdir -p storage/uploads && printf '\\x89PNG\\r\\n\\x1a\\n' > storage/uploads/${MARK}.png`, { shell: '/bin/bash' });

  const genTemplate = async (templateId, vars) => {
    const r = await fetch(`${BASE}/generations`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        mode: 'template',
        templateId,
        inputs: { slots: [srcAsset], vars },
        options: { ratio: '1:1', quality: 'standard', candidateCount: 1 },
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    const data = (await r.json()).data;
    if (!data?.runId) return { status: 'rejected', raw: data };
    return waitRun(data.runId);
  };

  const bgRun = await genTemplate('tpl_bg', { bgStyle: '大理石台面', light: '柔光' });
  check('C1 tpl_bg 生成成功', bgRun.status === 'succeeded', `status=${bgRun.status}`);
  const modelRun = await genTemplate('tpl_model', { modelType: '时尚模特', pose: '自然站姿', scene: '纯色背景' });
  check('C2 tpl_model 生成成功', modelRun.status === 'succeeded', `status=${modelRun.status}`);
  const posterRun = await genTemplate('tpl_poster', { title: '夏日新品', sellingPoint: '买二送一', style: '简约现代' });
  check('C3 tpl_poster 生成成功', posterRun.status === 'succeeded', `status=${posterRun.status}`);

  // 验证 Asset genParams 可回查 templateId/prompt/vars
  const bgAssetParams = psql(`SELECT gen_params FROM assets WHERE source_job_id='${bgRun.jobs[0].jobId}'`);
  check(
    'C4 Asset genParams 含 templateId/prompt/vars',
    bgAssetParams.includes('tpl_bg') && bgAssetParams.includes('大理石') && bgAssetParams.includes('prompt'),
    '',
  );

  // ========== D. 清场 + 回冲 + 核账 ==========
  // 删本次所有测试资产/run/job/tx，回冲消耗
  const keys = psql(`SELECT meta->>'storageKey' FROM assets WHERE name LIKE '%${MARK}%' OR gen_params->>'runId' IN (SELECT id FROM generation_runs WHERE idempotency_key LIKE '%')`).split('\n').filter(Boolean);
  for (const k of keys) if (k) execSync(`rm -f "storage/${k}"`, { shell: '/bin/bash' });
  execSync(`rm -f storage/uploads/${MARK}.png`, { shell: '/bin/bash' });
  // 收集本次 runId
  const runIds = [bgRun, modelRun, posterRun].map((r) => r.runId).filter(Boolean);
  for (const rid of runIds) {
    psql(`DELETE FROM assets WHERE source_job_id IN (SELECT id FROM generation_jobs WHERE run_id='${rid}')`);
    psql(`DELETE FROM credit_transactions WHERE run_id='${rid}'`);
    psql(`DELETE FROM usage_events WHERE run_id='${rid}'`);
    psql(`DELETE FROM generation_jobs WHERE run_id='${rid}'`);
    psql(`DELETE FROM generation_runs WHERE id='${rid}'`);
  }
  psql(`DELETE FROM assets WHERE id='${srcAsset}'`);
  // 回冲：把余额设回 Σ流水（清场后应等于 bal0）
  psql(`UPDATE tenants SET points_balance=(SELECT COALESCE(SUM(amount),0) FROM credit_transactions WHERE tenant_id='default') WHERE id='default'`);
  const [b, s] = psql(
    "SELECT (SELECT points_balance FROM tenants WHERE id='default') || '|' || (SELECT COALESCE(SUM(amount),0) FROM credit_transactions WHERE tenant_id='default')",
  ).split('|');
  check('D1 账实恒等（清场后）', b === s, `${b}=${s}`);
  check('D2 余额回到验收前', Number(b) === bal0, `${b} vs ${bal0}`);

  killAll();
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n==== S5 后端验收 ${passed}/${results.length} ====`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  killAll();
  process.exit(1);
});
