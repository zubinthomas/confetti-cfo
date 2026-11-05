// Fetch Menu: the outbound counterpart to the Menu Push webhook - pulls the
// merchant's current catalog on demand instead of waiting for PetPooja to
// push it. Follows server/sheets/fetch.ts's established outbound-call
// convention: plain fetch() + AbortSignal.timeout, a typed error class with
// a `code` discriminant, no retry, an env-var test hook.
//
// Auth mechanics are inferred, not confirmed: PetPooja's own doc page for
// this endpoint only documents `{restID}` in the request body, but every
// other outbound call in this API family (Save Order, Update Order Status,
// Rider Info) consistently sends app_key/app_secret/access_token as
// top-level JSON fields alongside the resource id, so this does the same.
// Flagged here, in the plan, and in petpooja-integration-plan.md as needing
// a check against real PetPooja traffic once step 1 (vendor coordination)
// delivers credentials - same caveat already accepted for every other
// outbound PetPooja call in this integration.
import { ready, type schema } from '../db/client.ts';
import { parseMenuPayload } from './parseMenuPayload.ts';
import { syncPetpoojaMenu, recordMenuSyncOutcome, type PetpoojaMenuSyncResult } from './syncMenu.ts';

type PetpoojaSource = typeof schema.petpoojaSources.$inferSelect;

const FETCH_TIMEOUT_MS = 30_000;
// Dev endpoint from PetPooja's Apiary docs - production may differ once
// step 1 delivers real credentials and a confirmed base URL.
const FETCH_MENU_URL_DEFAULT = 'https://qle1yy2ydc.execute-api.ap-southeast-1.amazonaws.com/V1/mapped_restaurant_menus';
// Test hook: reroutes the call to a local fixture server, same pattern as
// sheets/fetch.ts's SHEETS_EXPORT_BASE_URL.
const fetchMenuUrl = () => process.env.PETPOOJA_FETCH_MENU_URL || FETCH_MENU_URL_DEFAULT;

export class PetpoojaFetchMenuError extends Error {
  code: 'network' | 'http_error' | 'bad_response';
  constructor(code: PetpoojaFetchMenuError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

/** Raises the raw JSON body (same shape as a Menu Push webhook call) - never
 *  parses or validates it, that's parseMenuPayload's job. */
export async function fetchPetpoojaMenuPayload(source: PetpoojaSource): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(fetchMenuUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_key: source.appKey, app_secret: source.appSecret, access_token: source.accessToken,
        restID: source.restId,
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    throw new PetpoojaFetchMenuError('network', `Could not reach PetPooja's Fetch Menu endpoint: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!res.ok) {
    throw new PetpoojaFetchMenuError('http_error', `Fetch Menu returned HTTP ${res.status}`);
  }
  try {
    return await res.json();
  } catch (err) {
    throw new PetpoojaFetchMenuError('bad_response', `Fetch Menu response was not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Never throws, same contract as every sync in this codebase - a fetch
 *  failure is recorded on the source row exactly like a sync failure would
 *  be, since from the caller's (the "Resync now" button's) point of view
 *  they're the same kind of outcome. */
export async function resyncPetpoojaMenu(source: PetpoojaSource): Promise<PetpoojaMenuSyncResult> {
  await ready();
  try {
    const raw = await fetchPetpoojaMenuPayload(source);
    const parsed = parseMenuPayload(raw, source, 'fetch');
    if (parsed.ok === false) {
      return {
        status: 'error', batch: null, error: parsed.error,
        source: await recordMenuSyncOutcome(source.id, 'error', parsed.error, null),
      };
    }
    return await syncPetpoojaMenu(source, parsed.payload, parsed.issues);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`petpooja: menu resync failed for source ${source.id} (${source.label}):`, msg);
    return {
      status: 'error', batch: null, error: msg,
      source: await recordMenuSyncOutcome(source.id, 'error', msg, null),
    };
  }
}
