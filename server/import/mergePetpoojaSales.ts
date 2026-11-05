// Resolve parsed PetPooja Sales API order rows against the
// `petpooja_sales_orders` table. Modeled on mergeOrders.ts: its own small
// self-contained matcher, not threaded into merge.ts's business/unit/period
// graph - an order doesn't belong to any business unit any more than a bank
// account does.
//
// Natural key: (petpoojaSourceId, normalized orderId) - stored as its own
// `matchKey` column (server/db/schema.ts's
// petpooja_sales_orders_source_match_key unique index).
//
// Create/update only, no deletion or resolve-sweep: a cancelled order is a
// normal re-push of the same orderID with status flipped to 'Cancelled', not
// a notice that a row went missing - the "latest full sync -> resolve
// what's gone" policy mergeBills.ts uses doesn't apply here, since one
// webhook call is one order, never a full snapshot.
//
// lastSeenAt is deliberately excluded from the diffed payload - comparing it
// would make every re-push "change" something (the timestamp itself), which
// would defeat the batch-level no-op/dedup detection
// (computeContentHash/noChanges in server/petpooja/syncSales.ts, same
// mechanism every other sync here relies on). It's written only alongside a
// real create/update, same convention as every other field: a byte-identical
// re-push produces no op at all and commits nothing, exactly like every
// other sync in this codebase (no special-cased "touch" bypassing that).
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client.ts';
import type { ParsedPetpoojaSalesRecord, RecordChange } from './types.ts';

export interface TableStats { creates: number; updates: number; unchanged: number }
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export interface PetpoojaSalesMergePlan {
  stats: { petpoojaSalesOrders: TableStats };
  details: { petpoojaSalesOrders: RecordChange[] };
  ops: ((tx: Tx) => Promise<void>)[];
}

const norm = (s: string) => s.trim().toLowerCase();

export function petpoojaSalesMatchKey(orderId: string): string {
  return norm(orderId);
}

// items/taxBreakup/discountBreakup/partPayments are JSONB - the row read back
// from the db and the freshly parsed payload are never the same object, so
// Object.is on them is always false even when the content is identical. That
// would permanently break this file's own no-op guarantee (see header
// comment), so these four fields are deep-compared instead. A JSON.stringify
// comparison isn't enough either: Postgres's jsonb column type reorders
// object keys internally, so the row read back from the db has different key
// order than the freshly parsed in-memory object even when nothing changed.
const JSON_FIELDS = new Set(['items', 'taxBreakup', 'discountBreakup', 'partPayments']);

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
  if (JSON_FIELDS.has(field)) return !deepEqual(from ?? null, to ?? null);
  return !Object.is(from, to);
}

function sheetFields(r: ParsedPetpoojaSalesRecord, key: string) {
  return {
    orderId: r.orderId,
    customerInvoiceId: r.customerInvoiceId,
    restId: r.restId,
    orderType: r.orderType,
    paymentType: r.paymentType,
    orderFrom: r.orderFrom,
    orderFromId: r.orderFromId,
    subOrderType: r.subOrderType,
    status: r.status,
    tableNo: r.tableNo,
    noOfPersons: r.noOfPersons,
    billerName: r.billerName,
    assignee: r.assignee,
    comment: r.comment,
    tokenNo: r.tokenNo,
    deliveryCharges: r.deliveryCharges,
    packagingCharge: r.packagingCharge,
    serviceCharge: r.serviceCharge,
    discountTotal: r.discountTotal,
    taxTotal: r.taxTotal,
    roundOff: r.roundOff,
    coreTotal: r.coreTotal,
    total: r.total,
    orderCreatedAt: r.orderCreatedAt,
    customerName: r.customerName,
    customerAddress: r.customerAddress,
    customerPhone: r.customerPhone,
    customerGstin: r.customerGstin,
    items: r.items,
    taxBreakup: r.taxBreakup,
    discountBreakup: r.discountBreakup,
    partPayments: r.partPayments,
    matchKey: key,
  };
}

/** `records` must all belong to the same `petpoojaSourceId` - callers group
 *  by source before calling this (today, always exactly one record per call:
 *  one webhook = one order). Empty input is a no-op. */
export async function buildPetpoojaSalesMergePlan(records: ParsedPetpoojaSalesRecord[]): Promise<PetpoojaSalesMergePlan> {
  const stats: TableStats = { creates: 0, updates: 0, unchanged: 0 };
  const details: RecordChange[] = [];
  const ops: ((tx: Tx) => Promise<void>)[] = [];

  if (records.length === 0) {
    return { stats: { petpoojaSalesOrders: stats }, details: { petpoojaSalesOrders: details }, ops };
  }

  const now = new Date().toISOString();
  const petpoojaSourceId = records[0].petpoojaSourceId;
  const existing = await db.select().from(schema.petpoojaSalesOrders)
    .where(eq(schema.petpoojaSalesOrders.petpoojaSourceId, petpoojaSourceId));
  const byKey = new Map(existing.map((e) => [e.matchKey, e]));

  for (const r of records) {
    const key = petpoojaSalesMatchKey(r.orderId);
    const match = byKey.get(key);
    const payload = sheetFields(r, key);

    if (!match) {
      const id = randomUUID();
      ops.push(async (tx) => {
        await tx.insert(schema.petpoojaSalesOrders).values({
          id, createdDate: now, petpoojaSourceId, lastSeenAt: now, ...payload,
        });
      });
      stats.creates++;
      details.push({
        action: 'create',
        description: `Order ${r.orderId}${r.tableNo ? ` (table ${r.tableNo})` : ''}`,
        fields: Object.entries(payload).filter(([, v]) => v != null).map(([field, to]) => ({ field, from: null as unknown, to })),
      });
      continue;
    }

    const changed: { field: string; from: unknown; to: unknown }[] = [];
    const set: Record<string, unknown> = {};
    for (const [field, to] of Object.entries(payload)) {
      const from = (match as Record<string, unknown>)[field];
      if (fieldChanged(field, from, to)) {
        changed.push({ field, from, to });
        set[field] = to;
      }
    }
    if (changed.length === 0) {
      stats.unchanged++;
      continue;
    }
    set.lastSeenAt = now;
    const matchId = match.id;
    ops.push(async (tx) => {
      await tx.update(schema.petpoojaSalesOrders).set(set).where(eq(schema.petpoojaSalesOrders.id, matchId));
    });
    stats.updates++;
    details.push({ action: 'update', description: `Order ${r.orderId}`, fields: changed });
  }

  return { stats: { petpoojaSalesOrders: stats }, details: { petpoojaSalesOrders: details }, ops };
}
