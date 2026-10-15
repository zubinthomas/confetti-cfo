import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/icon-maskable-512.png',
      ],
      manifest: {
        name: 'Confetti CFO Dashboard',
        short_name: 'Confetti CFO',
        description: 'Group financial dashboard for Confetti Exports / Sienna',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0a0e1a',
        theme_color: '#3b62eb',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache only the built app shell - never the API. Financial data
        // must always come from the network, never a stale service-worker cache.
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
      },
    }),
  ],
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
