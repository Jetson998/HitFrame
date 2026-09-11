/**
 * S6-Creation 最小验收：提示词编译、模式差异、快照可追溯与零业务副作用。
 * 前置：构建 API，并启动 HitFrame API（默认 http://localhost:3001）。
 *   node --env-file=.env scripts/accept/s6-creation.mjs
 */
import { execSync } from 'node:child_process';

const TOKEN = process.env.API_TOKEN ?? 'dev-token-change-me';
const BASE = process.env.API_BASE_URL ?? 'http://localhost:3001/api/v1';
const H = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
const mark = `s6c_${Date.now()}`;
const psql = (query) =>
  execSync(
    `docker exec -i $(docker ps --format '{{.Names}}' | grep postgres) psql -U hitframe -d hitframe -t -A`,
    { shell: '/bin/bash', input: query },
  )
    .toString()
    .trim();
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? `  ${detail}` : ''}`);
};

async function post(path, payload) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  return { response, body };
}

async function compile(mode, rawPrompt, overrides = {}) {
  const { response, body } = await post('/prompts/compile', {
    mode,
    generationMode: 't2i',
    rawPrompt,
    skillId: 'skill_general_image',
    controls: { ratio: '1:1', quality: 'standard', candidateCount: 1 },
    ...overrides,
  });
  if (!response.ok) throw new Error(JSON.stringify(body));
  return body.data;
}

async function main() {
  const before = psql(
    "SELECT (SELECT count(*) FROM generation_runs) || '|' || (SELECT count(*) FROM generation_jobs) || '|' || (SELECT count(*) FROM credit_transactions)",
  );
  const raw = await compile('raw', `原样验收 ${mark}`);
  const enhanced = await compile('enhance', `商品换成大理石背景 ${mark}`);
  const director = await compile('director', `为耳机做科技产品广告 ${mark}`);
  const referenceCompilation = await compile('enhance', `保持商品主体 ${mark}`, {
    generationMode: 'i2i',
    skillId: 'skill_product_atmosphere',
    references: [{ assetId: 'accept-ref', role: 'product', fidelity: 'strict' }],
  });

  check(
    'raw 保留原始需求且无需确认',
    raw.compiledPrompt.includes(mark) && !raw.requiresConfirmation,
  );
  check(
    'enhance 增加执行细节且需要确认',
    enhanced.requiresConfirmation &&
      enhanced.changeSummary.length > 0 &&
      enhanced.compiledPrompt !== enhanced.rawPrompt,
  );
  check(
    'director 输出创意建议且需要确认',
    director.requiresConfirmation &&
      !!director.directorSuggestions?.concept &&
      !!director.directorSuggestions?.sellingPoints?.length,
  );
  check(
    '编译快照可追溯请求 hash 与版本',
    Boolean(director.compileId && director.requestHash && director.compilerVersion),
  );

  const explicitSkill = await post('/agent/route', {
    userInput: '根据摘要生成一张文章配图',
    skillId: 'skill_article_illustration',
    uploadedImages: ['accept-ref'],
    references: [{ assetId: 'accept-ref', role: 'style', fidelity: 'auto' }],
  });
  check(
    '显式 Skill 携带参考图时走 i2i',
    explicitSkill.response.ok &&
      explicitSkill.body.data?.skillId === 'skill_article_illustration' &&
      explicitSkill.body.data?.mode === 'i2i',
  );

  const missingRole = await post('/agent/route', {
    userInput: '制作商品海报',
    skillId: 'skill_ecommerce_poster',
    uploadedImages: ['accept-ref'],
    references: [{ assetId: 'accept-ref', role: 'style', fidelity: 'auto' }],
  });
  check(
    '必填素材按参考图角色判断',
    missingRole.response.ok && missingRole.body.data?.missingSlots?.includes('需上传商品主体'),
  );

  const changedOutput = await post('/generations', {
    mode: 't2i',
    inputs: { prompt: director.compiledPrompt },
    options: { ratio: '1:1', quality: 'high', candidateCount: 1 },
    promptCompilationId: director.compileId,
    idempotencyKey: `${mark}_changed_output`,
  });
  check(
    '编译后修改输出参数会被后端拒绝',
    changedOutput.response.status === 400 &&
      changedOutput.body.message === '输出参数已变化，请重新分析',
  );

  const changedReference = await post('/generations', {
    mode: 'i2i',
    inputs: {
      slots: ['accept-ref'],
      references: [{ assetId: 'accept-ref', role: 'style', fidelity: 'auto' }],
      prompt: referenceCompilation.compiledPrompt,
    },
    options: { ratio: '1:1', quality: 'standard', candidateCount: 1 },
    promptCompilationId: referenceCompilation.compileId,
    idempotencyKey: `${mark}_changed_reference`,
  });
  check(
    '编译后修改参考图角色会被后端拒绝',
    changedReference.response.status === 400 &&
      changedReference.body.message === '参考图或图片角色已变化，请重新分析',
  );

  const compileIds = [raw, enhanced, director, referenceCompilation]
    .map((item) => `'${item.compileId}'`)
    .join(',');
  const rows = psql(`SELECT count(*) FROM prompt_compilations WHERE id IN (${compileIds})`);
  check('四次编译均落库快照', rows === '4', `rows=${rows}`);
  const after = psql(
    "SELECT (SELECT count(*) FROM generation_runs) || '|' || (SELECT count(*) FROM generation_jobs) || '|' || (SELECT count(*) FROM credit_transactions)",
  );
  check('编译零 Run/Job/扣点副作用', before === after, `${before} -> ${after}`);

  psql(`DELETE FROM prompt_compilations WHERE id IN (${compileIds})`);
  const passed = results.filter(Boolean).length;
  console.log(`\n==== S6-Creation 验收 ${passed}/${results.length} ====`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
