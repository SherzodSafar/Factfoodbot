import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Mini App (mijozlar uchun) — Vite sozlamalari.
 *
 * `/api` so'rovlari backend'ga (localhost:3000) uzatiladi.
 * Shu sababli ngrok faqat SHU portga (5173) ulansa yetarli.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    // ngrok domeni orqali kirishga ruxsat
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
