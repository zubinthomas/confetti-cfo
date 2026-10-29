// Config for the public self check-in page ("Check a Table"): see schema.ts.
// One row, created on first read with a fresh on-site token. The token is what
// the QR code carries; rotating it kills every printed or bookmarked link.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';

export class CheckinError extends Error {}

export const DEFAULT_SHOP_URL = 'https://siennastore.com';

export type CheckinSettings = typeof schema.checkinSettings.$inferSelect;

const newToken = () => randomBytes(24).toString('base64url');

/** The settings row, created with a random token on first use. */
export async function getCheckinSettings(): Promise<CheckinSettings> {
  await ready();
  const [row] = await db.select().from(schema.checkinSettings).where(eq(schema.checkinSettings.id, 1));
  if (row) return row;
  await db.insert(schema.checkinSettings).values({
    id: 1, token: newToken(), shopUrl: DEFAULT_SHOP_URL, updatedAt: new Date().toISOString(),
  }).onConflictDoNothing();
  const [created] = await db.select().from(schema.checkinSettings).where(eq(schema.checkinSettings.id, 1));
  return created;
}

/** Digits only, country code first, no plus: the form wa.me links take. A bare
 *  10-digit Indian number gets 91 in front. Null when it can't be a number. */
export function normalisePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

const int = (name: string, v: unknown, min: number, max: number): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw new CheckinError(`${name} must be a whole number from ${min} to ${max}`);
  }
  return v;
};

export interface CheckinPatch {
  enabled?: boolean;
  bookingBufferMinutes?: number;
  minutesPerParty?: number;
  maxWaitMinutes?: number;
  venueWhatsapp?: string | null;
  shopUrl?: string | null;
}

export async function updateCheckinSettings(patch: CheckinPatch): Promise<CheckinSettings> {
  await getCheckinSettings();
  const set: Partial<typeof schema.checkinSettings.$inferInsert> = {};
  if (patch.enabled !== undefined) {
    if (typeof patch.enabled !== 'boolean') throw new CheckinError('enabled must be true or false');
    set.enabled = patch.enabled;
  }
  if (patch.bookingBufferMinutes !== undefined) set.bookingBufferMinutes = int('Booking buffer', patch.bookingBufferMinutes, 0, 480);
  if (patch.minutesPerParty !== undefined) set.minutesPerParty = int('Minutes per party', patch.minutesPerParty, 0, 120);
  if (patch.maxWaitMinutes !== undefined) set.maxWaitMinutes = int('Max wait', patch.maxWaitMinutes, 5, 720);
  if (patch.venueWhatsapp !== undefined) {
    const raw = patch.venueWhatsapp?.trim();
    if (!raw) set.venueWhatsapp = null;
    else {
      const n = normalisePhone(raw);
      if (!n) throw new CheckinError('Venue WhatsApp number must be 10 digits, or include the country code');
      set.venueWhatsapp = n;
    }
  }
  if (patch.shopUrl !== undefined) {
    const raw = patch.shopUrl?.trim();
    if (!raw) set.shopUrl = null;
    else {
      let url: URL;
      try { url = new URL(raw); } catch { throw new CheckinError('Shop link must be a full web address'); }
      if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new CheckinError('Shop link must start with http:// or https://');
      set.shopUrl = url.toString();
    }
  }
  if (Object.keys(set).length === 0) return getCheckinSettings();
  set.updatedAt = new Date().toISOString();
  const [row] = await db.update(schema.checkinSettings).set(set).where(eq(schema.checkinSettings.id, 1)).returning();
  return row;
}

/** A new token: every printed QR code and saved link stops working. */
export async function rotateCheckinToken(): Promise<CheckinSettings> {
  await getCheckinSettings();
  const [row] = await db.update(schema.checkinSettings)
    .set({ token: newToken(), updatedAt: new Date().toISOString() })
    .where(eq(schema.checkinSettings.id, 1)).returning();
  return row;
}

/** Constant-time check of a token from the public page against the stored one.
 *  False when check-in is switched off, so a disabled page refuses everything. */
export async function checkinTokenValid(token: unknown): Promise<boolean> {
  if (typeof token !== 'string' || token.length === 0 || token.length > 200) return false;
  const s = await getCheckinSettings();
  if (!s.enabled) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(s.token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Show or hide one area on the guest page. Areas are offered by default. */
export async function setAreaOffered(areaId: unknown, offered: unknown) {
  await ready();
  if (typeof areaId !== 'string') throw new CheckinError('Unknown area');
  if (typeof offered !== 'boolean') throw new CheckinError('offered must be true or false');
  const updated = await db.update(schema.reservationAreas).set({ checkinEnabled: offered })
    .where(eq(schema.reservationAreas.id, areaId)).returning({ id: schema.reservationAreas.id });
  if (updated.length === 0) throw new CheckinError('Unknown area');
}
