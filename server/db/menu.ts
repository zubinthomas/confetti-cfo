// The guest-facing menu shown on the check-in page: sections (optionally tied
// to one area) holding priced items. Staff edit it with the Menu permission;
// the public read lives in publicCheckin.ts. Archive hides a section, delete
// removes it and its items.
import { randomUUID } from 'node:crypto';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';

export class MenuError extends Error {}

export type MenuSection = typeof schema.menuSections.$inferSelect;
export type MenuItem = typeof schema.menuItems.$inferSelect;

const text = (name: string, v: unknown, max: number): string => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) throw new MenuError(`${name} is required`);
  if (s.length > max) throw new MenuError(`${name} must be ${max} characters or fewer`);
  return s;
};
const price = (v: unknown): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 1_000_000) {
    throw new MenuError('Price must be a whole number of rupees, 0 or more');
  }
  return v;
};

async function checkArea(areaId: unknown): Promise<string | null> {
  if (areaId === null || areaId === undefined || areaId === '') return null;
  if (typeof areaId !== 'string') throw new MenuError('Unknown area');
  const [a] = await db.select({ id: schema.reservationAreas.id }).from(schema.reservationAreas)
    .where(eq(schema.reservationAreas.id, areaId));
  if (!a) throw new MenuError('Unknown area');
  return areaId;
}

/** Every section (archived too) with all its items, in display order. */
export async function listMenu() {
  await ready();
  const sections = await db.select().from(schema.menuSections)
    .orderBy(asc(schema.menuSections.sortOrder), asc(schema.menuSections.createdDate));
  const items = await db.select().from(schema.menuItems)
    .orderBy(asc(schema.menuItems.sortOrder), asc(schema.menuItems.createdDate));
  return sections.map((s) => ({ ...s, items: items.filter((i) => i.sectionId === s.id) }));
}

async function nextOrder(table: 'sections' | 'items', sectionId?: string): Promise<number> {
  const [row] = table === 'sections'
    ? await db.select({ n: sql<number>`coalesce(max(${schema.menuSections.sortOrder}), -1) + 1` }).from(schema.menuSections)
    : await db.select({ n: sql<number>`coalesce(max(${schema.menuItems.sortOrder}), -1) + 1` }).from(schema.menuItems)
      .where(eq(schema.menuItems.sectionId, sectionId!));
  return Number(row.n);
}

export async function createSection(b: { name?: unknown; areaId?: unknown }): Promise<MenuSection> {
  await ready();
  const [row] = await db.insert(schema.menuSections).values({
    id: randomUUID(), createdDate: new Date().toISOString(),
    name: text('Section name', b.name, 60), areaId: await checkArea(b.areaId), sortOrder: await nextOrder('sections'),
  }).returning();
  return row;
}

export async function updateSection(id: string, b: { name?: unknown; areaId?: unknown; archived?: unknown }): Promise<MenuSection> {
  await ready();
  const patch: Partial<typeof schema.menuSections.$inferInsert> = {};
  if (b.name !== undefined) patch.name = text('Section name', b.name, 60);
  if (b.areaId !== undefined) patch.areaId = await checkArea(b.areaId);
  if (b.archived !== undefined) patch.archivedAt = b.archived ? new Date().toISOString() : null;
  if (Object.keys(patch).length === 0) throw new MenuError('Nothing to change');
  const [row] = await db.update(schema.menuSections).set(patch).where(eq(schema.menuSections.id, id)).returning();
  if (!row) throw new MenuError('Section not found');
  return row;
}

export async function deleteSection(id: string): Promise<void> {
  await ready();
  const gone = await db.delete(schema.menuSections).where(eq(schema.menuSections.id, id)).returning({ id: schema.menuSections.id });
  if (gone.length === 0) throw new MenuError('Section not found');
}

export async function createItem(sectionId: string, b: { name?: unknown; description?: unknown; priceInr?: unknown; available?: unknown }): Promise<MenuItem> {
  await ready();
  const [s] = await db.select({ id: schema.menuSections.id }).from(schema.menuSections).where(eq(schema.menuSections.id, sectionId));
  if (!s) throw new MenuError('Section not found');
  const [row] = await db.insert(schema.menuItems).values({
    id: randomUUID(), createdDate: new Date().toISOString(), sectionId,
    name: text('Item name', b.name, 80),
    description: typeof b.description === 'string' && b.description.trim() ? b.description.trim().slice(0, 200) : null,
    priceInr: price(b.priceInr), sortOrder: await nextOrder('items', sectionId), available: b.available !== false,
  }).returning();
  return row;
}

export async function updateItem(id: string, b: { name?: unknown; description?: unknown; priceInr?: unknown; available?: unknown }): Promise<MenuItem> {
  await ready();
  const patch: Partial<typeof schema.menuItems.$inferInsert> = {};
  if (b.name !== undefined) patch.name = text('Item name', b.name, 80);
  if (b.description !== undefined) patch.description = typeof b.description === 'string' && b.description.trim() ? b.description.trim().slice(0, 200) : null;
  if (b.priceInr !== undefined) patch.priceInr = price(b.priceInr);
  if (b.available !== undefined) patch.available = b.available === true;
  if (Object.keys(patch).length === 0) throw new MenuError('Nothing to change');
  const [row] = await db.update(schema.menuItems).set(patch).where(eq(schema.menuItems.id, id)).returning();
  if (!row) throw new MenuError('Item not found');
  return row;
}

export async function deleteItem(id: string): Promise<void> {
  await ready();
  const gone = await db.delete(schema.menuItems).where(eq(schema.menuItems.id, id)).returning({ id: schema.menuItems.id });
  if (gone.length === 0) throw new MenuError('Item not found');
}

/** Rewrite sort order from an id list (the order the client now shows). */
export async function reorder(kind: 'sections' | 'items', ids: unknown): Promise<void> {
  await ready();
  if (!Array.isArray(ids) || ids.some((i) => typeof i !== 'string') || new Set(ids).size !== ids.length) {
    throw new MenuError('Send each id once');
  }
  const t = kind === 'sections' ? schema.menuSections : schema.menuItems;
  const found = await db.select({ id: t.id }).from(t).where(inArray(t.id, ids as string[]));
  if (found.length !== ids.length) throw new MenuError('Unknown id in the list');
  await db.transaction(async (tx) => {
    for (const [i, id] of (ids as string[]).entries()) await tx.update(t).set({ sortOrder: i }).where(eq(t.id, id));
  });
}
