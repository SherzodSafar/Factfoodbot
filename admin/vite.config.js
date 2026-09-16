import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Admin Panel — Vite sozlamalari.
 * Ishlab chiqishda: http://localhost:5174
 * Build qilingach backend uni /admin manzilida tarqatadi.
 */
export default defineConfig(() => ({
  plugins: [react()],
  // Vercel'da alohida loyiha sifatida ildizda turadi
  base: process.env.VITE_BASE || '/',
  server: {
    host: true,
    port: 5174,
    strictPort: false,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
}));
