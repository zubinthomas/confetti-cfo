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

export const listTransactions = (itemId: string) =>
  get<InventoryTransaction[]>(`/inventory/items/${itemId}/transactions`);

export const recordTransaction = (itemId: string, data: { type: TransactionType; quantity: number; note?: string }) =>
  post<InventoryTransaction>(`/inventory/items/${itemId}/transactions`, data);
