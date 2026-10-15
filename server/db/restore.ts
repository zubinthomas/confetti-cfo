// Restore the database from a backup tarball created by server/db/backup.ts.
//
//   node db/restore.ts <path-to-backup.tar.gz> --yes   (stop the server first)
//
// This deliberately does NOT import server/db/client.ts: that module's own
// top-level code opens a live PGlite connection against the CURRENT data
// directory the moment it's imported (see its header comment) - exactly the
// directory this script is about to move aside and replace. DATA_DIR is
// re-derived the same way client.ts computes it instead, so importing this
// file never touches the data directory until the restore logic below
// explicitly decides to.
//
// Never deletes anything: the current data directory (if any) is moved
// aside, never removed, so a bad restore is itself reversible.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.PGLITE_DATA_DIR || path.join(__dirname, '..', 'data', 'pg');

function fail(msg: string): never {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

async function main() {
  const args = process.argv.slice(2);
  const yes = args.includes('--yes');
  const backupPath = args.find((a) => !a.startsWith('--'));

  if (!backupPath) {
    fail('usage: node db/restore.ts <path-to-backup.tar.gz> --yes   (stop the server first)');
  }
  if (!(await exists(backupPath))) {
    fail(`No such file: ${backupPath}`);
  }
  if (!yes) {
    fail(
      `This replaces the live database at ${DATA_DIR} with the contents of ${backupPath}.\n` +
      `The current data directory is moved aside first, never deleted, so this is reversible ` +
      `- but it stops the running app seeing its current data the moment you do this.\n` +
      `Re-run with --yes once you're sure, and with the server already stopped.`,
    );
  }

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

main().catch((err) => {
  console.error('❌ Restore failed:', err);
  process.exit(1);
});
