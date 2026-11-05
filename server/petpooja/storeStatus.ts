// Get/Update Store Status (step 7) - unlike every other PetPooja webhook in
// this integration, neither endpoint goes through the ParsedWorkbook/
// buildMergePlan pipeline: Get Store Status creates nothing (a pure read),
// and Update Store Status doesn't diff a separate entity row against this
// payload - the payload *is* petpoojaSources' own config, the same
// relationship routes/petpooja.ts's PATCH /sources/:id already has to this
// table (just machine-authed here instead of human-authed). See
// petpooja-integration-plan.md's step 7 section for the full reasoning.
//
// The vendor doc merges request and response fields under one heading for
// both endpoints with no clean separation (same issue already flagged for
// Update Item/addon In_Stock's code/status/message) - the split below
// (restID/store_status/turn_on_time/reason = request, status/store_status/
// http_code/message = response) is read from each endpoint's prose, not
// from a clean schema.
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client.ts';

type PetpoojaSource = typeof schema.petpoojaSources.$inferSelect;

export type StoreStatusValidationResult = { ok: true } | { ok: false; error: string };

/** Shared restID check, same shape as every parse*Payload.ts's first
 *  validation. source.restId is authoritative (the row petpoojaWebhookAuth
 *  already resolved via the webhook secret) - this just confirms PetPooja
 *  sent the body for the outlet it thinks it's calling. */
export function validateStoreStatusRestId(body: unknown, source: PetpoojaSource): StoreStatusValidationResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }
  const restId = (body as Record<string, unknown>).restID;
  if (typeof restId !== 'string' || restId !== source.restId) {
    return { ok: false, error: `restID "${String(restId)}" does not match this source's restId "${source.restId}"` };
  }
  return { ok: true };
}

export interface GetStoreStatusResponse {
  status: 'success';
  store_status: '1' | '0';
  http_code: '200';
  message: string;
}

/** storeOpen === false is the only "closed" reading - null (never told us)
 *  and true both answer "open". Nothing in this app actually consumes this
 *  flag (no online-ordering surface), so defaulting the response to open
 *  is the safe/uneventful choice; the stored column stays honestly null
 *  until PetPooja actually calls Update Store Status (see schema.ts). */
export function buildGetStoreStatusResponse(source: PetpoojaSource): GetStoreStatusResponse {
  return {
    status: 'success',
    store_status: source.storeOpen === false ? '0' : '1',
    http_code: '200',
    message: 'OK',
  };
}

export type ApplyUpdateStoreStatusResult = { ok: true } | { ok: false; error: string };

/** store_status is the only hard-required field beyond restID; reason is
 *  required only when closing (the doc's one unambiguous "required when"
 *  rule) - turn_on_time is accepted and stored if present but not
 *  hard-required, since the doc marks it required outright (not
 *  conditionally, unlike reason), which reads more like copy-paste
 *  boilerplate than a real constraint. On reopen, storeClosedReason/
 *  storeReopenAt are cleared - they only mean something while closed. */
export async function applyUpdateStoreStatus(source: PetpoojaSource, body: unknown): Promise<ApplyUpdateStoreStatusResult> {
  const root = body as Record<string, unknown>;
  const storeStatus = root.store_status;
  if (storeStatus !== '1' && storeStatus !== '0') {
    return { ok: false, error: 'store_status must be "1" or "0"' };
  }
  const isOpen = storeStatus === '1';
  const reason = typeof root.reason === 'string' && root.reason.trim() ? root.reason.trim() : null;
  if (!isOpen && !reason) {
    return { ok: false, error: 'reason is required when store_status is "0"' };
  }
  const turnOnTime = typeof root.turn_on_time === 'string' && root.turn_on_time.trim() ? root.turn_on_time.trim() : null;

  await db.update(schema.petpoojaSources).set({
    storeOpen: isOpen,
    storeClosedReason: isOpen ? null : reason,
    storeReopenAt: isOpen ? null : turnOnTime,
    storeStatusUpdatedAt: new Date().toISOString(),
  }).where(eq(schema.petpoojaSources.id, source.id));

  return { ok: true };
}
