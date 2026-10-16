// Outstanding receivables/payables, synced from Tally's bill-wise reports
// (server/routes/bills.ts). Read-only.
import { get } from "./http";

export interface OutstandingBill {
  id: string;
  createdDate: string;
  tallySourceId: number;
  ledgerName: string;
  billRef: string;
  billDate: string | null;
  nature: "receivable" | "payable";
  outstandingAmount: number;
  dueDate: string | null;
  voucherDate: string | null;
  voucherType: string | null;
  voucherNumber: string | null;
  voucherAmount: number | null;
  status: "outstanding" | "resolved";
  lastSeenAt: string;
  resolvedAt: string | null;
  matchKey: string;
}

export const getOutstandingBills = () => get<OutstandingBill[]>("/bills");
