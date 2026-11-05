// Resolve one PetPooja Item Stock On/Off payload against the existing
// petpooja_menu_items / petpooja_menu_addon_items rows it targets.
//
// Unlike mergeMenu.ts's 5 catalog merges (every Menu Push/Fetch call is the
// merchant's *entire* current catalog, so each gets a create path and a
// resolve-sweep), a Stock call is a targeted list of ids against a catalog
// Menu Push already populated: no creates (this app has no business
// inventing a catalog row from a stock toggle alone), no sweep (an id not
// in this call simply wasn't mentioned, not implicitly turned back on), and
// an id with no matching row is tracked in stats.notFound only, not
// reported as a "change" - see parseStockPayload.ts's own leniency
// posture. Two explicit branches (item vs. addon), not one generic path
// over both tables - Drizzle's per-table column types don't abstract over
// cleanly, same reasoning mergeMenu.ts/mergeCompliance.ts already give for
// writing each matcher out by hand rather than forcing a shared generic.
import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db/client.ts';
import type { ParsedPetpoojaStockPayload, RecordChange } from './types.ts';

// creates is always 0 - Stock never creates a catalog row (see header
// comment) - kept so this satisfies merge.ts's shared TableStats shape
// ({creates, updates, unchanged}) the same way mergeMenu.ts's own stats do.
export interface StockMergeStats { creates: number; updates: number; unchanged: number; matched: number; notFound: number }
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export interface PetpoojaStockMergePlan {
  stats: { petpoojaStock: StockMergeStats };
  details: { petpoojaStock: RecordChange[] };
  ops: ((tx: Tx) => Promise<void>)[];
}

function diff(
  current: { inStock: boolean; autoTurnOnTime: string | null; customTurnOnTime: string | null },
  nextInStock: boolean, nextAutoTurnOnTime: string | null, nextCustomTurnOnTime: string | null,
): { changed: boolean; fields: { field: string; from: unknown; to: unknown }[] } {
  const fields = [
    ...(current.inStock !== nextInStock ? [{ field: 'inStock', from: current.inStock, to: nextInStock }] : []),
    ...(current.autoTurnOnTime !== nextAutoTurnOnTime ? [{ field: 'autoTurnOnTime', from: current.autoTurnOnTime, to: nextAutoTurnOnTime }] : []),
    ...(current.customTurnOnTime !== nextCustomTurnOnTime ? [{ field: 'customTurnOnTime', from: current.customTurnOnTime, to: nextCustomTurnOnTime }] : []),
  ];
  return { changed: fields.length > 0, fields };
}

async function mergeStockItems(
  payload: ParsedPetpoojaStockPayload, stats: StockMergeStats, details: RecordChange[], ops: ((tx: Tx) => Promise<void>)[],
) {
  const existing = await db.select().from(schema.petpoojaMenuItems)
    .where(inArray(schema.petpoojaMenuItems.itemId, payload.itemIds));
  const byItemId = new Map(existing.map((e) => [e.itemId, e]));
  const nextAutoTurnOnTime = payload.inStock ? null : payload.autoTurnOnTime;
  const nextCustomTurnOnTime = payload.inStock ? null : payload.customTurnOnTime;

  for (const id of payload.itemIds) {
    const row = byItemId.get(id);
    if (!row) { stats.notFound++; continue; }
    stats.matched++;
    const { changed, fields } = diff(row, payload.inStock, nextAutoTurnOnTime, nextCustomTurnOnTime);
    if (!changed) { stats.unchanged++; continue; }
    const rowId = row.id;
    ops.push(async (tx) => {
      await tx.update(schema.petpoojaMenuItems).set({
        inStock: payload.inStock, autoTurnOnTime: nextAutoTurnOnTime, customTurnOnTime: nextCustomTurnOnTime,
      }).where(eq(schema.petpoojaMenuItems.id, rowId));
    });
    stats.updates++;
    details.push({ action: 'update', description: row.name, fields });
  }
}

async function mergeStockAddonItems(
  payload: ParsedPetpoojaStockPayload, stats: StockMergeStats, details: RecordChange[], ops: ((tx: Tx) => Promise<void>)[],
) {
  const existing = await db.select().from(schema.petpoojaMenuAddonItems)
    .where(inArray(schema.petpoojaMenuAddonItems.addonItemId, payload.itemIds));
  const byAddonItemId = new Map(existing.map((e) => [e.addonItemId, e]));
  const nextAutoTurnOnTime = payload.inStock ? null : payload.autoTurnOnTime;
  const nextCustomTurnOnTime = payload.inStock ? null : payload.customTurnOnTime;

  for (const id of payload.itemIds) {
    const row = byAddonItemId.get(id);
    if (!row) { stats.notFound++; continue; }
    stats.matched++;
    const { changed, fields } = diff(row, payload.inStock, nextAutoTurnOnTime, nextCustomTurnOnTime);
    if (!changed) { stats.unchanged++; continue; }
    const rowId = row.id;
    ops.push(async (tx) => {
      await tx.update(schema.petpoojaMenuAddonItems).set({
        inStock: payload.inStock, autoTurnOnTime: nextAutoTurnOnTime, customTurnOnTime: nextCustomTurnOnTime,
      }).where(eq(schema.petpoojaMenuAddonItems.id, rowId));
    });
    stats.updates++;
    details.push({ action: 'update', description: row.name, fields });
  }
}

export async function buildPetpoojaStockMergePlan(payload: ParsedPetpoojaStockPayload): Promise<PetpoojaStockMergePlan> {
  const stats: StockMergeStats = { creates: 0, updates: 0, unchanged: 0, matched: 0, notFound: 0 };
  const details: RecordChange[] = [];
  const ops: ((tx: Tx) => Promise<void>)[] = [];

  if (payload.type === 'item') {
    await mergeStockItems(payload, stats, details, ops);
  } else {
    await mergeStockAddonItems(payload, stats, details, ops);
  }

  return { stats: { petpoojaStock: stats }, details: { petpoojaStock: details }, ops };
}
