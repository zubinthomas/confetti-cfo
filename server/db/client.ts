// Database client. Development uses PGlite (embedded Postgres, Apache-2.0) so
// there is no external service to run. The schema is plain PostgreSQL (see
// schema.ts's drizzle-orm/pg-core imports), so when DATABASE_URL is set this
// swaps to a real Postgres server via node-postgres instead - everything
// downstream of `db`/`ready`/`close` stays the same either way.
//
// PGlite is strictly SINGLE-PROCESS: two processes opening the same data
// directory each get an independent in-memory view and silently diverge
// (writes from one are invisible to - and can clobber - the other). The
// lockfile below turns that silent corruption into a loud startup error:
// stop the dev server before running db:seed / verify / one-off scripts.
// This only applies to the PGlite branch - a real Postgres server handles
// concurrent connections natively, so DATABASE_URL skips it entirely.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { Pool } from 'pg';
import { drizzle as drizzleNode, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate as migrateNode } from 'drizzle-orm/node-postgres/migrator';
import * as schema from './schema.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.PGLITE_DATA_DIR || path.join(__dirname, '..', 'data', 'pg');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const LOCK_FILE = `${DATA_DIR}.lock`;
const DATABASE_URL = process.env.DATABASE_URL;

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

// db is typed as NodePgDatabase throughout - PgliteDatabase differs only in
// its query-result HKT (what a raw .execute() looks like), never in the
// fluent builder API every caller actually uses, so this keeps the ~100
// files that import { db } from here completely driver-agnostic.
let db: NodePgDatabase<typeof schema>;
let client: PGlite | undefined;
let migrateFn: () => Promise<void>;
let closeFn: () => Promise<void>;

if (DATABASE_URL) {
  const pool = new Pool({ connectionString: DATABASE_URL });
  db = drizzleNode(pool, { schema });
  migrateFn = () => migrateNode(db, { migrationsFolder: MIGRATIONS_DIR });
  closeFn = () => pool.end();
} else {
  try {
    acquireLock();
  } catch (err) {
    // This runs at module-import time (before index.ts's own error handling
    // is reachable), so print a clean message instead of letting it surface
    // as an uncaught-exception stack trace.
    console.error(`❌ ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
  // btree_gist backs the reservations no-overlap EXCLUDE constraint
  // (migration 0021); real Postgres has it built in, PGlite must load it
  // explicitly.
  client = new PGlite(DATA_DIR, { extensions: { btree_gist } });
  db = drizzlePglite(client, { schema }) as unknown as NodePgDatabase<typeof schema>;
  migrateFn = () => migratePglite(db as never, { migrationsFolder: MIGRATIONS_DIR });
  closeFn = () => client!.close();
}

export { db };

// Exposed for server/db/backup.ts's dumpDataDir() call (a PGlite-instance
// method, not reachable through the Drizzle wrapper) and for
// server/db/restore.ts to know where to materialize a restored backup.
// Both are undefined when DATABASE_URL is set - backup.ts/restore.ts branch
// on DATABASE_URL themselves rather than on these.
export { client, DATA_DIR };

let migrated: Promise<void> | null = null;
/** Apply pending migrations once per process before first use, then seed the
 *  RBAC permission catalog/default roles and the two default reservation
 *  locations (all deterministic and code-only, so - unlike the dataset/
 *  settings seeds - these run unconditionally). Both seeders are
 *  dynamically imported to avoid a circular import: they import
 *  { db, ready, schema } from here. */
export function ready(): Promise<void> {
  migrated ??= migrateFn()
    .then(async () => {
      const { seedPermissionsCatalog } = await import('./permissions.ts');
      await seedPermissionsCatalog();
      const { seedDefaultReservationLocations } = await import('./reservations.ts');
      await seedDefaultReservationLocations();
      const { ensureDefaultTemplates } = await import('./documentTemplates.ts');
      await ensureDefaultTemplates();
    });
  return migrated;
}

/** Flush and close the database (call before process.exit in one-off scripts). */
export async function close(): Promise<void> {
  await closeFn();
}

export { schema };
