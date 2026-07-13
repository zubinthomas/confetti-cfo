import { defineConfig } from "@playwright/test";
import fs from "node:fs";

// Prefer a system Chromium when Playwright's bundled browser isn't installed
// (override with PLAYWRIGHT_EXECUTABLE_PATH, or run `npx playwright install chromium`).
const systemChromium = ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"]
  .find((p) => fs.existsSync(p));
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || systemChromium;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:5199",
    launchOptions: executablePath ? { executablePath } : {},
  },
  webServer: [
    {
      // API server (seeds the database first if it's empty)
      command: "node db/ensure-seeded.ts && node index.ts",
      cwd: "server",
      url: "http://localhost:3001/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "npx vite --port 5199 --strictPort",
      url: "http://localhost:5199",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
