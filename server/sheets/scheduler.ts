// In-process periodic sync of enabled sheet sources. In-process is the right
// shape here: PGlite is single-process, so an external cron/worker could
// never share the database with the server anyway.
import { eq } from 'drizzle-orm';
import { db, ready, schema } from '../db/client.ts';
import { syncSource } from './sync.ts';

const FIRST_RUN_DELAY_MS = 60_000;

let inFlight = false;

async function tick(): Promise<void> {
  if (inFlight) return; // skip overlapping runs
  inFlight = true;
  try {
    await ready();
    const sources = await db.select().from(schema.sheetSources)
      .where(eq(schema.sheetSources.enabled, true));
    // serial on purpose: PGlite handles one transaction at a time
    for (const source of sources) {
      const result = await syncSource(source);
      console.log(`sheets: auto-sync "${source.label}" → ${result.status}${result.error ? ` (${result.error})` : ''}`);
    }
  } catch (err) {
    console.error('sheets: auto-sync tick failed:', err);
  } finally {
    inFlight = false;
  }
}

export function startSheetsScheduler(): void {
  const minutes = Number(process.env.SHEETS_SYNC_INTERVAL_MINUTES ?? 30);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    console.log('sheets: auto-sync disabled (SHEETS_SYNC_INTERVAL_MINUTES is 0 or invalid)');
    return;
  }
  console.log(`sheets: auto-sync every ${minutes} min`);
  setTimeout(tick, FIRST_RUN_DELAY_MS).unref();
  setInterval(tick, minutes * 60_000).unref();
}
