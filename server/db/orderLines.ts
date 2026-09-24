// Read-only query helper over `order_lines`, feeding the Orders & Dispatch
// ops page (src/components/dashboard/ops/OrdersDispatchSection.tsx). Data
// only ever arrives via the import pipeline (server/import/mergeOrders.ts) -
// there is no write surface here. Every row is a current-state snapshot,
// not a time series, so unlike productionLog.ts's daily* helpers this
// returns the full row set as-is; stage derivation and filtering happen on
// the frontend.
import { db, ready, schema } from './client.ts';

export interface OrderLineRow {
  id: string;
  client: string;
  itemName: string;
  size: string | null;
  colour: string | null;
  orderQty: number | null;
  greenQty: number | null;
  drawingQty: number | null;
  bisqueQty: number | null;
  glazeAppQty: number | null;
  glazeFiringQty: number | null;
  readyQty: number | null;
  dispatchDate: string | null;
  sampleStatus: string | null;
  remarks: string | null;
}

export async function allOrderLines(): Promise<OrderLineRow[]> {
  await ready();
  const rows = await db.select().from(schema.orderLines);
  return rows
    .map((r) => ({
      id: r.id,
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
    }))
    .sort((a, b) => a.client.localeCompare(b.client) || a.itemName.localeCompare(b.itemName));
}
