// Sienna is in Kolkata and runs on IST (Asia/Kolkata, UTC+5:30, no DST). Real
// instants cross the API as UTC ISO strings; everything a user reads or types
// on the reservations / guest-register screens is IST wall-clock. These
// helpers make that conversion explicit rather than leaning on the browser's
// own timezone (the shared front-of-house terminal may not be set to IST).
const IST_OFFSET_MIN = 5 * 60 + 30;

/** An instant shifted into IST, as a Date whose UTC getters read as IST
 *  wall-clock. Internal - callers use the formatters below. */
function istShift(d: Date): Date {
  return new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
}

/** IST calendar date ('YYYY-MM-DD') for an instant (default: now). */
export function istDateStr(d: Date = new Date()): string {
  const i = istShift(d);
  return `${i.getUTCFullYear()}-${String(i.getUTCMonth() + 1).padStart(2, "0")}-${String(i.getUTCDate()).padStart(2, "0")}`;
}

/** IST minutes-past-midnight for an instant (default: now). */
export function istMinutes(d: Date = new Date()): number {
  const i = istShift(d);
  return i.getUTCHours() * 60 + i.getUTCMinutes();
}

/** IST 'HH:MM' for an instant (default: now). */
export function istTimeStr(d: Date = new Date()): string {
  const m = istMinutes(d);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** 'HH:MM' IST clock label for a UTC ISO string; '' for null. */
export function istClock(iso: string | null): string {
  return iso ? istTimeStr(new Date(iso)) : "";
}

/** Interpret 'HH:MM' as IST wall-clock on `dayStr` (an IST date, default
 *  today) and return the matching UTC ISO instant. */
export function istTimeToUtcIso(hhmm: string, dayStr: string = istDateStr()): string {
  const [h, m] = hhmm.split(":").map(Number);
  const clockAsUtcMs = Date.parse(`${dayStr}T00:00:00.000Z`) + (h * 60 + m) * 60_000;
  return new Date(clockAsUtcMs - IST_OFFSET_MIN * 60_000).toISOString();
}
