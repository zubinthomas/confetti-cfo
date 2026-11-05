// Validate + flatten one raw PetPooja Order Callback webhook body into a
// ParsedPetpoojaOrderCallbackPayload. Status mapping itself happens in
// mergeOrderCallback.ts, not here - this file only validates shape and
// extracts fields verbatim, same division of labor as every other
// parse*Payload.ts in this integration.
import type { Issue } from '../import/types.ts';
import type { ParsedPetpoojaOrderCallbackPayload } from '../import/types.ts';
import type { schema } from '../db/client.ts';
import { mapCallbackStatus } from '../import/mergeOrderCallback.ts';

type PetpoojaSource = typeof schema.petpoojaSources.$inferSelect;

export type ParseOrderCallbackPayloadResult =
  | { ok: true; payload: ParsedPetpoojaOrderCallbackPayload; issues: Issue[] }
  | { ok: false; error: string };

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function bool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v === '1' || v.toLowerCase() === 'true';
  return false;
}

export function parseOrderCallbackPayload(body: unknown, source: PetpoojaSource): ParseOrderCallbackPayloadResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }
  const root = body as Record<string, unknown>;

  const restId = str(root.restID);
  if (restId !== source.restId) {
    return { ok: false, error: `restID "${restId}" does not match this source's restId "${source.restId}"` };
  }

  // orderID here is OUR own clientOrderId, not PetPooja's - see this file's
  // and petpoojaOutboundOrders' header comments for the vendor doc's own
  // (inconsistent-with-the-rest-of-the-API) field-naming for this value.
  const orderId = str(root.orderID);
  if (orderId === null) {
    return { ok: false, error: 'orderID is required - nothing to correlate this callback against' };
  }

  const status = str(root.status);
  const issues: Issue[] = [];
  if (status !== null && mapCallbackStatus(status) === null) {
    issues.push({
      level: 'warning', sheet: 'petpooja-order-callback',
      message: `Unrecognized order status code "${status}" - not one of PetPooja's 5 documented values, recorded as-is without updating local order status.`,
    });
  }

  const payload: ParsedPetpoojaOrderCallbackPayload = {
    petpoojaSourceId: source.id,
    orderId,
    status,
    cancelReason: str(root.cancel_reason),
    minimumPrepTime: str(root.minimum_prep_time),
    minimumDeliveryTime: str(root.minimum_delivery_time),
    riderName: str(root.rider_name),
    riderPhoneNumber: str(root.rider_phone_number),
    isModified: bool(root.is_modified),
  };

  return { ok: true, payload, issues };
}
