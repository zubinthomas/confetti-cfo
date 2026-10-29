// What the public self check-in page can do (server/routes/publicCheckin.ts).
// Everything here is reachable without a login, behind the on-site token, so it
// returns the least it can: area names, counts, and a guest's own spot. Never
// other guests' names or numbers, and never a staff-made sign-in.
import { randomUUID } from 'node:crypto';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';
import { istNow, istDayBounds } from './reservations.ts';
import { nextSortOrder } from './guestSignIns.ts';
import { checkArea, type CheckResult } from './tableCheck.ts';
import { getCheckinSettings, normalisePhone } from './checkinSettings.ts';

export class PublicCheckinError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function offeredArea(areaId: unknown) {
  if (typeof areaId !== 'string') throw new PublicCheckinError('Choose where you would like to sit');
  const [area] = await db.select().from(schema.reservationAreas).where(eq(schema.reservationAreas.id, areaId));
  if (!area || area.archivedAt || !area.checkinEnabled) throw new PublicCheckinError('That area is not available for check-in');
  return area;
}

async function validParty(partySize: unknown) {
  const { maxPartySize } = await getCheckinSettings();
  if (typeof partySize !== 'number' || !Number.isInteger(partySize) || partySize < 1 || partySize > maxPartySize) {
    throw new PublicCheckinError(`Party size must be from 1 to ${maxPartySize}`);
  }
  return partySize;
}

export async function publicConfig() {
  await ready();
  const s = await getCheckinSettings();
  const areas = await db.select({ id: schema.reservationAreas.id, name: schema.reservationAreas.name, floor: schema.reservationAreas.floor })
    .from(schema.reservationAreas)
    .where(and(eq(schema.reservationAreas.checkinEnabled, true), isNull(schema.reservationAreas.archivedAt)))
    .orderBy(asc(schema.reservationAreas.createdDate), asc(schema.reservationAreas.name));
  return { areas, maxPartySize: s.maxPartySize, venueWhatsapp: s.venueWhatsapp, shopUrl: s.shopUrl };
}

export async function publicCheck(areaId: unknown, partySize: unknown, now = new Date()): Promise<CheckResult> {
  await ready();
  const area = await offeredArea(areaId);
  return checkArea(area.id, await validParty(partySize), now);
}

export type SpotState = 'waiting' | 'ready' | 'seated' | 'left';

export interface Spot {
  id: string;
  state: SpotState;
  /** 1 = next up. Only while waiting. */
  position: number | null;
  quotedWaitMinutes: number | null;
  partySize: number;
  areaName: string | null;
}

async function loadSelfEntry(id: unknown) {
  if (typeof id !== 'string') throw new PublicCheckinError('Not found', 404);
  const [row] = await db.select().from(schema.guestSignIns).where(eq(schema.guestSignIns.id, id));
  if (!row || row.source !== 'self') throw new PublicCheckinError('Not found', 404);
  return row;
}

export async function spotStatus(id: unknown, now = new Date()): Promise<Spot> {
  await ready();
  const row = await loadSelfEntry(id);
  const [area] = row.areaId ? await db.select().from(schema.reservationAreas).where(eq(schema.reservationAreas.id, row.areaId)) : [];
  const state: SpotState = row.signedOutAt ? 'left' : row.tableId ? 'seated' : row.notifiedAt ? 'ready' : 'waiting';

  let position: number | null = null;
  if (!row.signedOutAt && !row.tableId) {
    const { gte, lt } = istDayBounds(istNow(now).date);
    const queue = (await db.select().from(schema.guestSignIns).where(and(
      isNull(schema.guestSignIns.tableId), isNull(schema.guestSignIns.signedOutAt),
      row.areaId ? eq(schema.guestSignIns.areaId, row.areaId) : isNull(schema.guestSignIns.areaId),
    ))).filter((g) => g.signedInAt >= gte && g.signedInAt < lt)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.signedInAt.localeCompare(b.signedInAt));
    const at = queue.findIndex((g) => g.id === row.id);
    position = at === -1 ? null : at + 1;
  }
  return { id: row.id, state, position, quotedWaitMinutes: row.quotedWaitMinutes, partySize: row.partySize, areaName: area?.name ?? null };
}

const cleanName = (raw: unknown) => (typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) : '');

export interface JoinResult { spot: Spot; check: CheckResult | null; existing: boolean }

/** Put the guest on the waiting list. The wait is worked out here, never taken
 *  from the page. One active entry per phone number: a repeat returns it. */
export async function joinWaitingList(
  input: { areaId: unknown; partySize: unknown; phone: unknown; name?: unknown }, now = new Date(),
): Promise<JoinResult> {
  await ready();
  const area = await offeredArea(input.areaId);
  const partySize = await validParty(input.partySize);
  const digits = normalisePhone(typeof input.phone === 'string' ? input.phone : '');
  if (!digits) throw new PublicCheckinError('Enter a valid WhatsApp number');
  const phone = `+${digits}`;

  const { gte, lt } = istDayBounds(istNow(now).date);
  const [active] = (await db.select().from(schema.guestSignIns).where(and(
    eq(schema.guestSignIns.guestPhone, phone), eq(schema.guestSignIns.source, 'self'), isNull(schema.guestSignIns.signedOutAt),
  ))).filter((g) => g.signedInAt >= gte && g.signedInAt < lt);
  if (active) return { spot: await spotStatus(active.id, now), check: null, existing: true };

  const check = await checkArea(area.id, partySize, now);
  if (check.status === 'too_large') throw new PublicCheckinError('We can not seat a party that size together. Please speak to our host.', 422, 'too_large');
  if (check.status === 'long_wait') throw new PublicCheckinError('The wait is long right now. Please speak to our host.', 422, 'long_wait');

  const id = randomUUID();
  const stamp = now.toISOString();
  await db.insert(schema.guestSignIns).values({
    id,
    createdDate: stamp,
    visitType: 'walk_in',
    guestName: cleanName(input.name) || `Guest ...${digits.slice(-4)}`,
    guestPhone: phone,
    partySize,
    areaId: area.id,
    signedInAt: stamp,
    notes: 'Self check-in',
    sortOrder: await nextSortOrder(area.id),
    quotedWaitMinutes: check.status === 'available' ? 0 : check.minutes,
    source: 'self',
  });
  return { spot: await spotStatus(id, now), check, existing: false };
}

/** The guest changes their mind. Refused once a host has seated them. */
export async function leaveWaitingList(id: unknown, now = new Date()): Promise<Spot> {
  await ready();
  const row = await loadSelfEntry(id);
  if (row.tableId) throw new PublicCheckinError('You are already seated. Please speak to our host.', 409);
  if (!row.signedOutAt) {
    await db.update(schema.guestSignIns).set({ signedOutAt: now.toISOString() }).where(eq(schema.guestSignIns.id, id as string));
  }
  return spotStatus(id, now);
}

/** Active sections and available items, for one area plus the sections shown everywhere. */
export async function publicMenu(areaId?: unknown) {
  await ready();
  const wanted = typeof areaId === 'string' && areaId ? areaId : null;
  const sections = await db.select().from(schema.menuSections)
    .where(and(isNull(schema.menuSections.archivedAt),
      wanted ? or(isNull(schema.menuSections.areaId), eq(schema.menuSections.areaId, wanted)) : undefined))
    .orderBy(asc(schema.menuSections.sortOrder), asc(schema.menuSections.createdDate));
  const items = await db.select().from(schema.menuItems).where(eq(schema.menuItems.available, true))
    .orderBy(asc(schema.menuItems.sortOrder), asc(schema.menuItems.createdDate));
  return sections
    .map((s) => ({
      id: s.id, name: s.name, areaId: s.areaId,
      items: items.filter((i) => i.sectionId === s.id).map((i) => ({ id: i.id, name: i.name, description: i.description, priceInr: i.priceInr })),
    }))
    .filter((s) => s.items.length > 0);
}
