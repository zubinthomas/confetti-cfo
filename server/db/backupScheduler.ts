// In-process periodic database backup. In-process is the right shape here -
// same reasoning as sheets/scheduler.ts and import/pruneScheduler.ts: PGlite
// is single-process, so an external cron/worker could never share the
// database with the server anyway (createBackup() needs the live client).
import { createBackup } from './backup.ts';

const FIRST_RUN_DELAY_MS = 60_000;

let inFlight = false;

async function tick(): Promise<void> {
  if (inFlight) return; // skip overlapping runs
  inFlight = true;
  try {
    const { filename, sizeBytes } = await createBackup();
    console.log(`backup: created ${filename} (${(sizeBytes / 1024 / 1024).toFixed(1)} MB)`);
  } catch (err) {
    console.error('backup: scheduled backup failed:', err);
  } finally {
    inFlight = false;
  }
}

export function startBackupScheduler(): void {
  const hours = Number(process.env.BACKUP_INTERVAL_HOURS ?? 24);
  if (!Number.isFinite(hours) || hours <= 0) {
    console.log('backup: automated backups disabled (BACKUP_INTERVAL_HOURS is 0 or invalid)');
    return;
  }
  console.log(`backup: automated backup every ${hours}h`);
  setTimeout(tick, FIRST_RUN_DELAY_MS).unref();
  setInterval(tick, hours * 60 * 60_000).unref();
}
