// Database backup: gzipped PGDATA-directory dumps via PGlite's own
// dumpDataDir(), written to server/backups/ - deliberately NOT inside
// server/data/ (see client.ts's DATA_DIR), so losing or corrupting the live
// data directory doesn't also take out the backups.
//
// createBackup() touches the live PGlite client, so - like everything else
// that does (server/import/pruneScheduler.ts, server/sheets/scheduler.ts) -
// it only runs safely in-process, inside the already-running server (the
// scheduler, or server/routes/backups.ts's POST route). It lazily imports
// client.ts only when called, so importing this file on its own (e.g. this
// file's own `list` CLI command below) never trips the PGlite single-process
// lock - see server/db/client.ts's header comment.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BACKUP_DIR = path.join(__dirname, '..', 'backups');

export interface BackupInfo {
  filename: string;
  createdAt: string;
  sizeBytes: number;
}

async function pruneOldBackups(): Promise<void> {
  const days = Number(process.env.BACKUP_RETENTION_DAYS ?? 14);
  if (!Number.isFinite(days) || days <= 0) return;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  for (const entry of await listBackups()) {
    if (new Date(entry.createdAt).getTime() < cutoff) {
      await fs.unlink(path.join(BACKUP_DIR, entry.filename));
      console.log(`backup: pruned ${entry.filename} (older than ${days}d)`);
    }
  }
}

/** Takes a live backup of the whole PGDATA directory and prunes anything
 *  past BACKUP_RETENTION_DAYS (default 14). Must run in-process - see this
 *  file's header comment. */
export async function createBackup(): Promise<BackupInfo> {
  const { client } = await import('./client.ts');
  const tarball = await client.dumpDataDir('gzip');
  const buffer = Buffer.from(await tarball.arrayBuffer());
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const createdAt = new Date().toISOString();
  const filename = `${createdAt.replace(/[:.]/g, '-')}.tar.gz`;
  await fs.writeFile(path.join(BACKUP_DIR, filename), buffer);
  await pruneOldBackups();
  return { filename, createdAt, sizeBytes: buffer.byteLength };
}

/** Metadata only (filename/time/size) - never reads backup contents. Pure
 *  filesystem, no PGlite import, so this is safe to call even while the
 *  server is running as a separate process (e.g. this file's `list` CLI). */
export async function listBackups(): Promise<BackupInfo[]> {
  let names: string[];
  try {
    names = await fs.readdir(BACKUP_DIR);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const infos = await Promise.all(
    names.filter((n) => n.endsWith('.tar.gz')).map(async (filename) => {
      const stat = await fs.stat(path.join(BACKUP_DIR, filename));
      return { filename, createdAt: stat.mtime.toISOString(), sizeBytes: stat.size };
    }),
  );
  return infos.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// CLI: `node db/backup.ts list` - filesystem-only, safe with the server
// running. No `create` command here on purpose: taking a backup must happen
// in-process via the running server (the scheduler or the HTTP route), not a
// separate CLI process - see server/package.json's backup:* scripts.
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , command] = process.argv;
  if (command === 'list') {
    const backups = await listBackups();
    if (backups.length === 0) console.log('No backups yet.');
    else for (const b of backups) console.log(`${b.createdAt}  ${(b.sizeBytes / 1024 / 1024).toFixed(1)} MB  ${b.filename}`);
  } else {
    console.error('usage: node db/backup.ts list');
    process.exit(1);
  }
}
