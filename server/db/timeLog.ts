// Engagement-hours log against the spec's 60h/month delivery budget (see
// schema.ts's time_log_entries comment). Discrete, correctable entries - a
// mis-logged row gets deleted outright, not corrected via an append-only
// history like revenue_target_revisions.
import { and, desc, eq, gte, lt } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';

export class TimeLogError extends Error {}

export interface TimeLogFilters {
  /** YYYY-MM - entries whose date falls in this calendar month. */
  month?: string;
}

export async function listEntries(filters: TimeLogFilters = {}) {
  await ready();
  let query = db
    .select({
      id: schema.timeLogEntries.id,
      date: schema.timeLogEntries.date,
      hours: schema.timeLogEntries.hours,
      note: schema.timeLogEntries.note,
      createdByUserId: schema.timeLogEntries.createdByUserId,
      createdByName: schema.users.fullName,
      createdByEmail: schema.users.email,
    })
    .from(schema.timeLogEntries)
    .leftJoin(schema.users, eq(schema.users.id, schema.timeLogEntries.createdByUserId))
    .$dynamic();

  if (filters.month) {
    if (!/^\d{4}-\d{2}$/.test(filters.month)) throw new TimeLogError('month must be YYYY-MM');
    const [y, m] = filters.month.split('-').map(Number);
    const from = `${filters.month}-01`;
    const to = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    query = query.where(and(gte(schema.timeLogEntries.date, from), lt(schema.timeLogEntries.date, to)));
  }

  return query.orderBy(desc(schema.timeLogEntries.date), desc(schema.timeLogEntries.id));
}

export async function createEntry(userId: number, input: { date: string; hours: number; note?: string | null }) {
  await ready();
  const { date, hours, note } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new TimeLogError('date must be YYYY-MM-DD');
  if (!Number.isFinite(hours) || hours <= 0) throw new TimeLogError('hours must be a positive number');

  const [entry] = await db.insert(schema.timeLogEntries).values({
    date, hours, note: note || null, createdByUserId: userId,
  }).returning();
  return entry;
}

export async function deleteEntry(id: number) {
  await ready();
  const [deleted] = await db.delete(schema.timeLogEntries).where(eq(schema.timeLogEntries.id, id)).returning();
  if (!deleted) throw new TimeLogError(`No time log entry with id ${id}`);
  return deleted;
}
