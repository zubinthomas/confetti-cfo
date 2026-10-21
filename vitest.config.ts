import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Unit tests only. Kept apart from vite.config.ts so the PWA plugin doesn't
// load for every test run; Playwright specs live in tests/e2e.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: { include: ['src/**/*.test.ts'] },
});
