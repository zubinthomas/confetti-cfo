// Database client. Development uses PGlite (embedded Postgres, Apache-2.0) so
// there is no external service to run; the schema is plain PostgreSQL, so
// production swaps this file's driver for node-postgres/postgres.js with a
// DATABASE_URL and everything else stays the same.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from './schema.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.PGLITE_DATA_DIR || path.join(__dirname, '..', 'data', 'pg');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const client = new PGlite(DATA_DIR);
export const db = drizzle(client, { schema });

let migrated: Promise<void> | null = null;
/** Apply pending migrations once per process before first use. */
export function ready(): Promise<void> {
  migrated ??= migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return migrated;
}

export { schema };
