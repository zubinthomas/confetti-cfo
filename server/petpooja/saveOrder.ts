// Save Order: push an order to PetPooja's POS. Step 6 is plumbing only -
// nothing in this codebase calls placePetpoojaOrder yet (confirmed during
// planning: no feature anywhere originates a customer order - the guest
// self check-in page is table/waitlist management only). This exists for
// a future ordering feature to import and call; see
// petpooja-integration-plan.md's step 6 section for the full reasoning.
//
// Follows fetchMenu.ts's exact outbound convention: plain fetch() +
// AbortSignal.timeout, a typed error class with a `code` discriminant, no
// retry, an env-var test hook. OrderInfo's full field list wasn't
// exhaustively captured from PetPooja's Apiary docs (the summarized page
// text shows "OrderInfo/Order: orderID, preorder_date, ..." - a truncated
// attribute list, not the expanded schema) - this sends the fields
// confirmed from that summary plus what every order-placement API needs;
// expand against the real schema before this is ever wired to a live
// caller, same "infer now, confirm against real traffic later" posture
// every other outbound PetPooja call in this integration already carries.
import { randomUUID } from 'node:crypto';
import { db, ready, schema } from '../db/client.ts';

type PetpoojaSource = typeof schema.petpoojaSources.$inferSelect;

const SAVE_ORDER_TIMEOUT_MS = 30_000;
const SAVE_ORDER_URL_DEFAULT = 'https://47pfzh5sf2.execute-api.ap-southeast-1.amazonaws.com/V1/save_order';
const saveOrderUrl = () => process.env.PETPOOJA_SAVE_ORDER_URL || SAVE_ORDER_URL_DEFAULT;

export class PetpoojaSaveOrderError extends Error {
  code: 'config' | 'network' | 'http_error' | 'bad_response';
  constructor(code: PetpoojaSaveOrderError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

export interface PetpoojaOutboundOrderItem {
  itemId: string; // PetPooja item id from the step 4 catalog (petpoojaMenuItems.itemId)
  name: string;
  quantity: number;
  price: number;
  taxIds?: string[];
}

export interface PetpoojaOutboundOrderInput {
  customer: { name: string; email?: string; phone?: string; address?: string };
  items: PetpoojaOutboundOrderItem[];
  taxes?: { id: string; title: string; type: string; price: number }[];
  discounts?: { id: string; title: string; type: string; price: number }[];
  deviceType?: string; // default 'Web' per the doc's required-with-default field
}

export type SaveOrderResult =
  | { ok: true; clientOrderId: string }
  | { ok: false; clientOrderId: string; error: string };

function buildCallbackUrl(): string {
  const serverUrl = process.env.SERVER_URL;
  if (!serverUrl) {
    throw new PetpoojaSaveOrderError('config', 'SERVER_URL is not set - cannot build Save Order\'s required callback_url');
  }
  return `${serverUrl.replace(/\/$/, '')}/api/petpooja/webhooks/order-callback`;
}

/** Raises the raw JSON response - throws PetpoojaSaveOrderError on any
 *  failure, never parses/validates PetPooja's side of the response beyond
 *  "is this valid JSON". */
async function callSaveOrder(source: PetpoojaSource, body: Record<string, unknown>): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(saveOrderUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SAVE_ORDER_TIMEOUT_MS),
    });
  } catch (err) {
    throw new PetpoojaSaveOrderError('network', `Could not reach PetPooja's Save Order endpoint: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    throw new PetpoojaSaveOrderError('http_error', `Save Order returned HTTP ${res.status}`);
  }
  try {
    return await res.json();
  } catch (err) {
    throw new PetpoojaSaveOrderError('bad_response', `Save Order response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Never throws, same contract as every sync in this codebase - always
 *  inserts a petpoojaOutboundOrders row, success or failure, since an
 *  attempted-and-failed placement is still worth an audit trail. */
export async function placePetpoojaOrder(source: PetpoojaSource, input: PetpoojaOutboundOrderInput): Promise<SaveOrderResult> {
  await ready();
  const clientOrderId = randomUUID();
  const createdAt = new Date().toISOString();

  let callbackUrl: string;
  try {
    callbackUrl = buildCallbackUrl();
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await db.insert(schema.petpoojaOutboundOrders).values({
      id: clientOrderId, petpoojaSourceId: source.id, status: 'error', orderPayload: { input, error }, createdAt,
    });
    return { ok: false, clientOrderId, error };
  }

  const orderInfo = {
    Customer: {
      name: input.customer.name, email: input.customer.email ?? '',
      phone: input.customer.phone ?? '', address: input.customer.address ?? '',
    },
    Order: { orderID: clientOrderId, preorder_date: createdAt },
    OrderItem: input.items.map((it) => ({
      id: it.itemId, name: it.name, quantity: String(it.quantity), price: String(it.price),
      tax_inclusive: '0', item_tax: it.taxIds ?? [],
    })),
    Tax: (input.taxes ?? []).map((t) => ({ id: t.id, title: t.title, type: t.type, price: String(t.price) })),
    Discount: (input.discounts ?? []).map((d) => ({ id: d.id, title: d.title, type: d.type, price: String(d.price) })),
  };
  const body = {
    app_key: source.appKey, app_secret: source.appSecret, access_token: source.accessToken,
    restID: source.restId, callback_url: callbackUrl,
    OrderInfo: orderInfo, udid: clientOrderId, device_type: input.deviceType ?? 'Web',
  };

  try {
    const response = await callSaveOrder(source, body);
    await db.insert(schema.petpoojaOutboundOrders).values({
      id: clientOrderId, petpoojaSourceId: source.id, status: 'placed', orderPayload: { request: body, response }, createdAt,
    });
    return { ok: true, clientOrderId };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`petpooja: save order failed for source ${source.id} (${source.label}):`, error);
    await db.insert(schema.petpoojaOutboundOrders).values({
      id: clientOrderId, petpoojaSourceId: source.id, status: 'error', orderPayload: { request: body, error }, createdAt,
    });
    return { ok: false, clientOrderId, error };
  }
}
