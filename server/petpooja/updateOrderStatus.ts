// Update Order Status: cancel an order we placed via Save Order. PetPooja's
// doc: "As of now, this endpoint can be used to send only cancel order (-1)
// status" - no other status transition is documented outbound, Order
// Callback (inbound) is how every other status change reaches us. Same
// plumbing-only posture as saveOrder.ts - nothing calls this yet.
import { eq } from 'drizzle-orm';
import { db, ready, schema } from '../db/client.ts';

type PetpoojaSource = typeof schema.petpoojaSources.$inferSelect;

const UPDATE_ORDER_STATUS_TIMEOUT_MS = 30_000;
const UPDATE_ORDER_STATUS_URL_DEFAULT = 'https://qle1yy2ydc.execute-api.ap-southeast-1.amazonaws.com/V1/update_order_status';
const updateOrderStatusUrl = () => process.env.PETPOOJA_UPDATE_ORDER_STATUS_URL || UPDATE_ORDER_STATUS_URL_DEFAULT;

export type CancelOrderResult =
  | { ok: true; clientOrderId: string }
  | { ok: false; clientOrderId: string; error: string };

/** Never throws, same contract as every outbound call in this integration.
 *  A clientOrderId with no local row is a typed error, not a silent no-op -
 *  there's nothing in petpoojaOutboundOrders to flip to cancelled. */
export async function cancelPetpoojaOrder(source: PetpoojaSource, clientOrderId: string, cancelReason: string): Promise<CancelOrderResult> {
  await ready();
  const [existing] = await db.select().from(schema.petpoojaOutboundOrders)
    .where(eq(schema.petpoojaOutboundOrders.id, clientOrderId));
  if (!existing) {
    return { ok: false, clientOrderId, error: `No order found with id "${clientOrderId}" - nothing to cancel` };
  }

  const body = {
    app_key: source.appKey, app_secret: source.appSecret, access_token: source.accessToken,
    restID: source.restId, orderID: '', clientorderID: clientOrderId,
    cancelReason, status: '-1',
  };

  let res: Response;
  try {
    res = await fetch(updateOrderStatusUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(UPDATE_ORDER_STATUS_TIMEOUT_MS),
    });
  } catch (err) {
    const error = `Could not reach PetPooja's Update Order Status endpoint: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`petpooja: cancel order failed for source ${source.id} (${source.label}):`, error);
    return { ok: false, clientOrderId, error };
  }
  if (!res.ok) {
    const error = `Update Order Status returned HTTP ${res.status}`;
    console.error(`petpooja: cancel order failed for source ${source.id} (${source.label}):`, error);
    return { ok: false, clientOrderId, error };
  }

  await db.update(schema.petpoojaOutboundOrders).set({
    status: 'cancelled', cancelReason,
  }).where(eq(schema.petpoojaOutboundOrders.id, clientOrderId));
  return { ok: true, clientOrderId };
}
