import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Local dev only — proxies /api and /uploads to backend on :4000
    port: 5173,
    proxy: {
      '/api':     { target: 'http://localhost:4000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'build',
  },
});
