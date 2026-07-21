/**
 * M2a S3 存储阶段验收（可重复运行）。
 * 前置：docker compose up -d（postgres + valkey + seaweedfs）；仓库根执行：
 *   node --env-file=.env scripts/accept/s3-storage.mjs
 * 覆盖：①新生成落 S3 ②稳定 URL /files/{key} → 302 签名直链 ③签名过期可刷新
 *      ④存量迁移三方一致（调迁移脚本）。fake Provider，零真实额度；结束回冲+核账。
 */
import { execSync, spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const TOKEN = process.env.API_TOKEN ?? 'dev-token-change-me';
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const BASE = 'http://localhost:3001/api/v1';
const MARK = `s3accept_${Date.now()}`;
// 小 TTL 便于验证「过期→刷新」；网关缓存头会随之收窄
const ENV = {
  ...process.env,
  IMAGE_PROVIDER: 'fake',
  EXECUTION_MODE: 'queue',
  STORAGE_DRIVER: 's3',
  SIGNED_URL_TTL: '5',
};

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
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
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
const gen = async () => {
  const r = await fetch(`${BASE}/generations`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      mode: 't2i',
      inputs: { prompt: `${MARK} 赛博朋克霓虹街景 电影感` },
      options: { ratio: '1:1', quality: 'standard', candidateCount: 1 },
      idempotencyKey: crypto.randomUUID(),
    }),
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
const balBefore = () => Number(psql("SELECT points_balance FROM tenants WHERE id='default'"));

async function main() {
  await startAll();
  const bal0 = balBefore();

  // ① 新生成落 S3
  const run = await waitRun((await gen()).runId);
  check('① 新生成成功', run.status === 'succeeded', `run=${run.status}`);
  const asset = psql(
    `SELECT id || '\t' || url || '\t' || (meta->>'storageKey') FROM assets WHERE source_job_id='${run.jobs[0].jobId}'`,
  );
  const [assetId, url, key] = asset.split('\t');
  check('① 资产 URL 为稳定网关路径', /\/files\//.test(url) && !/X-Amz/.test(url), url);

  // S3 中确实存在该对象（用迁移脚本的 SDK 无法在此进程直连，改走网关验证 200）
  // ② 稳定 URL → 302 → 签名直链（含 X-Amz-Signature）
  const gwUrl = `http://localhost:3001/files/${key}`;
  const r302 = await fetch(gwUrl, { redirect: 'manual' });
  const loc1 = r302.headers.get('location') ?? '';
  check(
    '② 网关 302 重定向到签名直链',
    r302.status === 302 && /X-Amz-Signature=/.test(loc1),
    `status=${r302.status}`,
  );
  // 跟随签名直链取到真实字节（PNG 魔数）
  const img = await fetch(loc1);
  const head = Buffer.from(await img.arrayBuffer()).subarray(0, 4).toString('hex');
  check('② 签名直链可取回图片字节', img.status === 200 && head.startsWith('89504e47'), `magic=${head}`);

  // ③ 过期→刷新：跨秒两次命中网关得到不同签名（SigV4 时间戳精度到秒）；旧签名过期 403；新签名 200
  await sleep(1200);
  const loc2 = (await fetch(gwUrl, { redirect: 'manual' })).headers.get('location') ?? '';
  check('③ 每次命中网关重新签名（跨秒）', loc1 !== loc2, `sig 变化=${loc1 !== loc2}`);
  await sleep(6000); // 超过 SIGNED_URL_TTL=5s
  const expired = await fetch(loc1);
  check('③ 旧签名过期被拒', expired.status === 403, `旧直链 status=${expired.status}`);
  const fresh = (await fetch(gwUrl, { redirect: 'manual' })).headers.get('location') ?? '';
  const freshOk = await fetch(fresh);
  check('③ 重新命中网关刷新签名可用', freshOk.status === 200, `新直链 status=${freshOk.status}`);

  // ④ 存量迁移三方一致（含本次新对象）
  let migPass = false;
  try {
    execSync(`node --env-file=.env scripts/migrate/local-to-s3.mjs --verify`, { stdio: 'pipe' });
    migPass = true;
  } catch {
    migPass = false;
  }
  check('④ 存量三方一致（--verify 通过）', migPass);

  // ---- 清场 + 回冲 + 核账 ----
  const localKey = psql(`SELECT meta->>'storageKey' FROM assets WHERE id='${assetId}'`);
  psql(`DELETE FROM assets WHERE id='${assetId}'`);
  execSync(`rm -f storage/${localKey}`, { shell: '/bin/bash' });
  const bal1 = balBefore();
  const spent = bal0 - bal1;
  if (spent > 0) {
    psql(
      `BEGIN; UPDATE tenants SET points_balance = points_balance + ${spent} WHERE id='default'; INSERT INTO credit_transactions (id,tenant_id,run_id,type,amount,balance_after,note) VALUES ('ct_${MARK}_refund','default','topup_${MARK}','topup',${spent},(SELECT points_balance FROM tenants WHERE id='default'),'S3 验收回冲'); COMMIT`,
    );
  }
  const [bal, sum] = psql(
    "SELECT (SELECT points_balance FROM tenants WHERE id='default') || '|' || (SELECT COALESCE(SUM(amount),0) FROM credit_transactions WHERE tenant_id='default')",
  ).split('|');
  check('账实恒等（清场后）', bal === sum, `${bal}=${sum}`);

  killAll();
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n==== S3 验收 ${passed}/${results.length} ====`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  killAll();
  process.exit(1);
});
