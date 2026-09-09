import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Listen on all interfaces so the dev site is reachable over the tailnet,
    // and let this machine's MagicDNS name past Vite's host check. Set
    // VITE_ALLOWED_HOSTS (comma-separated) to override for another machine.
    host: true,
    allowedHosts: process.env.VITE_ALLOWED_HOSTS?.split(',') ?? ['.internal.errantquill.com'],
    proxy: {
      // Proxy all /api requests to the Express server during development
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
