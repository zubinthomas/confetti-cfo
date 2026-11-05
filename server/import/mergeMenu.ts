// Resolve one PetPooja Menu Push/Fetch payload against the 5
// petpooja_menu_* catalog tables + the petpooja_menu_config singleton row.
// Five independent loops, one per table (not a shared generic) - same house
// style as mergeCompliance.ts (Drizzle's per-table column types don't
// abstract over cleanly, and mergeBills.ts/mergeOrders.ts/mergeCompliance.ts
// already establish writing each matcher out explicitly).
//
// Unlike mergePetpoojaSales.ts (create/update-only - one webhook call is one
// order, never a snapshot), every one of these 5 tables uses mergeBills.ts's
// resolve-sweep: process every incoming row by natural key, then flip any
// existing row NOT seen this cycle to inactive (never delete, same
// audit-trail posture as tallyBills.status) - because every Menu Push/Fetch
// call carries the merchant's *entire* current catalog, exactly like
// Tally's bill-wise report is a full snapshot every cycle, not an
// incremental diff.
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client.ts';
import type {
  ParsedPetpoojaMenuAddonGroup, ParsedPetpoojaMenuAddonItem, ParsedPetpoojaMenuCategory,
  ParsedPetpoojaMenuItem, ParsedPetpoojaMenuPayload, ParsedPetpoojaMenuTax, RecordChange,
} from './types.ts';

export interface TableStats { creates: number; updates: number; unchanged: number; resolves: number }
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export interface PetpoojaMenuMergePlan {
  stats: {
    petpoojaMenuCategories: TableStats; petpoojaMenuItems: TableStats;
    petpoojaMenuAddonGroups: TableStats; petpoojaMenuAddonItems: TableStats; petpoojaMenuTaxes: TableStats;
  };
  details: {
    petpoojaMenuCategories: RecordChange[]; petpoojaMenuItems: RecordChange[];
    petpoojaMenuAddonGroups: RecordChange[]; petpoojaMenuAddonItems: RecordChange[]; petpoojaMenuTaxes: RecordChange[];
  };
  ops: ((tx: Tx) => Promise<void>)[];
}

const stat = (): TableStats => ({ creates: 0, updates: 0, unchanged: 0, resolves: 0 });

// item_tax/variation/addon/combo_details/nutrition/cuisine/item_tags are
// JSONB - see mergePetpoojaSales.ts's header comment for why Object.is (and
// even JSON.stringify) permanently breaks the no-op guarantee for JSONB
// columns: a db-read value and a freshly parsed one are never the same
// object even when identical, and Postgres's jsonb column type reorders
// object keys internally on storage.
const ITEM_JSON_FIELDS = new Set(['itemTax', 'variations', 'addon', 'comboDetails', 'nutrition', 'cuisine', 'tags']);

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

function fieldChanged(field: string, from: unknown, to: unknown): boolean {
  if (ITEM_JSON_FIELDS.has(field)) return !deepEqual(from ?? null, to ?? null);
  return !Object.is(from, to);
}

async function mergeCategories(
  petpoojaSourceId: number, records: ParsedPetpoojaMenuCategory[], now: string,
  stats: TableStats, details: RecordChange[], ops: ((tx: Tx) => Promise<void>)[],
) {
  const existing = await db.select().from(schema.petpoojaMenuCategories)
    .where(eq(schema.petpoojaMenuCategories.petpoojaSourceId, petpoojaSourceId));
  const byKey = new Map(existing.map((e) => [e.matchKey, e]));
  const seenKeys = new Set<string>();

  for (const r of records) {
    const key = r.categoryId;
    seenKeys.add(key);
    const payload = {
      categoryId: r.categoryId, parentCategoryId: r.parentCategoryId, name: r.name,
      rank: r.rank, timings: r.timings, imageUrl: r.imageUrl, active: r.active,
      matchKey: key, lastSeenAt: now,
    };
    const match = byKey.get(key);

    if (!match) {
      const id = randomUUID();
      ops.push(async (tx) => { await tx.insert(schema.petpoojaMenuCategories).values({ id, createdDate: now, petpoojaSourceId, ...payload }); });
      stats.creates++;
      details.push({ action: 'create', description: r.name, fields: Object.entries(payload).filter(([, v]) => v != null).map(([field, to]) => ({ field, from: null as unknown, to })) });
      continue;
    }

    const changed: { field: string; from: unknown; to: unknown }[] = [];
    const set: Record<string, unknown> = {};
    for (const [field, to] of Object.entries(payload)) {
      if (field === 'lastSeenAt') continue; // see mergePetpoojaSales.ts: excluded from the diff, written alongside any real change
      const from = (match as Record<string, unknown>)[field];
      if (!Object.is(from, to)) { changed.push({ field, from, to }); set[field] = to; }
    }
    if (changed.length === 0) { stats.unchanged++; continue; }
    set.lastSeenAt = now;
    const matchId = match.id;
    ops.push(async (tx) => { await tx.update(schema.petpoojaMenuCategories).set(set).where(eq(schema.petpoojaMenuCategories.id, matchId)); });
    stats.updates++;
    details.push({ action: 'update', description: r.name, fields: changed });
  }

  for (const e of existing) {
    if (!e.active || seenKeys.has(e.matchKey)) continue;
    const id = e.id;
    ops.push(async (tx) => { await tx.update(schema.petpoojaMenuCategories).set({ active: false }).where(eq(schema.petpoojaMenuCategories.id, id)); });
    stats.resolves++;
    details.push({ action: 'update', description: `${e.name} (deactivated)`, fields: [{ field: 'active', from: true, to: false }] });
  }
}

async function mergeItems(
  petpoojaSourceId: number, records: ParsedPetpoojaMenuItem[], now: string,
  stats: TableStats, details: RecordChange[], ops: ((tx: Tx) => Promise<void>)[],
) {
  const existing = await db.select().from(schema.petpoojaMenuItems)
    .where(eq(schema.petpoojaMenuItems.petpoojaSourceId, petpoojaSourceId));
  const byKey = new Map(existing.map((e) => [e.matchKey, e]));
  const seenKeys = new Set<string>();

  for (const r of records) {
    const key = r.itemId;
    seenKeys.add(key);
    const payload = {
      itemId: r.itemId, categoryId: r.categoryId, name: r.name, description: r.description,
      price: r.price, markupPrice: r.markupPrice, rank: r.rank, attributeId: r.attributeId,
      allowVariation: r.allowVariation, allowAddon: r.allowAddon, addonBasedOnVariation: r.addonBasedOnVariation,
      orderTypeRaw: r.orderTypeRaw, gstType: r.gstType, taxInclusive: r.taxInclusive,
      ignoreTaxes: r.ignoreTaxes, ignoreDiscounts: r.ignoreDiscounts, packingCharges: r.packingCharges,
      isRecommended: r.isRecommended, isFavorite: r.isFavorite, isCombo: r.isCombo, imageUrl: r.imageUrl,
      minimumPreparationTime: r.minimumPreparationTime, spiceLevel: r.spiceLevel,
      itemTax: r.itemTax, variations: r.variations, addon: r.addon, comboDetails: r.comboDetails,
      nutrition: r.nutrition, cuisine: r.cuisine, tags: r.tags,
      active: r.active, matchKey: key, lastSeenAt: now,
    };
    const match = byKey.get(key);

    if (!match) {
      const id = randomUUID();
      ops.push(async (tx) => { await tx.insert(schema.petpoojaMenuItems).values({ id, createdDate: now, petpoojaSourceId, ...payload }); });
      stats.creates++;
      details.push({ action: 'create', description: r.name, fields: Object.entries(payload).filter(([, v]) => v != null).map(([field, to]) => ({ field, from: null as unknown, to })) });
      continue;
    }

    const changed: { field: string; from: unknown; to: unknown }[] = [];
    const set: Record<string, unknown> = {};
    for (const [field, to] of Object.entries(payload)) {
      if (field === 'lastSeenAt') continue;
      const from = (match as Record<string, unknown>)[field];
      if (fieldChanged(field, from, to)) { changed.push({ field, from, to }); set[field] = to; }
    }
    if (changed.length === 0) { stats.unchanged++; continue; }
    set.lastSeenAt = now;
    const matchId = match.id;
    ops.push(async (tx) => { await tx.update(schema.petpoojaMenuItems).set(set).where(eq(schema.petpoojaMenuItems.id, matchId)); });
    stats.updates++;
    details.push({ action: 'update', description: r.name, fields: changed });
  }

  for (const e of existing) {
    if (!e.active || seenKeys.has(e.matchKey)) continue;
    const id = e.id;
    ops.push(async (tx) => { await tx.update(schema.petpoojaMenuItems).set({ active: false }).where(eq(schema.petpoojaMenuItems.id, id)); });
    stats.resolves++;
    details.push({ action: 'update', description: `${e.name} (deactivated)`, fields: [{ field: 'active', from: true, to: false }] });
  }
}

async function mergeAddonGroups(
  petpoojaSourceId: number, records: ParsedPetpoojaMenuAddonGroup[], now: string,
  stats: TableStats, details: RecordChange[], ops: ((tx: Tx) => Promise<void>)[],
) {
  const existing = await db.select().from(schema.petpoojaMenuAddonGroups)
    .where(eq(schema.petpoojaMenuAddonGroups.petpoojaSourceId, petpoojaSourceId));
  const byKey = new Map(existing.map((e) => [e.matchKey, e]));
  const seenKeys = new Set<string>();

  for (const r of records) {
    const key = r.addonGroupId;
    seenKeys.add(key);
    const payload = { addonGroupId: r.addonGroupId, name: r.name, rank: r.rank, active: r.active, matchKey: key, lastSeenAt: now };
    const match = byKey.get(key);

    if (!match) {
      const id = randomUUID();
      ops.push(async (tx) => { await tx.insert(schema.petpoojaMenuAddonGroups).values({ id, createdDate: now, petpoojaSourceId, ...payload }); });
      stats.creates++;
      details.push({ action: 'create', description: r.name, fields: Object.entries(payload).filter(([, v]) => v != null).map(([field, to]) => ({ field, from: null as unknown, to })) });
      continue;
    }

    const changed: { field: string; from: unknown; to: unknown }[] = [];
    const set: Record<string, unknown> = {};
    for (const [field, to] of Object.entries(payload)) {
      if (field === 'lastSeenAt') continue;
      const from = (match as Record<string, unknown>)[field];
      if (!Object.is(from, to)) { changed.push({ field, from, to }); set[field] = to; }
    }
    if (changed.length === 0) { stats.unchanged++; continue; }
    set.lastSeenAt = now;
    const matchId = match.id;
    ops.push(async (tx) => { await tx.update(schema.petpoojaMenuAddonGroups).set(set).where(eq(schema.petpoojaMenuAddonGroups.id, matchId)); });
    stats.updates++;
    details.push({ action: 'update', description: r.name, fields: changed });
  }

  for (const e of existing) {
    if (!e.active || seenKeys.has(e.matchKey)) continue;
    const id = e.id;
    ops.push(async (tx) => { await tx.update(schema.petpoojaMenuAddonGroups).set({ active: false }).where(eq(schema.petpoojaMenuAddonGroups.id, id)); });
    stats.resolves++;
    details.push({ action: 'update', description: `${e.name} (deactivated)`, fields: [{ field: 'active', from: true, to: false }] });
  }
}

async function mergeAddonItems(
  petpoojaSourceId: number, records: ParsedPetpoojaMenuAddonItem[], now: string,
  stats: TableStats, details: RecordChange[], ops: ((tx: Tx) => Promise<void>)[],
) {
  const existing = await db.select().from(schema.petpoojaMenuAddonItems)
    .where(eq(schema.petpoojaMenuAddonItems.petpoojaSourceId, petpoojaSourceId));
  const byKey = new Map(existing.map((e) => [e.matchKey, e]));
  const seenKeys = new Set<string>();

  for (const r of records) {
    const key = r.addonItemId;
    seenKeys.add(key);
    const payload = { addonItemId: r.addonItemId, name: r.name, price: r.price, attributeId: r.attributeId, rank: r.rank, active: r.active, matchKey: key, lastSeenAt: now };
    const match = byKey.get(key);

    if (!match) {
      const id = randomUUID();
      ops.push(async (tx) => { await tx.insert(schema.petpoojaMenuAddonItems).values({ id, createdDate: now, petpoojaSourceId, ...payload }); });
      stats.creates++;
      details.push({ action: 'create', description: r.name, fields: Object.entries(payload).filter(([, v]) => v != null).map(([field, to]) => ({ field, from: null as unknown, to })) });
      continue;
    }

    const changed: { field: string; from: unknown; to: unknown }[] = [];
    const set: Record<string, unknown> = {};
    for (const [field, to] of Object.entries(payload)) {
      if (field === 'lastSeenAt') continue;
      const from = (match as Record<string, unknown>)[field];
      if (!Object.is(from, to)) { changed.push({ field, from, to }); set[field] = to; }
    }
    if (changed.length === 0) { stats.unchanged++; continue; }
    set.lastSeenAt = now;
    const matchId = match.id;
    ops.push(async (tx) => { await tx.update(schema.petpoojaMenuAddonItems).set(set).where(eq(schema.petpoojaMenuAddonItems.id, matchId)); });
    stats.updates++;
    details.push({ action: 'update', description: r.name, fields: changed });
  }

  for (const e of existing) {
    if (!e.active || seenKeys.has(e.matchKey)) continue;
    const id = e.id;
    ops.push(async (tx) => { await tx.update(schema.petpoojaMenuAddonItems).set({ active: false }).where(eq(schema.petpoojaMenuAddonItems.id, id)); });
    stats.resolves++;
    details.push({ action: 'update', description: `${e.name} (deactivated)`, fields: [{ field: 'active', from: true, to: false }] });
  }
}

async function mergeTaxes(
  petpoojaSourceId: number, records: ParsedPetpoojaMenuTax[], now: string,
  stats: TableStats, details: RecordChange[], ops: ((tx: Tx) => Promise<void>)[],
) {
  const existing = await db.select().from(schema.petpoojaMenuTaxes)
    .where(eq(schema.petpoojaMenuTaxes.petpoojaSourceId, petpoojaSourceId));
  const byKey = new Map(existing.map((e) => [e.matchKey, e]));
  const seenKeys = new Set<string>();

  for (const r of records) {
    const key = r.taxId;
    seenKeys.add(key);
    const payload = {
      taxId: r.taxId, name: r.name, rate: r.rate, taxType: r.taxType, orderTypeRaw: r.orderTypeRaw,
      coreOrTotal: r.coreOrTotal, forwardOrBackward: r.forwardOrBackward, description: r.description,
      rank: r.rank, active: r.active, matchKey: key, lastSeenAt: now,
    };
    const match = byKey.get(key);

    if (!match) {
      const id = randomUUID();
      ops.push(async (tx) => { await tx.insert(schema.petpoojaMenuTaxes).values({ id, createdDate: now, petpoojaSourceId, ...payload }); });
      stats.creates++;
      details.push({ action: 'create', description: r.name, fields: Object.entries(payload).filter(([, v]) => v != null).map(([field, to]) => ({ field, from: null as unknown, to })) });
      continue;
    }

    const changed: { field: string; from: unknown; to: unknown }[] = [];
    const set: Record<string, unknown> = {};
    for (const [field, to] of Object.entries(payload)) {
      if (field === 'lastSeenAt') continue;
      const from = (match as Record<string, unknown>)[field];
      if (!Object.is(from, to)) { changed.push({ field, from, to }); set[field] = to; }
    }
    if (changed.length === 0) { stats.unchanged++; continue; }
    set.lastSeenAt = now;
    const matchId = match.id;
    ops.push(async (tx) => { await tx.update(schema.petpoojaMenuTaxes).set(set).where(eq(schema.petpoojaMenuTaxes.id, matchId)); });
    stats.updates++;
    details.push({ action: 'update', description: r.name, fields: changed });
  }

  for (const e of existing) {
    if (!e.active || seenKeys.has(e.matchKey)) continue;
    const id = e.id;
    ops.push(async (tx) => { await tx.update(schema.petpoojaMenuTaxes).set({ active: false }).where(eq(schema.petpoojaMenuTaxes.id, id)); });
    stats.resolves++;
    details.push({ action: 'update', description: `${e.name} (deactivated)`, fields: [{ field: 'active', from: true, to: false }] });
  }
}

/** The config row is overwritten wholesale, never field-diffed - its
 *  `details` entry is a fixed single-element array (no fields) purely so it
 *  still participates in the batch-level no-op check (every other table's
 *  details array being empty would otherwise register as "no changes" even
 *  when the config blob actually changed). */
async function mergeConfig(
  petpoojaSourceId: number, raw: unknown, sourceKind: 'push' | 'fetch', now: string,
  details: RecordChange[], ops: ((tx: Tx) => Promise<void>)[],
) {
  const [existing] = await db.select().from(schema.petpoojaMenuConfig)
    .where(eq(schema.petpoojaMenuConfig.petpoojaSourceId, petpoojaSourceId));
  if (existing && deepEqual(existing.raw, raw) && existing.sourceKind === sourceKind) return;

  ops.push(async (tx) => {
    if (existing) {
      await tx.update(schema.petpoojaMenuConfig).set({ raw, sourceKind, updatedAt: now })
        .where(eq(schema.petpoojaMenuConfig.petpoojaSourceId, petpoojaSourceId));
    } else {
      await tx.insert(schema.petpoojaMenuConfig).values({ petpoojaSourceId, raw, sourceKind, updatedAt: now });
    }
  });
  details.push({ action: existing ? 'update' : 'create', description: 'Restaurant config', fields: [] });
}

export async function buildPetpoojaMenuMergePlan(payload: ParsedPetpoojaMenuPayload): Promise<PetpoojaMenuMergePlan> {
  const now = new Date().toISOString();
  const stats = {
    petpoojaMenuCategories: stat(), petpoojaMenuItems: stat(),
    petpoojaMenuAddonGroups: stat(), petpoojaMenuAddonItems: stat(), petpoojaMenuTaxes: stat(),
  };
  const details = {
    petpoojaMenuCategories: [] as RecordChange[], petpoojaMenuItems: [] as RecordChange[],
    petpoojaMenuAddonGroups: [] as RecordChange[], petpoojaMenuAddonItems: [] as RecordChange[], petpoojaMenuTaxes: [] as RecordChange[],
  };
  const ops: ((tx: Tx) => Promise<void>)[] = [];

  await mergeCategories(payload.petpoojaSourceId, payload.categories, now, stats.petpoojaMenuCategories, details.petpoojaMenuCategories, ops);
  await mergeItems(payload.petpoojaSourceId, payload.items, now, stats.petpoojaMenuItems, details.petpoojaMenuItems, ops);
  await mergeAddonGroups(payload.petpoojaSourceId, payload.addonGroups, now, stats.petpoojaMenuAddonGroups, details.petpoojaMenuAddonGroups, ops);
  await mergeAddonItems(payload.petpoojaSourceId, payload.addonItems, now, stats.petpoojaMenuAddonItems, details.petpoojaMenuAddonItems, ops);
  await mergeTaxes(payload.petpoojaSourceId, payload.taxes, now, stats.petpoojaMenuTaxes, details.petpoojaMenuTaxes, ops);
  // Config has no stats counter of its own (always exactly 0 or 1 row) -
  // its create/update is folded into the categories details list purely to
  // keep this function's signature small; the batch's own no-op check only
  // looks at whether any details array is non-empty, not which one.
  await mergeConfig(payload.petpoojaSourceId, payload.configRaw, payload.sourceKind, now, details.petpoojaMenuCategories, ops);

  return { stats, details, ops };
}
