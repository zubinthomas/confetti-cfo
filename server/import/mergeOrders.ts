// Resolve parsed order-status rows against the `order_lines` table.
// Modeled on mergeProductionLog.ts/mergeShiftRoster.ts: its own small
// self-contained matcher, not threaded into merge.ts's financial-entity
// graph.
//
// Natural key: client + normalized(itemName, size, colour) - row position
// isn't stable across re-uploads (confirmed with the user: rows can be
// added/removed/reordered as orders complete), so matching can't use
// (sourceSheet, sourceRow) the way production_log does. The key is stored
// as its own `matchKey` column (see server/db/schema.ts) rather than a
// composite index over the raw columns, since matching needs to be
// case/whitespace-insensitive - two rows typed "Galaxy plate" and "galaxy
// plate " must still collide.
//
// Create/update only, no deletion: a row that vanishes from a future
// upload keeps its last-known state rather than being removed - matches
// the precedent set by mergeProductionLog.ts/mergeShiftRoster.ts, and lets
// the Orders & Dispatch page simply filter out dispatched rows by default
// instead of needing true archival.
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client.ts';
import { orderMatchKey } from './parseOrders.ts';
import type { ParsedOrderRecord, RecordChange } from './types.ts';

export interface TableStats { creates: number; updates: number; unchanged: number }
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export interface OrdersMergePlan {
  stats: { orderLines: TableStats };
  details: { orderLines: RecordChange[] };
  ops: ((tx: Tx) => Promise<void>)[];
}

function sheetFields(r: ParsedOrderRecord, key: string) {
  return {
    client: r.client,
    itemName: r.itemName,
    size: r.size,
    colour: r.colour,
    orderQty: r.orderQty,
    greenQty: r.greenQty,
    drawingQty: r.drawingQty,
    bisqueQty: r.bisqueQty,
    glazeAppQty: r.glazeAppQty,
    glazeFiringQty: r.glazeFiringQty,
    readyQty: r.readyQty,
    dispatchDate: r.dispatchDate,
    sampleStatus: r.sampleStatus,
    remarks: r.remarks,
    sourceSheet: r.sourceSheet,
    sourceRow: r.sourceRow,
    matchKey: key,
  };
}

export async function buildOrdersMergePlan(records: ParsedOrderRecord[]): Promise<OrdersMergePlan> {
  const stats: TableStats = { creates: 0, updates: 0, unchanged: 0 };
  const details: RecordChange[] = [];
  const ops: ((tx: Tx) => Promise<void>)[] = [];

  const existing = await db.select().from(schema.orderLines);
  const byKey = new Map(existing.map((e) => [e.matchKey, e]));

  for (const r of records) {
    const key = orderMatchKey(r);
    const match = byKey.get(key);
    const payload = sheetFields(r, key);

    if (!match) {
      const id = randomUUID();
      ops.push(async (tx) => {
        await tx.insert(schema.orderLines).values({
          id, createdDate: new Date().toISOString(), ...payload,
        });
      });
      stats.creates++;
      details.push({
        action: 'create',
        description: `${r.client} - ${r.itemName}${r.size ? ` (${r.size})` : ''}`,
        fields: Object.entries(payload).filter(([, v]) => v != null).map(([field, to]) => ({ field, from: null as unknown, to })),
      });
      continue;
    }

    const changed: { field: string; from: unknown; to: unknown }[] = [];
    const set: Record<string, unknown> = {};
    for (const [field, to] of Object.entries(payload)) {
      const from = (match as Record<string, unknown>)[field];
      if (!Object.is(from, to)) {
        changed.push({ field, from, to });
        set[field] = to;
      }
    }
    if (changed.length === 0) {
      stats.unchanged++;
      continue;
    }
    const matchId = match.id;
    ops.push(async (tx) => {
      await tx.update(schema.orderLines).set(set).where(eq(schema.orderLines.id, matchId));
    });
    stats.updates++;
    details.push({ action: 'update', description: `${r.client} - ${r.itemName}`, fields: changed });
  }

  return { stats: { orderLines: stats }, details: { orderLines: details }, ops };
}
