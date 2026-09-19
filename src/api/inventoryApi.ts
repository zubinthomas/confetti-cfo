// Inventory transaction ledger (server/routes/inventory.ts). Item catalog
// CRUD goes through the generic entities API instead - see
// src/api/entities.ts's Inventory export.
import { get, post } from "./http";

export type TransactionType = "in" | "out";

export interface InventoryTransaction {
  id: string;
  createdDate: string;
  type: TransactionType;
  quantity: number;
  note: string | null;
  recordedBy: string | null;
  recordedByEmail: string | null;
}

export interface InventoryBatch {
  id: string;
  createdDate: string;
  itemId: string;
  receivedDate: string;
  expiryDate: string | null;
  quantityReceived: number;
  quantityRemaining: number;
  unitCost: number | null;
}

export const listTransactions = (itemId: string) =>
  get<InventoryTransaction[]>(`/inventory/items/${itemId}/transactions`);

export const listBatches = (itemId: string) =>
  get<InventoryBatch[]>(`/inventory/items/${itemId}/batches`);

// expiryDate/unitCost only matter for an "in" against an expiry-tracked
// item (creates a batch); batchId only matters for an "out" against one
// (debits that batch) - see server/db/inventoryLedger.ts.
export const recordTransaction = (itemId: string, data: {
  type: TransactionType; quantity: number; note?: string;
  expiryDate?: string | null; batchId?: string | null; unitCost?: number | null;
}) =>
  post<InventoryTransaction>(`/inventory/items/${itemId}/transactions`, data);
