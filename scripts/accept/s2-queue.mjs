/**
 * M2a S2 破坏性验收套件（可重复运行）。
 * 前置：docker compose up -d（postgres + valkey）；仓库根目录执行：
 *   node --env-file=.env scripts/accept/s2-queue.mjs
 * 要求 EXECUTION_MODE=queue；脚本自管 API/Worker 进程（fake Provider，零真实额度）。
 * 覆盖评审「S2 必验场景」10 项；结束自动清理测试数据并核对账实恒等。
 */
import { execSync, spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const TOKEN = process.env.API_TOKEN ?? 'dev-token-change-me';
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const BASE = 'http://localhost:3001/api/v1';
const ENV = { ...process.env, IMAGE_PROVIDER: 'fake', EXECUTION_MODE: 'queue' };
const MARK = `s2accept_${Date.now()}`;

let api = null;
let worker = null;
const results = [];

const psql = (q) =>
  execSync(
    `docker exec -i $(docker ps --format '{{.Names}}' | grep postgres) psql -U hitframe -d hitframe -t -A`,
    { shell: '/bin/bash', input: q },
  )
    .toString()
    .trim();

const startApi = async () => {
  api = spawn('node', ['apps/api/dist/main.js'], { env: ENV, stdio: 'ignore' });
  await waitHttp();
};
const startWorker = async () => {
  worker = spawn('node', ['apps/api/dist/worker-main.js'], { env: ENV, stdio: 'ignore' });
  await sleep(1500);
};
const killApi = () => { api?.kill('SIGKILL'); api = null; };
const killWorker = (sig = 'SIGKILL') => { worker?.kill(sig); worker = null; };
const waitHttp = async () => {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/health`); if (r.ok) return; } catch { /* retry */ }
    await sleep(400);
  }
  throw new Error('API 未就绪');
};

const gen = async (prompt, { count = 1, quality = 'standard', mode = 't2i', extra = {} } = {}) => {
  const r = await fetch(`${BASE}/generations`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      mode, inputs: { prompt: `${MARK} ${prompt}` },
      options: { ratio: '1:1', quality, candidateCount: count },
      idempotencyKey: crypto.randomUUID(), ...extra,
    }),
  });
  return { status: r.status, data: (await r.json()).data };
};
const runStatus = async (runId) =>
  (await (await fetch(`${BASE}/runs/${runId}`, { headers: H })).json()).data;
const waitRun = async (runId, timeoutMs = 60_000) => {
  const t0 = Date.now();
  for (;;) {
    await sleep(600);
    const r = await runStatus(runId);
    if (['succeeded', 'failed', 'partial'].includes(r.status)) return r;
    if (Date.now() - t0 > timeoutMs) throw new Error(`run ${runId} 超时未终态`);
  }
};
const balance = async () =>
  (await (await fetch(`${BASE}/me`, { headers: H })).json()).data.pointsBalance;
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? `　${detail}` : ''}`);
};
const ledgerEq = () => {
  const [bal, sum] = psql(
    "SELECT (SELECT points_balance FROM tenants WHERE id='default') || '|' || (SELECT COALESCE(SUM(amount),0) FROM credit_transactions WHERE tenant_id='default')",
  ).split('|');
  return { ok: bal === sum, bal, sum };
};

// ---------- 场景 ----------

// 1. PG 提交后、queue.add 前杀 API → Reconciler 补投
async function s1_outboxRedeliver() {
  // 直接 SQL 伪造「已提交未入队」：插 run+job（pending）+hold —— 等价于 add 前崩溃现场
  const runId = `run_${MARK}_outbox`;
  const jobId = `job_${MARK}_outbox`;
  psql(`INSERT INTO generation_runs (id, tenant_id, mode, origin, candidate_count, idempotency_key, request_params, status) VALUES ('${runId}','default','t2i','quick',1,'${MARK}-outbox','{}','queued')`);
  psql(`INSERT INTO generation_jobs (id, run_id, tenant_id, mode, endpoint, input_params, status, enqueue_state) VALUES ('${jobId}','${runId}','default','t2i','generations','{"prompt":"${MARK} outbox 补投","size":"1024x1024","quality":"standard","slots":[]}','queued','pending')`);
  psql(`BEGIN; UPDATE tenants SET points_balance = points_balance - 2 WHERE id='default'; INSERT INTO credit_transactions (id,tenant_id,run_id,type,amount,balance_after,note) VALUES ('ct_${MARK}_outbox','default','${runId}','hold',-2,(SELECT points_balance FROM tenants WHERE id='default'),'accept'); COMMIT`);
  const run = await waitRun(runId, 60_000); // Reconciler 周期 30s + 执行
  check('1 outbox 补投（add 前崩溃）', run.status === 'succeeded', `run=${run.status}`);
}

// 2. 同一 jobId 重复投递 → Provider 只调用一次（结果只产 1 份资产）
async function s2_duplicateDelivery() {
  const { data } = await gen('重复投递', {});
  const run = await waitRun(data.runId);
  const jobId = run.jobs[0].jobId;
  // 终态后手工再投一次同 jobId（BullMQ jobId 幂等本身会拒绝，改用直发绕过以测 CAS 兜底）
  const { Queue } = await import('bullmq');
  const q = new Queue('hitframe-generation', { connection: { host: '127.0.0.1', port: 6379, maxRetriesPerRequest: null } });
  await q.add('generate', { jobId, runId: data.runId }, { jobId: `${jobId}-dup` });
  await sleep(2500); await q.close();
  const assets = psql(`SELECT count(*) FROM assets WHERE source_job_id='${jobId}'`);
  check('2 重复投递不重复执行', assets === '1', `资产=${assets}`);
}

// 3. 两个执行者抢同一 Job → 仅一个 CAS 成功（DB 层验证）
async function s3_casRace() {
  const jobId = `job_${MARK}_cas`;
  psql(`INSERT INTO generation_runs (id, tenant_id, mode, origin, candidate_count, idempotency_key, request_params, status) VALUES ('run_${MARK}_cas','default','t2i','quick',1,'${MARK}-cas','{}','queued')`);
  psql(`INSERT INTO generation_jobs (id, run_id, tenant_id, mode, endpoint, input_params, status, enqueue_state) VALUES ('${jobId}','run_${MARK}_cas','default','t2i','generations','{}','queued','enqueued')`);
  // 两个并发 CAS：只有一个应返回行
  const winners = psql(`
    WITH a AS (UPDATE generation_jobs SET status='running', attempts=attempts+1 WHERE id='${jobId}' AND status='queued' RETURNING 1),
         b AS (UPDATE generation_jobs SET status='running', attempts=attempts+1 WHERE id='${jobId}' AND status='queued' RETURNING 1)
    SELECT (SELECT count(*) FROM a) + (SELECT count(*) FROM b)`);
  const attempts = psql(`SELECT attempts FROM generation_jobs WHERE id='${jobId}'`);
  check('3 双执行者 CAS 抢占', winners === '1' && attempts === '1', `胜者=${winners} attempts=${attempts}`);
  psql(`UPDATE generation_jobs SET status='failed', error='accept cleanup', error_kind='non_retryable' WHERE id='${jobId}'`);
  psql(`UPDATE generation_runs SET status='failed' WHERE id='run_${MARK}_cas'`);
}

// 4. Worker 执行中被杀 → 重启后 stalled/retry 恢复
async function s4_workerCrashRecovery() {
  const { data } = await gen('执行中崩溃 [slow:8000]', {});
  await sleep(2500); // 等 Worker 领走并进入执行
  killWorker('SIGKILL');
  await startWorker(); // 新 Worker：BullMQ stalled 重投 → claim(running 恢复)
  const run = await waitRun(data.runId, 90_000);
  check('4 Worker 崩溃恢复', run.status === 'succeeded', `run=${run.status}`);
}

// 5. retryable ≤3 次重试，最终失败只退款一次
async function s5_retryExhaust() {
  const b0 = await balance();
  const { data } = await gen('持续失败 [fail]', {});
  const run = await waitRun(data.runId, 90_000); // 退避 5s/10s
  const jobId = run.jobs[0].jobId;
  const attempts = psql(`SELECT attempts FROM generation_jobs WHERE id='${jobId}'`);
  const refunds = psql(`SELECT count(*) FROM credit_transactions WHERE job_id='${jobId}' AND type='refund'`);
  const b1 = await balance();
  check('5 retryable 重试耗尽单次退款', run.status === 'failed' && attempts === '3' && refunds === '1' && b1 === b0,
    `attempts=${attempts} refunds=${refunds} 余额 ${b0}→${b1}`);
}

// 6. non_retryable / moderation 不重试
async function s6_noRetryKinds() {
  const { data: d1 } = await gen('注入 [fail:non_retryable]', {});
  const { data: d2 } = await gen('注入 [fail:moderation]', {});
  const [r1, r2] = [await waitRun(d1.runId), await waitRun(d2.runId)];
  const a1 = psql(`SELECT attempts FROM generation_jobs WHERE id='${r1.jobs[0].jobId}'`);
  const a2 = psql(`SELECT attempts FROM generation_jobs WHERE id='${r2.jobs[0].jobId}'`);
  const k2 = psql(`SELECT error_kind FROM generation_jobs WHERE id='${r2.jobs[0].jobId}'`);
  check('6 non_retryable/moderation 不重试', a1 === '1' && a2 === '1' && k2 === 'moderation_rejected',
    `attempts=${a1}/${a2} kind=${k2}`);
}

// 7. API 重启不影响执行中的 Worker
async function s7_apiRestartDuringRun() {
  const { data } = await gen('API 重启期执行 [slow:6000]', {});
  await sleep(1500);
  killApi();
  await sleep(3000); // Worker 独立执行中
  await startApi();
  const run = await waitRun(data.runId, 60_000);
  check('7 API 重启不影响 Worker', run.status === 'succeeded', `run=${run.status}`);
}

// 8. Worker 停机时 API 仍接单存 pending，Worker 回来后消化
async function s8_acceptWhileWorkerDown() {
  killWorker('SIGTERM');
  await sleep(1000);
  const { status, data } = await gen('worker 停机期接单', {});
  const stillQueued = (await runStatus(data.runId)).status;
  await startWorker();
  const run = await waitRun(data.runId, 60_000);
  check('8 Worker 停机 API 照常接单', status === 202 && ['queued', 'running'].includes(stillQueued) && run.status === 'succeeded',
    `202=${status === 202} 停机时=${stillQueued} 最终=${run.status}`);
}

// 9. partial：candidateCount=2 一半成功——成功 settle、失败 refund
async function s9_partialSettlement() {
  const b0 = await balance();
  const { data } = await gen('部分成功 [fail:alternate]', { count: 2 });
  const run = await waitRun(data.runId, 60_000);
  const settles = psql(`SELECT count(*) FROM credit_transactions WHERE run_id='${data.runId}' AND type='settle'`);
  const refunds = psql(`SELECT count(*) FROM credit_transactions WHERE run_id='${data.runId}' AND type='refund'`);
  const b1 = await balance();
  check('9 partial 分别结算/退还', run.status === 'partial' && settles === '1' && refunds === '1' && b0 - b1 === 2,
    `run=${run.status} settle=${settles} refund=${refunds} 净扣=${b0 - b1}`);
}

// 10. 三链路复验 + 全程账实恒等
async function s10_threeChainsAndLedger() {
  const src = psql(`SELECT id FROM assets WHERE type='source' LIMIT 1`);
  const cases = [
    gen('链路复验 t2i', { count: 2 }),
    gen('链路复验 i2i', { mode: 'i2i', extra: { inputs: { slots: [src], prompt: `${MARK} i2i` } } }),
    gen('链路复验 tpl', { mode: 'template', extra: { templateId: 'tpl_bg', inputs: { slots: [src], vars: { bgStyle: '纯色背景', light: '柔光' } } } }),
  ];
  const accepted = await Promise.all(cases);
  const runs = await Promise.all(accepted.map((a) => waitRun(a.data.runId)));
  const allOk = runs.every((r) => r.status === 'succeeded');
  const led = ledgerEq();
  check('10 queue 模式三链路 + 账实恒等', allOk && led.ok,
    `${runs.map((r) => r.status).join('/')} 账 ${led.bal}=${led.sum}`);
}

// ---------- 主流程 ----------
const t0 = Date.now();
console.log(`S2 验收开始（fake Provider · queue 模式）标记 ${MARK}`);
let bal0 = '0';
try {
  await startApi();
  await startWorker();
  bal0 = psql(`SELECT points_balance FROM tenants WHERE id='default'`);
  await s3_casRace();
  await s2_duplicateDelivery();
  await s5_retryExhaust();
  await s6_noRetryKinds();
  await s9_partialSettlement();
  await s4_workerCrashRecovery();
  await s7_apiRestartDuringRun();
  await s8_acceptWhileWorkerDown();
  await s1_outboxRedeliver();
  await s10_threeChainsAndLedger();
} finally {
  // 清场：删测试资产（行+文件）→ 起止差额 topup 回冲 → 终核账实恒等
  try {
    const keys = psql(`SELECT meta->>'storageKey' FROM assets WHERE gen_params->>'prompt' LIKE '%${MARK}%'`).split('\n').filter(Boolean);
    for (const k of keys) execSync(`rm -f "storage/${k}"`);
    psql(`DELETE FROM assets WHERE gen_params->>'prompt' LIKE '%${MARK}%'`);
    const diff = Number(bal0) - Number(psql(`SELECT points_balance FROM tenants WHERE id='default'`));
    if (diff > 0) {
      psql(`BEGIN; UPDATE tenants SET points_balance = points_balance + ${diff} WHERE id='default'; INSERT INTO credit_transactions (id, tenant_id, run_id, job_id, type, amount, balance_after, note) VALUES ('ct_topup_${MARK}', 'default', 'topup_${MARK}', NULL, 'topup', ${diff}, (SELECT points_balance FROM tenants WHERE id='default'), 'S2 验收消耗回冲'); COMMIT`);
    }
    const led = ledgerEq();
    console.log(`清场完成：回冲 ${Math.max(diff, 0)} 点，终核 ${led.bal}=${led.sum} ${led.ok ? '✅' : '❌'}`);
  } catch (e) { console.error('清场异常（手工检查）:', String(e).slice(0, 200)); }
  killApi(); killWorker();
}
const passed = results.filter((r) => r.ok).length;
console.log(`\n结果：${passed}/${results.length} 通过 · 耗时 ${Math.round((Date.now() - t0) / 1000)}s`);
process.exit(passed === results.length ? 0 : 1);
