/**
 * 死信诊断（S4.3，只读，不改账）。
 * 用法：node --env-file=.env scripts/ops/dead-letters.mjs [--limit N]
 *
 * 口径（评审拍板：重放仅诊断，不改账）：
 * - retryable 重试耗尽的 Job 在终态失败时已「自动退款」（S2 场景5），hold 已回退；
 * - 因此死信「不做程序化重放」——重放成功会让用户白得一张图，且 credit_tx
 *   单发键 (tenant,run,job,type) 不允许二次 hold；
 * - 用户侧恢复 = 前端重新发起一单（走正常 hold/settle）。
 * 本脚本仅列举 BullMQ failed 集合 + DB failed Job（含脱敏 errorCode），供排障/告警。
 */
import { Queue } from 'bullmq';
import { execSync } from 'node:child_process';

const LIMIT = Number(process.argv[process.argv.indexOf('--limit') + 1]) || 50;

const psql = (q) =>
  execSync(
    `docker exec -i $(docker ps --format '{{.Names}}' | grep postgres) psql -U hitframe -d hitframe -t -A`,
    { shell: '/bin/bash', input: q },
  )
    .toString()
    .trim();

async function main() {
  const q = new Queue('hitframe-generation', {
    connection: {
      host: process.env.REDIS_HOST ?? '127.0.0.1',
      port: Number(process.env.REDIS_PORT ?? 6379),
      maxRetriesPerRequest: null,
    },
  });

  const counts = await q.getJobCounts('failed', 'completed', 'active', 'waiting', 'delayed');
  console.log('==== BullMQ 队列计数 ====');
  console.log(JSON.stringify(counts));

  const failed = await q.getJobs(['failed'], 0, LIMIT - 1);
  console.log(`\n==== 死信（failed 集合，最多 ${LIMIT}） ====`);
  if (failed.length === 0) console.log('（空）');
  for (const j of failed) {
    console.log(
      `- queueJobId=${j.id} jobId=${j.data?.jobId} runId=${j.data?.runId} attemptsMade=${j.attemptsMade} reason=${(j.failedReason ?? '').slice(0, 80)}`,
    );
  }
  await q.close();

  // DB 侧 failed Job 的脱敏 errorCode 分布（对账 + 告警口径）
  console.log('\n==== DB failed Job errorCode 分布 ====');
  const dist = psql(
    `SELECT COALESCE(error_code,'(null)') || ' : ' || count(*) FROM generation_jobs WHERE status='failed' GROUP BY error_code ORDER BY count(*) DESC;`,
  );
  console.log(dist || '（无 failed Job）');

  console.log(
    '\n提示：死信不做程序化重放（避免白得图 / 账实破坏）。用户恢复请前端重新发起一单。',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
