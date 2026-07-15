// Populates the settings table (db/schema.ts) from the current process.env,
// per the catalog in db/settings.ts. Idempotent - upserts by key, safe to
// re-run after editing .env.
//   node db/seed-settings.ts
import { config } from 'dotenv';
import { close } from './client.ts';
import { seedSettingsFromEnv, SETTINGS_CATALOG } from './settings.ts';

config();

await seedSettingsFromEnv();
console.log(`settings table synced from process.env (${SETTINGS_CATALOG.length} keys)`);
await close();
process.exit(0);
