// Inventory ledger: append-only transaction log for a department-scoped
// item, plus the atomic balance update recording one requires - the reason
// this isn't a generic entity like inventory_items itself (server/db.ts).
// Reuses getUserDivisionScope directly for the identical scoping guarantee
// the generic entity CRUD gets automatically for the item catalog.
import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';
import { getUserDivisionScope } from './divisionScope.ts';

export class InventoryError extends Error {}

// Driver-agnostic transaction type, inferred from db.transaction itself -
// lets applyLedgerEffect (below) be called from inside another module's own
// transaction (see server/db/purchaseOrders.ts's receive flow) without a
// hardcoded dependency on which drizzle driver this project happens to use.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function requireScopedItem(userId: number, itemId: string) {
  const [item] = await db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.id, itemId));
  if (!item) throw new InventoryError(`No inventory item with id ${itemId}`);
  const scope = await getUserDivisionScope(userId);
  if (scope.length > 0 && (!item.division || !scope.includes(item.division))) {
    throw new InventoryError('That item is outside your assigned division.');
  }
  return item;
}

export async function listTransactions(userId: number, itemId: string) {
  await ready();
  await requireScopedItem(userId, itemId);
  return db
    .select({
      id: schema.inventoryTransactions.id,
      createdDate: schema.inventoryTransactions.createdDate,
      type: schema.inventoryTransactions.type,
      quantity: schema.inventoryTransactions.quantity,
      note: schema.inventoryTransactions.note,
      recordedBy: schema.users.fullName,
      recordedByEmail: schema.users.email,
    })
    .from(schema.inventoryTransactions)
    .leftJoin(schema.users, eq(schema.users.id, schema.inventoryTransactions.recordedByUserId))
    .where(eq(schema.inventoryTransactions.itemId, itemId))
    .orderBy(desc(schema.inventoryTransactions.createdDate));
}

export async function listBatches(userId: number, itemId: string) {
  await ready();
  await requireScopedItem(userId, itemId);
  // Earliest expiry first (FIFO suggestion for the "out" batch picker) -
  // batches with no expiry date sort last, since there's nothing urging
  // them to be used first.
  return db
    .select()
    .from(schema.inventoryBatches)
    .where(eq(schema.inventoryBatches.itemId, itemId))
    .orderBy(sql`${schema.inventoryBatches.expiryDate} IS NULL, ${schema.inventoryBatches.expiryDate} ASC`);
}

type LedgerEffectInput = {
  type: 'in' | 'out'; quantity: number; note?: string | null;
  expiryDate?: string | null; batchId?: string | null; unitCost?: number | null;
};

/** The tx-scoped core of recording a transaction - split out so
 *  server/db/purchaseOrders.ts's receive flow can run it inside its own
 *  transaction (alongside updating the PO's received quantity) instead of
 *  nesting a second db.transaction. item must already be scope-checked by
 *  the caller (see requireScopedItem) - this function trusts it as-is. */
export async function applyLedgerEffect(tx: Tx, userId: number, item: typeof schema.inventoryItems.$inferSelect, input: LedgerEffectInput) {
  const { type, quantity, note, expiryDate, batchId, unitCost } = input;
  if (type !== 'in' && type !== 'out') throw new InventoryError('type must be "in" or "out"');
  if (!Number.isFinite(quantity) || quantity <= 0) throw new InventoryError('Quantity must be a positive number');

  const delta = type === 'in' ? quantity : -quantity;
  const nextQuantity = item.quantityOnHand + delta;
  if (nextQuantity < 0) {
    throw new InventoryError(`Only ${item.quantityOnHand} ${item.unit || 'unit(s)'} on hand - can't remove ${quantity}`);
  }

  if (item.tracksExpiry && type === 'out' && !batchId) {
    throw new InventoryError('This item tracks expiry - specify which batch to remove stock from');
  }

  let resolvedBatchId: string | null = null;
  if (item.tracksExpiry && type === 'in') {
    const [batch] = await tx.insert(schema.inventoryBatches).values({
      id: randomUUID(),
      createdDate: new Date().toISOString(),
      itemId: item.id,
      receivedDate: new Date().toISOString().slice(0, 10),
      expiryDate: expiryDate || null,
      quantityReceived: quantity,
      quantityRemaining: quantity,
      unitCost: unitCost ?? item.unitCost ?? null,
    }).returning();
    resolvedBatchId = batch.id;
  } else if (item.tracksExpiry && type === 'out' && batchId) {
    const [batch] = await tx.select().from(schema.inventoryBatches)
      .where(and(eq(schema.inventoryBatches.id, batchId), eq(schema.inventoryBatches.itemId, item.id)));
    if (!batch) throw new InventoryError('No matching batch for this item');
    if (batch.quantityRemaining < quantity) {
      throw new InventoryError(`Only ${batch.quantityRemaining} ${item.unit || 'unit(s)'} remaining in that batch - can't remove ${quantity}`);
    }
    await tx.update(schema.inventoryBatches)
      .set({ quantityRemaining: batch.quantityRemaining - quantity })
      .where(eq(schema.inventoryBatches.id, batch.id));
    resolvedBatchId = batch.id;
  }

  const [row] = await tx.insert(schema.inventoryTransactions).values({
    id: randomUUID(),
    createdDate: new Date().toISOString(),
    itemId: item.id,
    type,
    quantity,
    note: note || null,
    recordedByUserId: userId,
    batchId: resolvedBatchId,
  }).returning();
  await tx.update(schema.inventoryItems)
    .set({ quantityOnHand: nextQuantity })
    .where(eq(schema.inventoryItems.id, item.id));
  return row;
}

/** No update/delete counterpart, by design - this table is append-only.
 *  Correcting a mistake means recording an offsetting transaction, not
 *  rewriting history - see the schema.ts comment on inventoryTransactions.
 *
 *  For an expiry-tracked item (item.tracksExpiry), an "in" transaction
 *  creates a new batch (expiryDate optional - not every receipt needs one
 *  recorded); an "out" transaction must name which batch to debit via
 *  batchId (the frontend suggests the earliest-expiring one via
 *  listBatches, but doesn't enforce it - see InventoryTab.tsx). Items that
 *  don't track expiry ignore both and behave exactly as before. */
export async function recordTransaction(userId: number, itemId: string, input: LedgerEffectInput) {
  await ready();
  const item = await requireScopedItem(userId, itemId);
  return db.transaction((tx) => applyLedgerEffect(tx, userId, item, input));
}
