import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // workspace 软链下的 CJS 产物 Rollup 不做互操作，直接指到 TS 源码
      '@hitframe/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    // 可在本地多实例验收时切换 API；生产构建不依赖该开发代理。
    proxy: {
      // HitFrame 本地 API 使用 3011；仍允许多实例通过环境变量覆盖。
      '/api': process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3011',
      '/files': process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3011',
    },
  },
});
