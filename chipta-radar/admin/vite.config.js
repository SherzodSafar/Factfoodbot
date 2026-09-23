import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Admin Panel — Vite sozlamalari.
 * Ishlab chiqishda: http://localhost:5174 (`/api` so'rovlari backend'ga uzatiladi)
 */
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
    strictPort: false,
    allowedHosts: true,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
