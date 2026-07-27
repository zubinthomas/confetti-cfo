import { defineConfig } from "@playwright/test";
import fs from "node:fs";
import { STORAGE_STATE_PATH } from "./tests/e2e/global-setup.js";

// Prefer a system Chromium when Playwright's bundled browser isn't installed
// (override with PLAYWRIGHT_EXECUTABLE_PATH, or run `npx playwright install chromium`).
const systemChromium = ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome"]
  .find((p) => fs.existsSync(p));
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || systemChromium;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:5199",
    launchOptions: executablePath ? { executablePath } : {},
    storageState: STORAGE_STATE_PATH,
  },
  webServer: [
    {
      // API server (seeds the database + a fixed e2e Admin user, both only if missing)
      command: "node db/ensure-seeded.ts && node db/ensure-e2e-user.ts && node index.ts",
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
