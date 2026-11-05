// Resolve one PetPooja Order Callback payload against the single
// petpooja_outbound_orders row it targets.
//
// Single-row update-or-notFound, closer in shape to mergeStock.ts (a
// targeted id, not a snapshot) than mergeMenu.ts's sweep - a callback
// updates a specific order we already know about, it never originates
// one. An orderId with no matching row is tracked in stats.notFound, not
// an error - entirely expected while nothing in this app calls
// placePetpoojaOrder yet (see saveOrder.ts's header comment), and even
// once real, a stale/duplicate/race callback shouldn't hard-fail.
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client.ts';
import type { ParsedPetpoojaOrderCallbackPayload, RecordChange } from './types.ts';

export interface OrderCallbackMergeStats { creates: number; updates: number; unchanged: number; matched: number; notFound: number }
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export interface PetpoojaOrderCallbackMergePlan {
  stats: { petpoojaOrderCallback: OrderCallbackMergeStats };
  details: { petpoojaOrderCallback: RecordChange[] };
  ops: ((tx: Tx) => Promise<void>)[];
}

/** PetPooja's 5 documented Order Callback status codes. Anything else is
 *  left unmapped on purpose - see this module's header comment and
 *  parseOrderCallbackPayload.ts, which raises a warning Issue for an
 *  unrecognized code using this same mapping. */
export function mapCallbackStatus(code: string | null): 'accepted' | 'dispatched' | 'food_ready' | 'delivered' | 'cancelled' | null {
  switch (code) {
    case '-1': return 'cancelled';
    case '1': case '2': case '3': return 'accepted';
    case '4': return 'dispatched';
    case '5': return 'food_ready';
    case '10': return 'delivered';
    default: return null;
  }
}

export async function buildPetpoojaOrderCallbackMergePlan(payload: ParsedPetpoojaOrderCallbackPayload): Promise<PetpoojaOrderCallbackMergePlan> {
  const stats: OrderCallbackMergeStats = { creates: 0, updates: 0, unchanged: 0, matched: 0, notFound: 0 };
  const details: RecordChange[] = [];
  const ops: ((tx: Tx) => Promise<void>)[] = [];

  const [row] = await db.select().from(schema.petpoojaOutboundOrders)
    .where(eq(schema.petpoojaOutboundOrders.id, payload.orderId));
  if (!row) {
    stats.notFound++;
    return { stats: { petpoojaOrderCallback: stats }, details: { petpoojaOrderCallback: details }, ops };
  }
  stats.matched++;

  const now = new Date().toISOString();
  const mapped = mapCallbackStatus(payload.status);
  const nextStatus = mapped ?? row.status;
  const nextCancelReason = mapped === 'cancelled' ? payload.cancelReason : row.cancelReason;

  const changed = [
    ...(row.status !== nextStatus ? [{ field: 'status', from: row.status, to: nextStatus }] : []),
    ...(row.lastCallbackStatus !== payload.status ? [{ field: 'lastCallbackStatus', from: row.lastCallbackStatus, to: payload.status }] : []),
    ...(row.cancelReason !== nextCancelReason ? [{ field: 'cancelReason', from: row.cancelReason, to: nextCancelReason }] : []),
  ];
  // lastCallbackAt/lastCallbackPayload always get written alongside any
  // real change (same "write the timestamp, don't diff it" convention as
  // every other merge*.ts's lastSeenAt), so an identical re-push of the
  // same payload is still a true no-op by this diff, not by those two
  // fields.
  if (changed.length === 0) { stats.unchanged++; return { stats: { petpoojaOrderCallback: stats }, details: { petpoojaOrderCallback: details }, ops }; }

  const rowId = row.id;
  ops.push(async (tx) => {
    await tx.update(schema.petpoojaOutboundOrders).set({
      status: nextStatus,
      lastCallbackStatus: payload.status,
      lastCallbackAt: now,
      lastCallbackPayload: payload,
      cancelReason: nextCancelReason,
    }).where(eq(schema.petpoojaOutboundOrders.id, rowId));
  });
  stats.updates++;
  details.push({ action: 'update', description: `order ${rowId}`, fields: changed });

  return { stats: { petpoojaOrderCallback: stats }, details: { petpoojaOrderCallback: details }, ops };
}
