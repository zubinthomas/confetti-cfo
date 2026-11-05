// Rider Information - Webhook (step 8). Despite the name and the doc's
// "This has to be provided by third party" line, this is outbound - the
// dev URL and the app_key/app_secret/access_token triplet (only used by
// calls *we* make: Save Order, Update Order Status, Fetch Menu) settle it.
// See petpooja-integration-plan.md's step 8 section for the full
// field-reference reasoning.
//
// Mirrors updateOrderStatus.ts's cancelPetpoojaOrder exactly, not
// saveOrder.ts: both are single simple outbound POSTs keyed by an
// *existing* petpoojaOutboundOrders row (look it up first, typed error if
// missing, nothing to update) - no separate throw/catch error class needed,
// unlike Save Order's two-layer client that builds a brand-new row.
// Plumbing only, same posture as step 6 - nothing in this app assigns
// riders or tracks self-delivery (HP is dine-in), so nothing calls this yet.
import { eq } from 'drizzle-orm';
import { db, ready, schema } from '../db/client.ts';

type PetpoojaSource = typeof schema.petpoojaSources.$inferSelect;

const RIDER_INFO_TIMEOUT_MS = 30_000;
const RIDER_INFO_URL_DEFAULT = 'https://qle1yy2ydc.execute-api.ap-southeast-1.amazonaws.com/V1/rider_status_update';
const riderInfoUrl = () => process.env.PETPOOJA_RIDER_INFO_URL || RIDER_INFO_URL_DEFAULT;

export type RiderStatus = 'rider-assigned' | 'rider-arrived' | 'pickedup' | 'delivered';

export type RiderInfoResult =
  | { ok: true; clientOrderId: string }
  | { ok: false; clientOrderId: string; error: string };

/** Never throws, same contract as every outbound call in this integration.
 *  A clientOrderId with no local row is a typed error, not a silent no-op -
 *  there's nothing in petpoojaOutboundOrders to record this update against. */
export async function sendRiderStatusUpdate(
  source: PetpoojaSource, clientOrderId: string, status: RiderStatus, riderName: string, riderPhoneNumber: string,
): Promise<RiderInfoResult> {
  await ready();
  const [existing] = await db.select().from(schema.petpoojaOutboundOrders)
    .where(eq(schema.petpoojaOutboundOrders.id, clientOrderId));
  if (!existing) {
    return { ok: false, clientOrderId, error: `No order found with id "${clientOrderId}" - nothing to update` };
  }

  const body = {
    app_key: source.appKey, app_secret: source.appSecret, access_token: source.accessToken,
    status, order_id: clientOrderId, external_order_id: '',
    rider_data: { rider_name: riderName, rider_phone_number: riderPhoneNumber },
  };

  let res: Response;
  try {
    res = await fetch(riderInfoUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(RIDER_INFO_TIMEOUT_MS),
    });
  } catch (err) {
    const error = `Could not reach PetPooja's Rider Info endpoint: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`petpooja: rider info update failed for source ${source.id} (${source.label}):`, error);
    return { ok: false, clientOrderId, error };
  }
  if (!res.ok) {
    const error = `Rider Info returned HTTP ${res.status}`;
    console.error(`petpooja: rider info update failed for source ${source.id} (${source.label}):`, error);
    return { ok: false, clientOrderId, error };
  }

  await db.update(schema.petpoojaOutboundOrders).set({
    lastRiderStatus: status, lastRiderName: riderName, lastRiderPhoneNumber: riderPhoneNumber,
    lastRiderUpdatedAt: new Date().toISOString(),
  }).where(eq(schema.petpoojaOutboundOrders.id, clientOrderId));
  return { ok: true, clientOrderId };
}
