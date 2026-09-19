// Bidirectional reservation <-> Calendar sync. Push (app -> Calendar) is
// called from server/routes/reservations.ts after every mutation and never
// throws - Calendar sync is an enhancement, a misconfigured or unreachable
// Calendar API must never block booking a table. Pull (Calendar -> app) runs
// on a periodic tick (server/calendar/scheduler.ts).
//
// Conflict rule: an app-originated reservation is always app-authoritative -
// an in-app edit re-pushes and overwrites the Calendar event. A pulled-in,
// externally-created reservation (calendarAuthoritative = true) is
// Calendar-authoritative - a later edit to that event on Calendar re-syncs
// into the row on the next pull. Any in-app mutation on that row flips it to
// app-authoritative (see the route layer), same as any other reservation
// from then on.
import { randomUUID } from 'node:crypto';
import { eq, isNotNull } from 'drizzle-orm';
import { db, ready, schema } from '../db/client.ts';
import { toMinutes, fromMinutes, istNow } from '../db/reservationsTime.ts';
import { isCalendarConfigured, insertEvent, updateEvent, deleteEvent, listEvents, type CalendarEvent } from './fetch.ts';

type ReservationRow = typeof schema.reservations.$inferSelect;

function buildEventBody(res: ReservationRow, tableName: string): Partial<CalendarEvent> {
  const endMinutes = toMinutes(res.time) + res.durationMinutes;
  const endTime = fromMinutes(endMinutes % (24 * 60));
  return {
    summary: `${res.guestName} (${res.partySize}) - ${tableName}`,
    description: res.notes || undefined,
    start: { dateTime: `${res.date}T${res.time}:00+05:30` },
    end: { dateTime: `${res.date}T${endTime}:00+05:30` },
  };
}

/** Flip a Calendar-authoritative row back to app-authoritative - called by
 *  every in-app mutation route (not create, which is always already
 *  app-authoritative) before pushing, per the conflict rule above. A no-op
 *  if the row was already app-authoritative. */
export async function claimAppAuthority(reservationId: string): Promise<void> {
  await ready();
  await db.update(schema.reservations).set({ calendarAuthoritative: false }).where(eq(schema.reservations.id, reservationId));
}

/** Push one reservation's current state to Calendar - create, update, or
 *  delete the linked event as appropriate. Silently does nothing if
 *  Calendar isn't configured, or the row is still Calendar-authoritative
 *  (a pulled-in event a human hasn't touched in-app yet - see the route
 *  layer, which flips this before calling push on an in-app edit). Never
 *  throws - logs and returns on any failure. */
export async function pushReservationEvent(reservation: ReservationRow): Promise<void> {
  if (!isCalendarConfigured() || reservation.calendarAuthoritative) return;
  try {
    await ready();
    const cancelled = reservation.status === 'cancelled' || reservation.status === 'no_show';
    if (cancelled) {
      if (reservation.googleEventId) {
        await deleteEvent(reservation.googleEventId);
        await db.update(schema.reservations).set({ googleEventId: null }).where(eq(schema.reservations.id, reservation.id));
      }
      return;
    }
    const [table] = await db.select().from(schema.reservationTables).where(eq(schema.reservationTables.id, reservation.tableId));
    const body = buildEventBody(reservation, table?.name ?? 'Table');
    if (reservation.googleEventId) {
      await updateEvent(reservation.googleEventId, body);
    } else {
      const event = await insertEvent(body);
      await db.update(schema.reservations).set({ googleEventId: event.id }).where(eq(schema.reservations.id, reservation.id));
    }
  } catch (err) {
    console.error(`calendar: push failed for reservation ${reservation.id}:`, err instanceof Error ? err.message : err);
  }
}

/** Delete a reservation's linked event, if any - for a hard delete
 *  (server/db/reservations.ts's deleteReservation), which a status update
 *  to 'cancelled' can't cover. Never throws. */
export async function deleteReservationEvent(reservation: ReservationRow): Promise<void> {
  if (!isCalendarConfigured() || !reservation.googleEventId) return;
  try {
    await deleteEvent(reservation.googleEventId);
  } catch (err) {
    console.error(`calendar: delete failed for reservation ${reservation.id}:`, err instanceof Error ? err.message : err);
  }
}

/** IST date/time/duration for an event's start/end - null if either side is
 *  an all-day date (no specific time to book against) or the window doesn't
 *  fit in one IST day (reservations can't run past midnight - see
 *  createReservation's own validation). */
function parseEventTiming(event: CalendarEvent): { date: string; time: string; durationMinutes: number } | null {
  if (!event.start?.dateTime || !event.end?.dateTime) return null;
  const start = istNow(new Date(event.start.dateTime));
  const end = istNow(new Date(event.end.dateTime));
  if (end.date !== start.date) return null;
  const durationMinutes = end.minutes - start.minutes;
  if (durationMinutes <= 0) return null;
  return { date: start.date, time: fromMinutes(start.minutes), durationMinutes };
}

const PULL_LOOKBACK_MS = 24 * 60 * 60_000;
const PULL_LOOKAHEAD_MS = 30 * 24 * 60 * 60_000;

/** Pull new/changed events from Calendar into reservations - see the
 *  conflict rule above. A pulled-in event with no default table configured
 *  (GOOGLE_CALENDAR_DEFAULT_TABLE_ID) is skipped rather than guessed at;
 *  same for one whose window collides with an existing booking on that
 *  table (the DB-level overlap constraint rejects the insert). */
export async function pullCalendarEvents(): Promise<{ pulled: number; updated: number; skipped: number }> {
  if (!isCalendarConfigured()) return { pulled: 0, updated: 0, skipped: 0 };
  await ready();

  const now = Date.now();
  let events: CalendarEvent[];
  try {
    events = await listEvents({
      timeMin: new Date(now - PULL_LOOKBACK_MS).toISOString(),
      timeMax: new Date(now + PULL_LOOKAHEAD_MS).toISOString(),
    });
  } catch (err) {
    console.error('calendar: pull failed:', err instanceof Error ? err.message : err);
    return { pulled: 0, updated: 0, skipped: 0 };
  }

  const linked = await db.select().from(schema.reservations).where(isNotNull(schema.reservations.googleEventId));
  const byEventId = new Map(linked.filter((r) => r.googleEventId).map((r) => [r.googleEventId as string, r]));
  const defaultTableId = process.env.GOOGLE_CALENDAR_DEFAULT_TABLE_ID || null;

  let pulled = 0, updated = 0, skipped = 0;

  for (const event of events) {
    const existing = byEventId.get(event.id);

    if (event.status === 'cancelled') {
      if (existing?.calendarAuthoritative) {
        await db.delete(schema.reservations).where(eq(schema.reservations.id, existing.id));
        updated++;
      }
      continue;
    }

    if (existing) {
      if (!existing.calendarAuthoritative) continue; // app owns this one now
      const parsed = parseEventTiming(event);
      if (!parsed) { skipped++; continue; }
      try {
        await db.update(schema.reservations).set({
          date: parsed.date,
          time: parsed.time,
          durationMinutes: parsed.durationMinutes,
          guestName: event.summary?.trim() || existing.guestName,
          notes: event.description || existing.notes,
        }).where(eq(schema.reservations.id, existing.id));
        updated++;
      } catch (err) {
        console.error(`calendar: could not sync event ${event.id}:`, err instanceof Error ? err.message : err);
        skipped++;
      }
      continue;
    }

    // A genuinely new external event.
    if (!defaultTableId) { skipped++; continue; }
    const parsed = parseEventTiming(event);
    if (!parsed) { skipped++; continue; }
    try {
      await db.insert(schema.reservations).values({
        id: randomUUID(),
        createdDate: new Date().toISOString(),
        tableId: defaultTableId,
        date: parsed.date,
        time: parsed.time,
        durationMinutes: parsed.durationMinutes,
        // Party size can't be reliably read off a bare Calendar event - a
        // human corrects it in-app; this just gets it onto the floor.
        partySize: 1,
        guestName: event.summary?.trim() || 'Calendar booking',
        status: 'confirmed',
        notes: event.description || `Imported from Google Calendar${event.summary ? `: "${event.summary}"` : ''}`,
        googleEventId: event.id,
        calendarAuthoritative: true,
      });
      pulled++;
    } catch (err) {
      // Most likely the overlap EXCLUDE constraint - the default table
      // already has an active booking in this window.
      console.error(`calendar: could not import event ${event.id}:`, err instanceof Error ? err.message : err);
      skipped++;
    }
  }

  return { pulled, updated, skipped };
}
