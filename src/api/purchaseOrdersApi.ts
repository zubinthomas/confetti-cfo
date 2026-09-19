// Purchase orders (server/routes/purchaseOrders.ts) - an inventory
// sub-feature gated by the Inventory permission, not a generic entity
// (receiving a line item needs an atomic multi-table side effect the
// generic entities API can't express). CamelCase end to end, same
// convention as inventoryApi.ts's ledger endpoints.
import { get, post, patch, del } from "./http";

export type PurchaseOrderStatus = "draft" | "ordered" | "received";

export interface PurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  itemId: string;
  quantityOrdered: number;
  unitCost: number | null;
  quantityReceived: number;
}

export interface PurchaseOrder {
  id: string;
  createdDate: string;
  division: string | null;
  vendorName: string | null;
  orderDate: string | null;
  status: PurchaseOrderStatus;
  items: PurchaseOrderItem[];
}

export const listPurchaseOrders = () => get<PurchaseOrder[]>("/purchase-orders");

export const createPurchaseOrder = (data: {
  division: string; vendorName?: string; orderDate?: string;
  items: { itemId: string; quantityOrdered: number; unitCost?: number | null }[];
}) => post<PurchaseOrder>("/purchase-orders", data);

export const updatePurchaseOrder = (id: string, data: { vendorName?: string; orderDate?: string; status?: PurchaseOrderStatus }) =>
  patch<PurchaseOrder>(`/purchase-orders/${id}`, data);

export const deletePurchaseOrder = (id: string) => del<{ message: string }>(`/purchase-orders/${id}`);

export const receivePurchaseOrderItem = (poId: string, poItemId: string, data: { quantity: number; expiryDate?: string | null }) =>
  post<{ order: PurchaseOrder; item: PurchaseOrderItem }>(`/purchase-orders/${poId}/items/${poItemId}/receive`, data);
