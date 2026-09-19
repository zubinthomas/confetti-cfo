// Purchase orders: division-scoped CRUD (plain, like inventory_items) plus
// a bespoke receive action, which needs the same atomic balance-update side
// effect as inventoryLedger.ts's recordTransaction - reused here via
// applyLedgerEffect so both paths stay in sync, run inside this function's
// own transaction rather than nesting db.transaction calls.
import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';
import { getUserDivisionScope } from './divisionScope.ts';
import { applyLedgerEffect } from './inventoryLedger.ts';

export class PurchaseOrderError extends Error {}

async function requireScope(userId: number, division: string | null) {
  const scope = await getUserDivisionScope(userId);
  if (scope.length > 0 && (!division || !scope.includes(division))) {
    throw new PurchaseOrderError('That purchase order is outside your assigned division.');
  }
  return scope;
}

export async function listPurchaseOrders(userId: number) {
  await ready();
  const scope = await getUserDivisionScope(userId);
  const orders = await db.select().from(schema.purchaseOrders)
    .where(scope.length > 0 ? inArray(schema.purchaseOrders.division, scope) : undefined)
    .orderBy(desc(schema.purchaseOrders.createdDate));
  const orderIds = orders.map((o) => o.id);
  const items = orderIds.length > 0
    ? await db.select().from(schema.purchaseOrderItems).where(inArray(schema.purchaseOrderItems.purchaseOrderId, orderIds))
    : [];
  const itemsByOrder = new Map<string, (typeof items)>();
  for (const it of items) {
    const list = itemsByOrder.get(it.purchaseOrderId) ?? [];
    list.push(it);
    itemsByOrder.set(it.purchaseOrderId, list);
  }
  return orders.map((o) => ({ ...o, items: itemsByOrder.get(o.id) ?? [] }));
}

export interface PurchaseOrderItemInput {
  itemId: string;
  quantityOrdered: number;
  unitCost?: number | null;
}

export interface PurchaseOrderInput {
  division: string;
  vendorName?: string | null;
  orderDate?: string | null;
  items: PurchaseOrderItemInput[];
}

export async function createPurchaseOrder(userId: number, input: PurchaseOrderInput) {
  await ready();
  if (!input.division) throw new PurchaseOrderError('division is required');
  await requireScope(userId, input.division);
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new PurchaseOrderError('At least one line item is required');
  }
  for (const it of input.items) {
    if (!it.itemId || !Number.isFinite(it.quantityOrdered) || it.quantityOrdered <= 0) {
      throw new PurchaseOrderError('Each line item needs an itemId and a positive quantityOrdered');
    }
  }

  return db.transaction(async (tx) => {
    const [order] = await tx.insert(schema.purchaseOrders).values({
      id: randomUUID(),
      createdDate: new Date().toISOString(),
      division: input.division,
      vendorName: input.vendorName || null,
      orderDate: input.orderDate || null,
      status: 'draft',
    }).returning();
    const items = await tx.insert(schema.purchaseOrderItems).values(
      input.items.map((it) => ({
        id: randomUUID(),
        purchaseOrderId: order.id,
        itemId: it.itemId,
        quantityOrdered: it.quantityOrdered,
        unitCost: it.unitCost ?? null,
        quantityReceived: 0,
      })),
    ).returning();
    return { ...order, items };
  });
}

export async function updatePurchaseOrder(userId: number, poId: string, input: { vendorName?: string | null; orderDate?: string | null; status?: string }) {
  await ready();
  const [order] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, poId));
  if (!order) throw new PurchaseOrderError(`No purchase order with id ${poId}`);
  await requireScope(userId, order.division);
  if (input.status !== undefined && !['draft', 'ordered', 'received'].includes(input.status)) {
    throw new PurchaseOrderError('status must be one of: draft, ordered, received');
  }
  const [updated] = await db.update(schema.purchaseOrders)
    .set({
      vendorName: input.vendorName !== undefined ? input.vendorName : order.vendorName,
      orderDate: input.orderDate !== undefined ? input.orderDate : order.orderDate,
      status: (input.status as typeof order.status) ?? order.status,
    })
    .where(eq(schema.purchaseOrders.id, poId))
    .returning();
  return updated;
}

export async function deletePurchaseOrder(userId: number, poId: string) {
  await ready();
  const [order] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, poId));
  if (!order) return false;
  await requireScope(userId, order.division);
  await db.delete(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, poId));
  return true;
}

/** Receiving a line item creates an inventory batch (if the item tracks
 *  expiry) or a plain "in" ledger transaction otherwise - either way through
 *  applyLedgerEffect, so the item's cached balance stays correct exactly
 *  like a manually recorded transaction would. Marks the whole PO
 *  "received" once every line item is fully received. */
export async function receivePurchaseOrderItem(
  userId: number,
  poId: string,
  poItemId: string,
  { quantity, expiryDate }: { quantity: number; expiryDate?: string | null },
) {
  await ready();
  const [order] = await db.select().from(schema.purchaseOrders).where(eq(schema.purchaseOrders.id, poId));
  if (!order) throw new PurchaseOrderError(`No purchase order with id ${poId}`);
  await requireScope(userId, order.division);
  const [poItem] = await db.select().from(schema.purchaseOrderItems)
    .where(and(eq(schema.purchaseOrderItems.id, poItemId), eq(schema.purchaseOrderItems.purchaseOrderId, poId)));
  if (!poItem) throw new PurchaseOrderError(`No line item with id ${poItemId} on this purchase order`);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new PurchaseOrderError('quantity must be a positive number');
  const remaining = poItem.quantityOrdered - poItem.quantityReceived;
  if (quantity > remaining) {
    throw new PurchaseOrderError(`Only ${remaining} still outstanding on this line item - can't receive ${quantity}`);
  }
  const [item] = await db.select().from(schema.inventoryItems).where(eq(schema.inventoryItems.id, poItem.itemId));
  if (!item) throw new PurchaseOrderError(`No inventory item with id ${poItem.itemId}`);

  return db.transaction(async (tx) => {
    await applyLedgerEffect(tx, userId, item, {
      type: 'in',
      quantity,
      note: `Received from PO ${poId}`,
      expiryDate,
      unitCost: poItem.unitCost,
    });
    const [updatedPoItem] = await tx.update(schema.purchaseOrderItems)
      .set({ quantityReceived: poItem.quantityReceived + quantity })
      .where(eq(schema.purchaseOrderItems.id, poItemId))
      .returning();

    const allItems = await tx.select().from(schema.purchaseOrderItems).where(eq(schema.purchaseOrderItems.purchaseOrderId, poId));
    const fullyReceived = allItems.every((it) => it.id === poItemId
      ? updatedPoItem.quantityReceived >= it.quantityOrdered
      : it.quantityReceived >= it.quantityOrdered);
    let updatedOrder = order;
    if (fullyReceived && order.status !== 'received') {
      [updatedOrder] = await tx.update(schema.purchaseOrders).set({ status: 'received' }).where(eq(schema.purchaseOrders.id, poId)).returning();
    } else if (!fullyReceived && order.status === 'draft') {
      [updatedOrder] = await tx.update(schema.purchaseOrders).set({ status: 'ordered' }).where(eq(schema.purchaseOrders.id, poId)).returning();
    }

    return { order: updatedOrder, item: updatedPoItem };
  });
}
