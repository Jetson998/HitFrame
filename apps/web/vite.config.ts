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
    proxy: {
      // 前端只与本系统 API 交互；引擎密钥永不到前端
      '/api': 'http://localhost:3001',
      // 结果/素材静态托管（M1 本地 Volume）
      '/files': 'http://localhost:3001',
    },
  },
});
