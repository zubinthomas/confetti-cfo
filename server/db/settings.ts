// Settings catalog + CRUD. One row per known server/.env variable; populated
// by db/seed-settings.ts from process.env. This table doesn't drive runtime
// config yet (process.env / dotenv still does) - it's a display/audit copy.
// Writes are disabled at the route layer for now (see routes/settings.ts).
import { eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';

export type SettingCategory = typeof schema.settingCategoryEnum.enumValues[number];

export interface SettingDef {
  key: string;
  category: SettingCategory;
  label: string;
  description?: string;
  isSecret?: boolean;
}

// Mirrors server/.env.example section by section.
export const SETTINGS_CATALOG: SettingDef[] = [
  { key: 'PORT', category: 'server', label: 'Port', description: 'Port the API server listens on.' },
  { key: 'SERVER_URL', category: 'server', label: 'Server URL', description: 'Public base URL of this server (used to build uploaded-file links).' },
  { key: 'CLIENT_URL', category: 'server', label: 'Client URL', description: 'Frontend origin, for CORS.' },

  { key: 'JWT_SECRET', category: 'security', label: 'JWT secret', description: 'Signs auth tokens. Change to a long random string before any real deployment.', isSecret: true },

  { key: 'LLM_PROVIDER', category: 'llm', label: 'LLM provider', description: '"anthropic" (default), "openai", or "openrouter".' },
  { key: 'ANTHROPIC_API_KEY', category: 'llm', label: 'Anthropic API key', isSecret: true },
  { key: 'OPENAI_API_KEY', category: 'llm', label: 'OpenAI API key', isSecret: true },
  { key: 'OPENROUTER_API_KEY', category: 'llm', label: 'OpenRouter API key', isSecret: true },
  { key: 'LLM_MODEL', category: 'llm', label: 'LLM model', description: 'Optional override of the provider default model.' },
  { key: 'MAX_TOKENS', category: 'llm', label: 'Max tokens', description: 'Caps LLM response length (default 1024). "unlimited" removes the cap (OpenAI/OpenRouter only).' },

  { key: 'GOOGLE_CLIENT_ID', category: 'google_oauth', label: 'Google client ID' },
  { key: 'GOOGLE_CLIENT_SECRET', category: 'google_oauth', label: 'Google client secret', isSecret: true },

  { key: 'GOOGLE_SERVICE_ACCOUNT_FILE', category: 'google_sheets', label: 'Service account file path', description: 'Path to a service-account credentials JSON, for private sheets.' },
  { key: 'GOOGLE_SERVICE_ACCOUNT_JSON', category: 'google_sheets', label: 'Service account JSON', description: 'The credentials JSON itself (or base64), as an alternative to the file path.', isSecret: true },
  { key: 'SHEETS_SYNC_INTERVAL_MINUTES', category: 'google_sheets', label: 'Sync interval (minutes)', description: 'Minutes between automatic syncs of enabled sheet sources. 0 disables.' },
  { key: 'SHEETS_EXPORT_BASE_URL', category: 'google_sheets', label: 'Export base URL override', description: 'Test hook - points sheet export requests at a local fixture server.' },

  { key: 'SMTP_HOST', category: 'email', label: 'SMTP host' },
  { key: 'SMTP_PORT', category: 'email', label: 'SMTP port' },
  { key: 'SMTP_USER', category: 'email', label: 'SMTP user' },
  { key: 'SMTP_PASS', category: 'email', label: 'SMTP password', isSecret: true },
  { key: 'EMAIL_FROM', category: 'email', label: 'From address', description: 'Sender address for OTP / password-reset emails.' },
];

export async function listSettings() {
  await ready();
  return db.select().from(schema.settings).orderBy(schema.settings.id);
}

export async function getSetting(key: string) {
  await ready();
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
  return row ?? null;
}

export async function createSetting(def: SettingDef & { value?: string | null }) {
  await ready();
  const [row] = await db.insert(schema.settings).values({
    key: def.key,
    value: def.value ?? null,
    category: def.category,
    label: def.label,
    description: def.description ?? null,
    isSecret: def.isSecret ?? false,
    updatedAt: new Date().toISOString(),
  }).returning();
  return row;
}

export async function updateSetting(key: string, value: string | null) {
  await ready();
  const [row] = await db.update(schema.settings)
    .set({ value, updatedAt: new Date().toISOString() })
    .where(eq(schema.settings.key, key))
    .returning();
  return row ?? null;
}

export async function deleteSetting(key: string) {
  await ready();
  const deleted = await db.delete(schema.settings).where(eq(schema.settings.key, key)).returning();
  return deleted.length > 0;
}

/** Upserts every SETTINGS_CATALOG entry from the current process.env. */
export async function seedSettingsFromEnv() {
  await ready();
  const now = new Date().toISOString();
  for (const def of SETTINGS_CATALOG) {
    const value = process.env[def.key] ?? null;
    await db.insert(schema.settings).values({
      key: def.key,
      value,
      category: def.category,
      label: def.label,
      description: def.description ?? null,
      isSecret: def.isSecret ?? false,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: schema.settings.key,
      set: {
        value,
        category: def.category,
        label: def.label,
        description: def.description ?? null,
        isSecret: def.isSecret ?? false,
        updatedAt: now,
      },
    });
  }
}
