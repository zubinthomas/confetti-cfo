// Validate + flatten one raw PetPooja Sales API webhook body into a
// ParsedPetpoojaSalesRecord. The webhook sends one order per call (see
// server/routes/petpoojaWebhooks.ts), so unlike every parse*.ts under
// server/import/ (which parse a whole Excel sheet into many rows), this
// parses a single already-JSON-decoded object.
import type { Issue } from '../import/types.ts';
import type { ParsedPetpoojaSalesRecord } from '../import/types.ts';
import type { schema } from '../db/client.ts';

type PetpoojaSource = typeof schema.petpoojaSources.$inferSelect;

export type ParseSalesPayloadResult =
  | { ok: true; record: ParsedPetpoojaSalesRecord; issues: Issue[] }
  | { ok: false; error: string };

// Kolkata is UTC+5:30 year-round (no DST) - same fixed-offset convention as
// server/db/reservationsTime.ts's IST_OFFSET_MIN, kept as a small local
// equivalent here since that file is explicitly scoped to the reservations/
// guest-register/table-merge modules.
const IST_OFFSET_MIN = 5 * 60 + 30;

/** PetPooja's `created_on` is a naive local timestamp ("2025-04-04
 *  11:45:35", no timezone) - HP is in Kolkata, so this is IST wall-clock
 *  time. Converts to the UTC instant this app stores everywhere else. Null
 *  if the string doesn't match the documented format. */
function istNaiveToUtcIso(naive: unknown): string | null {
  if (typeof naive !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(naive);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const utcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)) - IST_OFFSET_MIN * 60_000;
  return new Date(utcMs).toISOString();
}

/** PetPooja sends most amounts as numbers but `round_off` as a string
 *  ("0.40", "0") - this handles either. */
function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function parseSalesPayload(body: unknown, source: PetpoojaSource): ParseSalesPayloadResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }
  const root = body as Record<string, unknown>;
  if (root.event !== 'orderdetails') {
    return { ok: false, error: `Unexpected event type "${String(root.event)}" - expected "orderdetails"` };
  }
  const properties = root.properties as Record<string, unknown> | undefined;
  const order = properties?.Order as Record<string, unknown> | undefined;
  const restaurant = properties?.Restaurant as Record<string, unknown> | undefined;
  const customer = properties?.Customer as Record<string, unknown> | undefined;

  const orderId = str(order?.orderID);
  if (!orderId) {
    return { ok: false, error: 'properties.Order.orderID is required' };
  }

  const issues: Issue[] = [];
  const restId = str(restaurant?.restID);
  if (restId && restId !== source.restId) {
    issues.push({
      level: 'warning', sheet: 'petpooja-sales',
      message: `Order ${orderId}'s restID ("${restId}") doesn't match this source's configured restId ("${source.restId}") - the webhook secret is the real authentication, so this was still ingested, but worth checking`,
    });
  }

  const record: ParsedPetpoojaSalesRecord = {
    petpoojaSourceId: source.id,
    orderId,
    customerInvoiceId: str(order?.customer_invoice_id),
    restId,
    orderType: str(order?.order_type),
    paymentType: str(order?.payment_type),
    orderFrom: str(order?.order_from),
    orderFromId: str(order?.order_from_id),
    subOrderType: str(order?.sub_order_type),
    status: str(order?.status),
    tableNo: str(order?.table_no),
    noOfPersons: num(order?.no_of_persons),
    billerName: str(order?.biller),
    assignee: str(order?.assignee),
    comment: str(order?.comment),
    tokenNo: str(order?.token_no),
    deliveryCharges: num(order?.delivery_charges),
    packagingCharge: num(order?.packaging_charge),
    serviceCharge: num(order?.service_charge),
    discountTotal: num(order?.discount_total),
    taxTotal: num(order?.tax_total),
    roundOff: num(order?.round_off),
    coreTotal: num(order?.core_total),
    total: num(order?.total),
    orderCreatedAt: istNaiveToUtcIso(order?.created_on),
    customerName: str(customer?.name),
    customerAddress: str(customer?.address),
    customerPhone: str(customer?.phone),
    customerGstin: str(customer?.gstin),
    items: arr(properties?.OrderItem),
    taxBreakup: arr(properties?.Tax),
    discountBreakup: arr(properties?.Discount),
    partPayments: order?.part_payments != null ? arr(order.part_payments) : null,
  };

  return { ok: true, record, issues };
}
