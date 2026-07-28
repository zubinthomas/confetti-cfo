// Database client. Development uses PGlite (embedded Postgres, Apache-2.0) so
// there is no external service to run; the schema is plain PostgreSQL, so
// production swaps this file's driver for node-postgres/postgres.js with a
// DATABASE_URL and everything else stays the same.
//
// PGlite is strictly SINGLE-PROCESS: two processes opening the same data
// directory each get an independent in-memory view and silently diverge
// (writes from one are invisible to - and can clobber - the other). The
// lockfile below turns that silent corruption into a loud startup error:
// stop the dev server before running db:seed / verify / one-off scripts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from './schema.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.PGLITE_DATA_DIR || path.join(__dirname, '..', 'data', 'pg');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const LOCK_FILE = `${DATA_DIR}.lock`;

function acquireLock() {
  fs.mkdirSync(path.dirname(DATA_DIR), { recursive: true });
  if (fs.existsSync(LOCK_FILE)) {
    const pid = Number(fs.readFileSync(LOCK_FILE, 'utf-8').trim());
    let alive = false;
    try { process.kill(pid, 0); alive = true; } catch { /* stale lock */ }
    if (alive && pid !== process.pid) {
      throw new Error(
        `The PGlite database at ${DATA_DIR} is already open in process ${pid} ` +
        `(PGlite is single-process). Stop that process first - e.g. the dev API ` +
        `server - before running seeds, verifies or another server instance.`,
      );
    }
  }
  fs.writeFileSync(LOCK_FILE, String(process.pid));
  const release = () => { try { if (fs.readFileSync(LOCK_FILE, 'utf-8').trim() === String(process.pid)) fs.unlinkSync(LOCK_FILE); } catch { /* already gone */ } };
  process.on('exit', release);
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => { process.exitCode = 0; process.exit(); });
  }
}

try {
  acquireLock();
} catch (err) {
  // This runs at module-import time (before index.ts's own error handling is
  // reachable), so print a clean message instead of letting it surface as an
  // uncaught-exception stack trace.
  console.error(`❌ ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

const client = new PGlite(DATA_DIR);
export const db = drizzle(client, { schema });

let migrated: Promise<void> | null = null;
/** Apply pending migrations once per process before first use, then seed the
 *  RBAC permission catalog/default roles and the two default reservation
 *  locations (all deterministic and code-only, so - unlike the dataset/
 *  settings seeds - these run unconditionally). Both seeders are
 *  dynamically imported to avoid a circular import: they import
 *  { db, ready, schema } from here. */
export function ready(): Promise<void> {
  migrated ??= migrate(db, { migrationsFolder: MIGRATIONS_DIR })
    .then(async () => {
      const { seedPermissionsCatalog } = await import('./permissions.ts');
      await seedPermissionsCatalog();
      const { seedDefaultReservationLocations } = await import('./reservations.ts');
      await seedDefaultReservationLocations();
    });
  return migrated;
}

/** Flush and close the database (call before process.exit in one-off scripts). */
export async function close(): Promise<void> {
  await client.close();
}

export { schema };
