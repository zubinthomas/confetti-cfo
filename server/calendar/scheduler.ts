// In-process periodic pull of Calendar events into reservations - same
// shape as server/sheets/scheduler.ts, same PGlite single-process rationale.
// Push happens inline from the reservation routes, not on this tick; this
// only handles the pull direction.
import { pullCalendarEvents } from './sync.ts';
import { isCalendarConfigured } from './fetch.ts';

const FIRST_RUN_DELAY_MS = 60_000;

let inFlight = false;

async function tick(): Promise<void> {
  if (inFlight || !isCalendarConfigured()) return;
  inFlight = true;
  try {
    const result = await pullCalendarEvents();
    if (result.pulled || result.updated || result.skipped) {
      console.log(`calendar: pull → ${result.pulled} imported, ${result.updated} updated, ${result.skipped} skipped`);
    }
  } catch (err) {
    console.error('calendar: pull tick failed:', err);
  } finally {
    inFlight = false;
  }
}

export function startCalendarScheduler(): void {
  const minutes = Number(process.env.CALENDAR_SYNC_INTERVAL_MINUTES ?? 15);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    console.log('calendar: auto-pull disabled (CALENDAR_SYNC_INTERVAL_MINUTES is 0 or invalid)');
    return;
  }
  if (!isCalendarConfigured()) {
    console.log('calendar: auto-pull idle (not configured - set GOOGLE_CALENDAR_ID and a service account)');
    return;
  }
  console.log(`calendar: auto-pull every ${minutes} min`);
  setTimeout(tick, FIRST_RUN_DELAY_MS).unref();
  setInterval(tick, minutes * 60_000).unref();
}
