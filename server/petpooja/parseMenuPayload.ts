// Validate + flatten one raw PetPooja Menu Push webhook body (or Fetch Menu
// response - identical shape, see fetchMenu.ts) into a
// ParsedPetpoojaMenuPayload. Every call carries the merchant's *entire*
// current catalog (categories/items/addon groups/addon items/taxes), not an
// incremental diff - see mergeMenu.ts's resolve-sweep, the reason this
// parser hard-errors on an empty items/categories array rather than
// treating it as a legitimate "nothing to show" state the way
// parseSalesPayload's sibling concerns never need to.
import type { Issue } from '../import/types.ts';
import type {
  ParsedPetpoojaMenuAddonGroup, ParsedPetpoojaMenuAddonItem, ParsedPetpoojaMenuCategory,
  ParsedPetpoojaMenuItem, ParsedPetpoojaMenuPayload, ParsedPetpoojaMenuTax,
} from '../import/types.ts';
import type { schema } from '../db/client.ts';

type PetpoojaSource = typeof schema.petpoojaSources.$inferSelect;

export type ParseMenuPayloadResult =
  | { ok: true; payload: ParsedPetpoojaMenuPayload; issues: Issue[] }
  | { ok: false; error: string };

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** PetPooja sends booleans as "1"/"0" strings (occasionally real booleans). */
function bool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v === '1' || v.toLowerCase() === 'true';
  return false;
}

function parseCategory(c: Record<string, unknown>): ParsedPetpoojaMenuCategory {
  return {
    categoryId: String(c.categoryid),
    parentCategoryId: str(c.parent_category_id),
    name: str(c.categoryname) ?? '',
    rank: num(c.categoryrank),
    timings: str(c.categorytimings),
    imageUrl: str(c.category_image_url),
    active: bool(c.active),
  };
}

function parseItem(it: Record<string, unknown>): ParsedPetpoojaMenuItem {
  const info = it.item_info as Record<string, unknown> | undefined;
  return {
    itemId: String(it.itemid),
    categoryId: str(it.item_categoryid),
    name: str(it.itemname) ?? '',
    description: str(it.itemdescription),
    price: num(it.price),
    markupPrice: num(it.markup_price),
    rank: num(it.itemrank),
    attributeId: str(it.item_attributeid),
    allowVariation: bool(it.itemallowvariation),
    allowAddon: bool(it.itemallowaddon),
    addonBasedOnVariation: bool(it.itemaddonbasedon),
    orderTypeRaw: str(it.item_ordertype),
    gstType: str(it.gst_type),
    taxInclusive: bool(it.tax_inclusive),
    ignoreTaxes: bool(it.ignore_taxes),
    ignoreDiscounts: bool(it.ignore_discounts),
    packingCharges: num(it.item_packingcharges),
    isRecommended: bool(it.is_recommend),
    isFavorite: bool(it.item_favorite),
    isCombo: bool(it.is_combo),
    imageUrl: str(it.item_image_url),
    minimumPreparationTime: str(it.minimumpreparationtime),
    spiceLevel: str(info?.spice_level),
    itemTax: it.item_tax ?? null,
    variations: it.variation ?? null,
    addon: it.addon ?? null,
    comboDetails: it.combo_details ?? null,
    nutrition: it.nutrition ?? null,
    cuisine: it.cuisine ?? null,
    tags: it.item_tags ?? null,
    active: bool(it.active),
  };
}

function parseAddonGroup(g: Record<string, unknown>): ParsedPetpoojaMenuAddonGroup {
  return {
    addonGroupId: String(g.addongroupid),
    name: str(g.addongroup_name) ?? '',
    rank: num(g.addongroup_rank),
    active: bool(g.active),
  };
}

function parseAddonItem(a: Record<string, unknown>): ParsedPetpoojaMenuAddonItem {
  return {
    addonItemId: String(a.addonitemid),
    name: str(a.addonitem_name) ?? '',
    price: num(a.addonitem_price),
    attributeId: str(a.attributes),
    rank: num(a.addonitem_rank),
    active: bool(a.active),
  };
}

function parseTax(t: Record<string, unknown>): ParsedPetpoojaMenuTax {
  return {
    taxId: String(t.taxid),
    name: str(t.taxname) ?? '',
    rate: num(t.tax),
    taxType: str(t.taxtype),
    orderTypeRaw: str(t.tax_ordertype),
    coreOrTotal: str(t.tax_coreortotal),
    forwardOrBackward: str(t.tax_taxtype),
    description: str(t.description),
    rank: num(t.rank),
    active: bool(t.active),
  };
}

export function parseMenuPayload(
  body: unknown, source: PetpoojaSource, sourceKind: 'push' | 'fetch',
): ParseMenuPayloadResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }
  const root = body as Record<string, unknown>;
  if (root.success === false || root.success === 'false' || root.success === 0) {
    return { ok: false, error: typeof root.message === 'string' ? root.message : 'PetPooja reported success: false' };
  }
  const restaurants = arr(root.restaurants) as Record<string, unknown>[];
  if (restaurants.length === 0) {
    return { ok: false, error: 'restaurants[] is empty - expected at least one restaurant entry' };
  }

  const issues: Issue[] = [];
  let restaurant = restaurants.find((r) => str(r.menusharingcode) === source.restId);
  if (!restaurant) {
    restaurant = restaurants[0];
    if (restaurants.length > 1) {
      issues.push({
        level: 'warning', sheet: 'petpooja-menu',
        message: `No restaurant entry in this push matched source restId "${source.restId}" among ${restaurants.length} entries - using the first one. Worth checking the restId mapping.`,
      });
    }
  }

  const categories = arr(restaurant.categories) as Record<string, unknown>[];
  const items = arr(restaurant.items) as Record<string, unknown>[];
  const addongroups = arr(restaurant.addongroups) as Record<string, unknown>[];
  const addongroupitems = arr(restaurant.addongroupitems) as Record<string, unknown>[];
  const taxes = arr(restaurant.taxes) as Record<string, unknown>[];

  if (items.length === 0 || categories.length === 0) {
    return { ok: false, error: 'A real menu push always has at least one category and item - treating an empty items/categories array as a vendor-side error rather than a catalog wipe' };
  }

  const { categories: _c, items: _i, addongroups: _ag, addongroupitems: _agi, taxes: _t, variations: _v, ...configRaw } = restaurant;

  const payload: ParsedPetpoojaMenuPayload = {
    petpoojaSourceId: source.id,
    categories: categories.map(parseCategory),
    items: items.map(parseItem),
    addonGroups: addongroups.map(parseAddonGroup),
    addonItems: addongroupitems.map(parseAddonItem),
    taxes: taxes.map(parseTax),
    configRaw,
    sourceKind,
  };

  return { ok: true, payload, issues };
}
