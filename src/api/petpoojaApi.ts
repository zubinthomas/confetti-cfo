// PetPooja source management + sales-order reads against the Express server
// (server/routes/petpooja.ts). The Sales API webhook itself is PetPooja's own
// machine call (server/routes/petpoojaWebhooks.ts) - nothing here triggers
// ingestion, this is the admin surface for sources plus a read-only list of
// what's already landed.
import { get, post, patch, del } from "./http";
import type { ImportIssue } from "./importApi";

export type PetpoojaEnvironment = "sandbox" | "production";
export type PetpoojaSyncMode = "auto" | "manual" | "paused";
export type PetpoojaSyncStatus = "preview_created" | "auto_committed" | "no_changes" | "auto_discarded" | "error";

const SECRET_MASK = "••••••••";
export { SECRET_MASK as PETPOOJA_SECRET_MASK };

export interface PetpoojaSource {
  id: number;
  label: string;
  environment: PetpoojaEnvironment;
  restId: string;
  /** Masked (SECRET_MASK) once set, null if never set - never the real value. */
  appKey: string | null;
  appSecret: string | null;
  accessToken: string | null;
  syncMode: PetpoojaSyncMode;
  createdAt: string;
  lastSeenAt: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: PetpoojaSyncStatus | null;
  lastSyncError: string | null;
  lastSyncIssues: ImportIssue[] | null;
  /** Step 7, compatibility only - null means PetPooja has never called
   *  Update Store Status for this source (reads as open), not that it's closed. */
  storeOpen: boolean | null;
  storeClosedReason: string | null;
  storeReopenAt: string | null;
  storeStatusUpdatedAt: string | null;
}

/** Only returned once, right when a source is created or its webhook secret
 *  is rotated - the server never stores or returns the raw secret again. */
export interface PetpoojaSourceWithWebhookSecret { source: PetpoojaSource; webhookSecret: string }

export const listPetpoojaSources = () => get<PetpoojaSource[]>("/petpooja/sources");

export const createPetpoojaSource = (body: {
  label: string; environment: PetpoojaEnvironment; restId: string;
  appKey: string; appSecret: string; accessToken: string;
}) => post<PetpoojaSourceWithWebhookSecret>("/petpooja/sources", body);

export const updatePetpoojaSource = (
  id: number,
  body: {
    label?: string; restId?: string; appKey?: string; appSecret?: string;
    accessToken?: string; syncMode?: PetpoojaSyncMode;
  },
) => patch<PetpoojaSource>(`/petpooja/sources/${id}`, body);

export const rotatePetpoojaWebhookSecret = (id: number) =>
  post<PetpoojaSourceWithWebhookSecret>(`/petpooja/sources/${id}/rotate-webhook-secret`);

export const deletePetpoojaSource = (id: number) => del(`/petpooja/sources/${id}`);

export interface PetpoojaOrderItem {
  name: string; itemid: string; itemcode: string; price: string; quantity: string; total: string;
  [key: string]: unknown;
}

export interface PetpoojaSalesOrder {
  id: string;
  createdDate: string;
  petpoojaSourceId: number;
  orderId: string;
  customerInvoiceId: string | null;
  restId: string | null;
  orderType: string | null;
  paymentType: string | null;
  orderFrom: string | null;
  orderFromId: string | null;
  subOrderType: string | null;
  status: string | null;
  tableNo: string | null;
  noOfPersons: number | null;
  billerName: string | null;
  assignee: string | null;
  comment: string | null;
  tokenNo: string | null;
  deliveryCharges: number | null;
  packagingCharge: number | null;
  serviceCharge: number | null;
  discountTotal: number | null;
  taxTotal: number | null;
  roundOff: number | null;
  coreTotal: number | null;
  total: number | null;
  orderCreatedAt: string | null;
  customerName: string | null;
  customerAddress: string | null;
  customerPhone: string | null;
  customerGstin: string | null;
  items: PetpoojaOrderItem[] | null;
  taxBreakup: unknown;
  discountBreakup: unknown;
  partPayments: unknown;
  matchKey: string;
  lastSeenAt: string;
}

export const listPetpoojaSalesOrders = (filters?: { petpoojaSourceId?: number; status?: string }) => {
  const params = new URLSearchParams();
  if (filters?.petpoojaSourceId != null) params.set("petpoojaSourceId", String(filters.petpoojaSourceId));
  if (filters?.status) params.set("status", filters.status);
  const qs = params.toString();
  return get<PetpoojaSalesOrder[]>(`/petpooja/sales-orders${qs ? `?${qs}` : ""}`);
};

// ── Menu catalog (step 4) ────────────────────────────────────────────────────
// PetPooja's attribute master list (1=Veg,2=NonVeg,5=Other,24=Egg) is small
// enough to hardcode here rather than sync its own table - see
// petpooja-integration-plan.md's step 4 section.
export const PETPOOJA_ATTRIBUTE_LABELS: Record<string, string> = {
  "1": "Veg", "2": "Non-veg", "5": "Other", "24": "Egg",
};

export interface PetpoojaMenuCategory {
  id: string; createdDate: string; petpoojaSourceId: number | null;
  categoryId: string; parentCategoryId: string | null; name: string;
  rank: number | null; timings: string | null; imageUrl: string | null;
  active: boolean; matchKey: string; lastSeenAt: string;
}

export interface PetpoojaMenuItem {
  id: string; createdDate: string; petpoojaSourceId: number | null;
  itemId: string; categoryId: string | null; name: string; description: string | null;
  price: number | null; markupPrice: number | null; rank: number | null; attributeId: string | null;
  allowVariation: boolean; allowAddon: boolean; addonBasedOnVariation: boolean;
  orderTypeRaw: string | null; gstType: string | null; taxInclusive: boolean;
  ignoreTaxes: boolean; ignoreDiscounts: boolean; packingCharges: number | null;
  isRecommended: boolean; isFavorite: boolean; isCombo: boolean; imageUrl: string | null;
  minimumPreparationTime: string | null; spiceLevel: string | null;
  itemTax: unknown; variations: unknown; addon: unknown; comboDetails: unknown;
  nutrition: unknown; cuisine: unknown; tags: unknown;
  active: boolean;
  inStock: boolean; autoTurnOnTime: string | null; customTurnOnTime: string | null;
  matchKey: string; lastSeenAt: string;
}

export interface PetpoojaMenuAddonGroup {
  id: string; createdDate: string; petpoojaSourceId: number | null;
  addonGroupId: string; name: string; rank: number | null;
  active: boolean; matchKey: string; lastSeenAt: string;
}

export interface PetpoojaMenuAddonItem {
  id: string; createdDate: string; petpoojaSourceId: number | null;
  addonItemId: string; name: string; price: number | null; attributeId: string | null; rank: number | null;
  active: boolean;
  inStock: boolean; autoTurnOnTime: string | null; customTurnOnTime: string | null;
  matchKey: string; lastSeenAt: string;
}

export interface PetpoojaMenuTax {
  id: string; createdDate: string; petpoojaSourceId: number | null;
  taxId: string; name: string; rate: number | null; taxType: string | null;
  orderTypeRaw: string | null; coreOrTotal: string | null; forwardOrBackward: string | null;
  description: string | null; rank: number | null;
  active: boolean; matchKey: string; lastSeenAt: string;
}

export interface PetpoojaMenuConfig {
  petpoojaSourceId: number; raw: unknown; sourceKind: "push" | "fetch"; updatedAt: string;
}

export interface PetpoojaMenu {
  categories: PetpoojaMenuCategory[];
  items: PetpoojaMenuItem[];
  addonGroups: PetpoojaMenuAddonGroup[];
  addonItems: PetpoojaMenuAddonItem[];
  taxes: PetpoojaMenuTax[];
  config: PetpoojaMenuConfig | null;
}

export const getPetpoojaMenu = (petpoojaSourceId: number) =>
  get<PetpoojaMenu>(`/petpooja/menu?petpoojaSourceId=${petpoojaSourceId}`);

export interface PetpoojaMenuSyncResult {
  status: "preview_created" | "auto_committed" | "no_changes" | "auto_discarded" | "error";
  error?: string;
  batch: unknown;
}

export const resyncPetpoojaMenu = (sourceId: number) =>
  post<PetpoojaMenuSyncResult>(`/petpooja/sources/${sourceId}/resync-menu`);

export type PetpoojaOutboundOrderStatus = "placed" | "accepted" | "dispatched" | "food_ready" | "delivered" | "cancelled" | "error";

/** Step 6, plumbing only - this list is empty until a future feature calls
 *  placePetpoojaOrder server-side; nothing in this app writes to it yet. */
export interface PetpoojaOutboundOrder {
  id: string;
  petpoojaSourceId: number | null;
  status: PetpoojaOutboundOrderStatus;
  orderPayload: unknown;
  lastCallbackStatus: string | null;
  lastCallbackAt: string | null;
  lastCallbackPayload: unknown;
  cancelReason: string | null;
  createdAt: string;
}

export const getPetpoojaOrders = (filters?: { petpoojaSourceId?: number }) => {
  const params = new URLSearchParams();
  if (filters?.petpoojaSourceId != null) params.set("petpoojaSourceId", String(filters.petpoojaSourceId));
  const qs = params.toString();
  return get<PetpoojaOutboundOrder[]>(`/petpooja/orders${qs ? `?${qs}` : ""}`);
};
