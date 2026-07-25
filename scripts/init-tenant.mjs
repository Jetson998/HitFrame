/**
 * 种子客户租户初始化（S6 交付）：为单租户部署设置/追加初始点数。
 *
 * M1/M2a 架构口径：系统当前按「一次部署 = 一个租户」交付（TENANT 写死在各
 * controller，ApiTokenGuard 只校验单一共享 API_TOKEN，不做按 token 的租户路由）。
 * 每个种子客户各自独立部署（各自 .env / 数据库 / API_TOKEN），因此本脚本只初始化
 * /追加当前部署里 tenants 表的那一行，不引入多租户路由。
 *
 * 记账口径（与 apps/api/drizzle/0003_opening_baseline.sql 一致）：
 * - 首次创建租户 → 写 opening 流水，balanceAfter = 初始点数；
 * - 租户已存在 → 追加点数须显式传 --topup，写 topup 流水（不会静默重复入账）；
 * - pointsBalance == Σ credit_transactions.amount 的不变量全程保持。
 *
 * 用法：
 *   node --env-file=.env scripts/init-tenant.mjs --name "客户名称" --points 500
 *   node --env-file=.env scripts/init-tenant.mjs --points 200 --topup   # 已有租户追加点数
 *   node --env-file=.env scripts/init-tenant.mjs --tenant-id acme --name "Acme" --points 1000
 *
 * 参数：
 *   --tenant-id  租户 ID，默认 default（M1 单租户口径下通常不需要改）
 *   --name       租户名称（首次创建必填）
 *   --points     初始点数（首次创建）或追加点数（--topup 时），必填，非负整数
 *   --topup      租户已存在时追加点数；不传且租户已存在则报错退出，不做任何写入
 */
import pg from 'pg';
import { randomUUID } from 'node:crypto';

function parseArgs(argv) {
  const out = { tenantId: 'default', topup: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tenant-id') out.tenantId = argv[++i];
    else if (a === '--name') out.name = argv[++i];
    else if (a === '--points') out.points = argv[++i];
    else if (a === '--topup') out.topup = true;
    else {
      console.error(`未知参数：${a}`);
      process.exit(1);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (args.points === undefined) {
  console.error('缺少必填参数 --points（初始点数，非负整数）');
  process.exit(1);
}
const points = Number(args.points);
if (!Number.isInteger(points) || points < 0) {
  console.error(`--points 必须是非负整数，收到：${args.points}`);
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://hitframe:hitframe@localhost:5432/hitframe',
});

try {
  const existing = await pool.query('SELECT points_balance FROM tenants WHERE id = $1', [
    args.tenantId,
  ]);

  if (existing.rowCount === 0) {
    // 首次创建：insert 租户 + opening 流水，同事务保证一致
    if (!args.name) {
      console.error(`租户 ${args.tenantId} 不存在，首次创建须提供 --name`);
      process.exit(1);
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO tenants (id, name, points_balance) VALUES ($1, $2, $3)',
        [args.tenantId, args.name, points],
      );
      await client.query(
        `INSERT INTO credit_transactions (id, tenant_id, run_id, job_id, type, amount, balance_after, note)
         VALUES ($1, $2, NULL, NULL, 'opening', $3, $3, $4)`,
        [`ct_opening_${args.tenantId}`, args.tenantId, points, `种子客户初始点数（init-tenant 写入）`],
      );
      await client.query('COMMIT');
      console.log(`已创建租户 ${args.tenantId}「${args.name}」，初始点数 ${points}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else if (args.topup) {
    // 追加点数：topup 流水 + 余额累加，同事务保证一致
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query(
        'UPDATE tenants SET points_balance = points_balance + $1 WHERE id = $2 RETURNING points_balance',
        [points, args.tenantId],
      );
      await client.query(
        `INSERT INTO credit_transactions (id, tenant_id, run_id, job_id, type, amount, balance_after, note)
         VALUES ($1, $2, NULL, NULL, 'topup', $3, $4, $5)`,
        [
          `ct_topup_${randomUUID()}`,
          args.tenantId,
          points,
          updated.rows[0].points_balance,
          `种子客户追加点数（init-tenant --topup 写入）`,
        ],
      );
      await client.query('COMMIT');
      console.log(
        `已为租户 ${args.tenantId} 追加 ${points} 点，当前余额 ${updated.rows[0].points_balance}`,
      );
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else {
    console.error(
      `租户 ${args.tenantId} 已存在（当前余额 ${existing.rows[0].points_balance}）。` +
        `如需追加点数请显式传 --topup，避免误操作重复初始化。`,
    );
    process.exit(1);
  }
} finally {
  await pool.end();
}
