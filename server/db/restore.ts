// Restore the database from a backup created by server/db/backup.ts.
//
//   node db/restore.ts <path-to-backup> --yes   (stop the server first)
//
// Branches on DATABASE_URL, same as client.ts:
//  - Unset (PGlite): restores a .tar.gz into DATA_DIR. This deliberately
//    does NOT import server/db/client.ts: that module's own top-level code
//    opens a live PGlite connection against the CURRENT data directory the
//    moment it's imported (see its header comment) - exactly the directory
//    this script is about to move aside and replace. DATA_DIR is re-derived
//    the same way client.ts computes it instead. Never deletes anything:
//    the current data directory (if any) is moved aside, never removed, so
//    a bad restore is itself reversible.
//  - Set (real Postgres): restores a .dump (pg_restore --format=custom) into
//    a scratch sibling database, sanity-checks it, then renames the live
//    database aside and the scratch one into its place - the same
//    "never destroy until the new thing is verified" shape, translated
//    from filesystem rename to database rename. The pre-restore database is
//    left in place, not dropped, exactly like the PGlite .pre-restore-*
//    directory below.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { Client } from 'pg';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.PGLITE_DATA_DIR || path.join(__dirname, '..', 'data', 'pg');
const DATABASE_URL = process.env.DATABASE_URL;

function fail(msg: string): never {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

// Swaps the database name in a postgres:// connection string, preserving
// everything else (user, host, query params like ?host=/run/postgresql for
// unix-socket peer auth). Deliberately string-based rather than WHATWG URL
// parsing, since peer-auth URLs put the socket directory in a query param
// rather than the host - this only needs to work for the two connection-
// string shapes this app actually uses (see .env.example).
function withDatabase(connStr: string, dbName: string): string {
  const [base, query] = connStr.split('?');
  const swapped = base.replace(/\/[^/]*$/, `/${dbName}`);
  return query ? `${swapped}?${query}` : swapped;
}

function dbNameOf(connStr: string): string {
  const base = connStr.split('?')[0];
  const name = base.match(/\/([^/]*)$/)?.[1];
  if (!name) fail(`Could not parse a database name out of DATABASE_URL: ${connStr}`);
  return name;
}

async function restorePglite(backupPath: string) {
  const backupBuffer = await fs.readFile(backupPath);
  const backupBlob = new Blob([backupBuffer]);

  if (await exists(DATA_DIR)) {
    const movedTo = `${DATA_DIR}.pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    await fs.rename(DATA_DIR, movedTo);
    console.log(`Moved the current data directory aside to ${movedTo} (not deleted).`);
  } else {
    console.log(`No existing data directory at ${DATA_DIR} - restoring into a fresh one.`);
  }

  console.log('Materializing the backup...');
  const restored = await PGlite.create({ dataDir: DATA_DIR, loadDataDir: backupBlob, extensions: { btree_gist } });
  await restored.close();

  console.log(`\n✅ Restored into ${DATA_DIR}.`);
  console.log('Next steps:');
  console.log('  1. Restart the server.');
  console.log('  2. Verify the app looks right (log in, check recent data).');
  console.log('  3. Once you\'re confident, delete the .pre-restore-* directory yourself - it is not removed automatically.');
}

async function restorePostgres(backupPath: string) {
  const targetDb = dbNameOf(DATABASE_URL!);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const restoringDb = `${targetDb}_restoring_${stamp}`;
  const preRestoreDb = `${targetDb}_pre_restore_${stamp}`;
  const adminUrl = withDatabase(DATABASE_URL!, 'postgres');

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    console.log(`Creating scratch database ${restoringDb}...`);
    await admin.query(`CREATE DATABASE "${restoringDb}"`);

    console.log('Restoring the backup into it (pg_restore)...');
    await execFileAsync('pg_restore', [
      '--format=custom', '--dbname', withDatabase(DATABASE_URL!, restoringDb), backupPath,
    ]);

    console.log('Sanity-checking the restored database...');
    const check = new Client({ connectionString: withDatabase(DATABASE_URL!, restoringDb) });
    await check.connect();
    let tableCount = 0, rowCount = 0;
    try {
      const tables = await check.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
      );
      tableCount = tables.rowCount ?? 0;
      for (const { table_name } of tables.rows) {
        const { rows } = await check.query(`SELECT count(*)::int AS n FROM "${table_name}"`);
        rowCount += rows[0].n;
      }
    } finally {
      await check.end();
    }
    console.log(`  ${tableCount} tables, ${rowCount} rows total.`);
    if (tableCount === 0) fail('The restored database has zero tables - refusing to swap it in. Check the backup file.');

    console.log('Swapping it in...');
    await admin.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ($1, $2) AND pid <> pg_backend_pid()`,
      [targetDb, restoringDb],
    );
    await admin.query(`ALTER DATABASE "${targetDb}" RENAME TO "${preRestoreDb}"`);
    await admin.query(`ALTER DATABASE "${restoringDb}" RENAME TO "${targetDb}"`);
  } catch (err) {
    console.error(`Restore failed - cleaning up the scratch database ${restoringDb}...`);
    await admin.query(`DROP DATABASE IF EXISTS "${restoringDb}"`).catch(() => {});
    throw err;
  } finally {
    await admin.end();
  }

  console.log(`\n✅ Restored. The live database "${targetDb}" now holds the backup's data.`);
  console.log(`The pre-restore database "${preRestoreDb}" was NOT dropped - it holds what was live before this restore.`);
  console.log('Next steps:');
  console.log('  1. Restart the server.');
  console.log('  2. Verify the app looks right (log in, check recent data).');
  console.log(`  3. Once you're confident, drop "${preRestoreDb}" yourself - it is not removed automatically.`);
}

async function main() {
  const args = process.argv.slice(2);
  const yes = args.includes('--yes');
  const backupPath = args.find((a) => !a.startsWith('--'));

  if (!backupPath) {
    fail('usage: node db/restore.ts <path-to-backup> --yes   (stop the server first)');
  }
  if (!(await exists(backupPath))) {
    fail(`No such file: ${backupPath}`);
  }
  if (!yes) {
    fail(
      DATABASE_URL
        ? `This replaces the live database with the contents of ${backupPath}.\n` +
          `The current database is renamed aside first, never dropped, so this is reversible ` +
          `- but it stops the running app seeing its current data the moment you do this.\n` +
          `Re-run with --yes once you're sure, and with the server already stopped.`
        : `This replaces the live database at ${DATA_DIR} with the contents of ${backupPath}.\n` +
          `The current data directory is moved aside first, never deleted, so this is reversible ` +
          `- but it stops the running app seeing its current data the moment you do this.\n` +
          `Re-run with --yes once you're sure, and with the server already stopped.`,
    );
  }

  if (DATABASE_URL) await restorePostgres(backupPath);
  else await restorePglite(backupPath);
}

main().catch((err) => {
  console.error('❌ Restore failed:', err);
  process.exit(1);
});
