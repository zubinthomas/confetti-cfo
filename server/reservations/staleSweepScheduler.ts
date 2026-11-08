// In-process sweep that closes bookings left `seated`, and sign-ins never
// signed out, once their day is no longer today - see sweepStaleReservations
// / sweepStaleSignIns in server/db/reservations.ts and guestSignIns.ts.
// Same shape as server/reservations/scheduler.ts, same PGlite single-process
// rationale.
//
// Run order matters: the reservations sweep must go first. A sign-in linked
// to a stale seated booking advances that booking to 'completed' as a side
// effect (maybeAdvanceReservation) - if the sign-in sweep ran first, the
// booking would close without ever being marked auto-closed, since that
// advance path doesn't know this closure was automatic.
import { sweepStaleReservations } from '../db/reservations.ts';
import { sweepStaleSignIns } from '../db/guestSignIns.ts';
import { pushReservationEvent } from '../calendar/sync.ts';

const FIRST_RUN_DELAY_MS = 10_000;

let inFlight = false;

async function tick(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    const now = new Date();
    const closedReservations = await sweepStaleReservations(now);
    // pushReservationEvent never throws - same pattern as the no-show sweep.
    for (const row of closedReservations) await pushReservationEvent(row);
    if (closedReservations.length > 0) {
      console.log(`reservations: ${closedReservations.length} stale seated booking(s) auto-closed`);
    }
  } catch (err) {
    console.error('reservations: stale-booking sweep failed:', err);
  }
  try {
    const closedSignIns = await sweepStaleSignIns(new Date());
    if (closedSignIns.length > 0) {
      console.log(`guest sign-ins: ${closedSignIns.length} stale entry/entries auto-closed`);
    }
  } catch (err) {
    console.error('guest sign-ins: stale-entry sweep failed:', err);
  } finally {
    inFlight = false;
  }
}

export function startStaleSweepScheduler(): void {
  const seconds = Number(process.env.RESERVATION_AUTO_STALE_SECONDS ?? 60);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    console.log('reservations: stale-occupancy auto-close disabled (RESERVATION_AUTO_STALE_SECONDS is 0 or invalid)');
    return;
  }
  console.log(`reservations: seated bookings/sign-ins from a past day auto-close (checked every ${seconds}s)`);
  setTimeout(tick, FIRST_RUN_DELAY_MS).unref();
  setInterval(tick, seconds * 1000).unref();
}
