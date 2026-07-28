// Inventory ledger: append-only transaction log for a department-scoped
// item, plus the atomic balance update recording one requires - the reason
// this isn't a generic entity like inventory_items itself (server/db.ts).
// Reuses getUserDivisionScope directly for the identical scoping guarantee
// the generic entity CRUD gets automatically for the item catalog.
import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';
import { getUserDivisionScope } from './divisionScope.ts';

export class InventoryError extends Error {}

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

/** No update/delete counterpart, by design - this table is append-only.
 *  Correcting a mistake means recording an offsetting transaction, not
 *  rewriting history - see the schema.ts comment on inventoryTransactions. */
export async function recordTransaction(
  userId: number,
  itemId: string,
  { type, quantity, note }: { type: 'in' | 'out'; quantity: number; note?: string },
) {
  await ready();
  const item = await requireScopedItem(userId, itemId);
  if (type !== 'in' && type !== 'out') throw new InventoryError('type must be "in" or "out"');
  if (!Number.isFinite(quantity) || quantity <= 0) throw new InventoryError('Quantity must be a positive number');

  const delta = type === 'in' ? quantity : -quantity;
  const nextQuantity = item.quantityOnHand + delta;
  if (nextQuantity < 0) {
    throw new InventoryError(`Only ${item.quantityOnHand} ${item.unit || 'unit(s)'} on hand - can't remove ${quantity}`);
  }

  return db.transaction(async (tx) => {
    const [row] = await tx.insert(schema.inventoryTransactions).values({
      id: randomUUID(),
      createdDate: new Date().toISOString(),
      itemId,
      type,
      quantity,
      note: note || null,
      recordedByUserId: userId,
    }).returning();
    await tx.update(schema.inventoryItems)
      .set({ quantityOnHand: nextQuantity })
      .where(eq(schema.inventoryItems.id, itemId));
    return row;
  });
}
