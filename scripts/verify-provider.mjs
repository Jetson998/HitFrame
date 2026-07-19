/**
 * 阶段 2 验证脚本：Muskapis 真实出图（t2i + i2i 两条链路，各 1 张 standard，最小消耗）。
 * 运行：node --env-file=.env scripts/verify-provider.mjs
 * 产出：storage/verify/t2i.png、storage/verify/i2i.png（storage/ 已被 .gitignore 排除）
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { MuskapisProvider } = require('../packages/image-provider/dist/index.js');

const cfg = {
  baseUrl: process.env.IMAGE_BASE_URL,
  apiKey: process.env.IMAGE_API_KEY,
  model: process.env.IMAGE_MODEL ?? 'gpt-image-2',
};
if (!cfg.apiKey) {
  console.error('IMAGE_API_KEY 未配置（.env）');
  process.exit(1);
}

const outDir = resolve('storage/verify');
mkdirSync(outDir, { recursive: true });

async function saveResult(result, file) {
  const item = result.images[0];
  let buf;
  if (item.b64) {
    buf = Buffer.from(item.b64, 'base64');
  } else {
    const res = await fetch(item.url); // 引擎 URL 有时效：拿到立即下载
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
  }
  const path = resolve(outDir, file);
  writeFileSync(path, buf);
  console.log(`  saved ${file} (${(buf.length / 1024).toFixed(0)} KB)`);
  if (result.usage) console.log(`  usage: ${JSON.stringify(result.usage)}`);
  return path;
}

const provider = new MuskapisProvider(cfg);

console.log('[1/2] t2i generate (standard, 1024x1024)…');
let t0 = Date.now();
const gen = await provider.generate({
  prompt: '一只橘猫坐在窗台上，午后阳光，治愈系',
  size: '1024x1024',
  quality: 'standard',
});
console.log(`  ok in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
const t2iPath = await saveResult(gen, 't2i.png');

console.log('[2/2] i2i edit (换背景, input_fidelity=high, standard)…');
t0 = Date.now();
const edit = await provider.edit({
  prompt: '保持图中主体，背景换成温暖木质桌面和柔光',
  images: [{ data: readFileSync(t2iPath), filename: 't2i.png', contentType: 'image/png' }],
  size: '1024x1024',
  quality: 'standard',
  inputFidelity: 'high',
});
console.log(`  ok in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await saveResult(edit, 'i2i.png');

console.log('阶段 2 验证通过：t2i / i2i 两条真实链路均出图。');
