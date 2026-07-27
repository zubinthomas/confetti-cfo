// Logs in as the fixed e2e test user (see server/db/ensure-e2e-user.ts,
// created by the API webServer command before this runs) and saves the
// resulting token into a storageState file, so every spec starts already
// authenticated. This app uses a Bearer token in localStorage (see
// src/api/http.ts), not cookies, hence the localStorage entry below rather
// than a `cookies` one.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_BASE = "http://localhost:3001/api";
const APP_ORIGIN = "http://localhost:5199";
const E2E_USER_EMAIL = "e2e@confetti.test";
const E2E_USER_PASSWORD = "e2e-test-password";

export const STORAGE_STATE_PATH = path.join(__dirname, ".auth-state.json");

export default async function globalSetup() {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: E2E_USER_EMAIL, password: E2E_USER_PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`e2e login failed (${res.status}): ${await res.text()} - did server/db/ensure-e2e-user.ts run?`);
  }
  const { access_token } = await res.json();

  fs.writeFileSync(STORAGE_STATE_PATH, JSON.stringify({
    cookies: [],
    origins: [{
      origin: APP_ORIGIN,
      localStorage: [{ name: "access_token", value: access_token }],
    }],
  }));
}
