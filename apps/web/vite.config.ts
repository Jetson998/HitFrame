import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // 前端只与本系统 API 交互；引擎密钥永不到前端
      '/api': 'http://localhost:3001',
    },
  },
});
