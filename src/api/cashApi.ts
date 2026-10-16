// Bank balance ledger + computed cash position (server/routes/cash.ts).
// Account CRUD goes through the generic entities API instead - see
// src/api/entities.ts's BankAccount export.
import { get, post } from "./http";

export interface BankBalanceEntry {
  id: string;
  createdDate: string;
  accountId: string;
  asOfDate: string;
  balance: number;
  note: string | null;
  recordedBy: string | null;
  recordedByEmail: string | null;
}

export interface CashPositionAccount {
  id: string;
  name: string;
  accountType: string;
  isRestricted: boolean;
  restrictionNote: string | null;
  balance: number;
  asOfDate: string | null;
}

export interface CashPosition {
  available: number;
  restricted: number;
  total: number;
  accounts: CashPositionAccount[];
}

export const listBalanceEntries = (accountId: string) =>
  get<BankBalanceEntry[]>(`/cash/accounts/${accountId}/entries`);

export const recordBalanceEntry = (accountId: string, data: { asOfDate: string; balance: number; note?: string }) =>
  post<BankBalanceEntry>(`/cash/accounts/${accountId}/entries`, data);

export const getCashPosition = () => get<CashPosition>("/cash/position");
