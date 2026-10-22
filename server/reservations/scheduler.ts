// In-process sweep that marks bookings no-show once their time + duration has
// passed - same shape as server/calendar/scheduler.ts, same PGlite
// single-process rationale. Seated bookings are never touched.
import { markExpiredReservationsNoShow } from '../db/reservations.ts';
import { pushReservationEvent } from '../calendar/sync.ts';

const FIRST_RUN_DELAY_MS = 10_000;

let inFlight = false;

async function tick(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const changed = await markExpiredReservationsNoShow();
    // A no-show deletes the linked Calendar event; pushReservationEvent never throws.
    for (const row of changed) await pushReservationEvent(row);
    if (changed.length > 0) console.log(`reservations: ${changed.length} past booking(s) marked no-show`);
  } catch (err) {
    console.error('reservations: no-show sweep failed:', err);
  } finally {
    inFlight = false;
  }
}

export function startReservationNoShowScheduler(): void {
  const seconds = Number(process.env.RESERVATION_AUTO_NOSHOW_SECONDS ?? 60);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    console.log('reservations: auto no-show disabled (RESERVATION_AUTO_NOSHOW_SECONDS is 0 or invalid)');
    return;
  }
  console.log(`reservations: pending/confirmed bookings go no-show after their end time (checked every ${seconds}s)`);
  setTimeout(tick, FIRST_RUN_DELAY_MS).unref();
  setInterval(tick, seconds * 1000).unref();
}
