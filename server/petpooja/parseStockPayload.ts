// Validate + flatten one raw PetPooja Item Stock On/Off webhook body into a
// ParsedPetpoojaStockPayload. One call targets a specific list of itemIDs
// (Item or addon), not a snapshot - contrast parseMenuPayload.ts, whose
// payload is always the merchant's entire catalog. PetPooja's own docs
// confirm there is only one endpoint for both directions ("For Update Item
// Stock off API, we suggest you to keep the same endpoint as item stock
// on") - inStock picks the direction here.
import type { Issue } from '../import/types.ts';
import type { ParsedPetpoojaStockPayload } from '../import/types.ts';
import type { schema } from '../db/client.ts';

type PetpoojaSource = typeof schema.petpoojaSources.$inferSelect;

export type ParseStockPayloadResult =
  | { ok: true; payload: ParsedPetpoojaStockPayload; issues: Issue[] }
  | { ok: false; error: string };

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** PetPooja sends booleans as "1"/"0" strings elsewhere in this same API
 *  family (see parseMenuPayload.ts) - coerce defensively here too rather
 *  than trusting the doc's bare "boolean, required". */
function bool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v === '1' || v.toLowerCase() === 'true';
  return false;
}

export function parseStockPayload(body: unknown, source: PetpoojaSource): ParseStockPayloadResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }
  const root = body as Record<string, unknown>;

  const restId = str(root.restID);
  if (restId !== source.restId) {
    return { ok: false, error: `restID "${restId}" does not match this source's restId "${source.restId}"` };
  }

  const typeRaw = str(root.type)?.toLowerCase() ?? null;
  if (typeRaw !== 'item' && typeRaw !== 'addon') {
    return { ok: false, error: `type must be "Item" or "addon", got ${JSON.stringify(root.type)}` };
  }

  const rawIds = Array.isArray(root.itemID) ? root.itemID : [];
  const itemIds = rawIds.map((id) => str(id)).filter((id): id is string => id !== null);
  if (itemIds.length === 0) {
    return { ok: false, error: 'itemID must be a non-empty array of ids' };
  }

  const inStock = bool(root.inStock);
  const issues: Issue[] = [];
  const autoTurnOnTime = str(root.autoTurnOnTime);
  const customTurnOnTime = str(root.customTurnOnTime);
  if (!inStock && autoTurnOnTime === null) {
    issues.push({
      level: 'warning', sheet: 'petpooja-stock',
      message: 'Stock-off call arrived without autoTurnOnTime - recording the toggle anyway, but PetPooja\'s docs mark it required for this direction.',
    });
  }

  const payload: ParsedPetpoojaStockPayload = {
    petpoojaSourceId: source.id,
    type: typeRaw,
    inStock,
    itemIds,
    autoTurnOnTime,
    customTurnOnTime,
  };

  return { ok: true, payload, issues };
}
