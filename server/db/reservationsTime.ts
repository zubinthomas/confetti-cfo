// Pure date/time helpers shared by the reservations, guest-register and
// table-merge modules. No DB imports - kept in its own file so those modules
// can all depend on it without an import cycle through reservations.ts.
//
// Sienna is in Kolkata; IST is UTC+5:30 year-round (no DST). Real instants are
// stored as UTC ISO strings, but reservations store `date`/`time` as naive IST
// strings, so converting a timestamp to "which IST day / minute of day is
// this" must add the fixed offset explicitly - never lean on the server's
// local timezone.
const IST_OFFSET_MIN = 5 * 60 + 30;

/** Minutes past midnight for an 'HH:MM' (24h) string. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** 'HH:MM' (24h) for minutes past midnight. */
export function fromMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** IST calendar date + minute-of-day for an instant (default: now). */
export function istNow(d = new Date()): { date: string; minutes: number } {
  const ist = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  const date = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}-${String(ist.getUTCDate()).padStart(2, '0')}`;
  return { date, minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes() };
}

/** UTC-instant half-open bounds `[gte, lt)` for the IST calendar day `date`
 *  ('YYYY-MM-DD') - for filtering a UTC timestamp column (signedInAt, ...) by
 *  the IST business day it falls in. */
export function istDayBounds(date: string): { gte: string; lt: string } {
  const startUtcMs = Date.parse(`${date}T00:00:00.000Z`) - IST_OFFSET_MIN * 60_000;
  return {
    gte: new Date(startUtcMs).toISOString(),
    lt: new Date(startUtcMs + 24 * 60 * 60_000).toISOString(),
  };
}
