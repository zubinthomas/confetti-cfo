// Company Balance Sheet (Tally business unit "Balance Sheet"). The data
// model has no asset/liability/equity distinction - all 28 line items are
// tagged category: 'other' (see server/db/seed-tally-balance-sheet.ts and
// seed-tally-pl-and-missing-bs.ts) - so classification happens here, by
// name, against a hand-reviewed map. Anything not in the map is surfaced as
// "unclassified" rather than guessed, per the project's existing convention
// of flagging ambiguous Tally mappings instead of guessing wrong.
import { frGet, type FrIndex } from "./seriesKernel";
import type { BusinessUnit, FinancialRecord, LineItem, Period } from "./types";
import type { ExportSheet } from "@/lib/dataExport";

export const CEPL_ID = 1;
const BS_UNIT_NAME = "Balance Sheet";

export function resolveBsBu(businessUnits: BusinessUnit[]): number {
  return businessUnits.find((u) => u.businessId === CEPL_ID && u.name === BS_UNIT_NAME)?.id ?? -1;
}

export type BsBucket = "asset" | "liability_equity";

export const BS_CLASSIFICATION: Record<string, BsBucket> = {
  "Adv. to Outsider": "asset",
  "Advance to Staff": "asset",
  "Advance to Supplier": "asset",
  "Cash-in-hand": "asset",
  "Fixed Assets": "asset",
  "Fixed Deposit": "asset",
  "Stock-in-hand": "asset",
  "Sundry Debtors": "asset",
  "TDS Refundable on Commission": "asset",

  "Advance From Client": "liability_equity",
  "Advance From Director for Purchase": "liability_equity",
  "Advance From Other": "liability_equity",
  "Bank OD A/c": "liability_equity",
  "Duties & Taxes": "liability_equity",
  "Loan From Directors": "liability_equity",
  "Other Current Liabilities": "liability_equity",
  Provisions: "liability_equity",
  "Reserves & Surplus": "liability_equity",
  "Secured Loans": "liability_equity",
  "Sundry Creditors": "liability_equity",
  "TDS Payable": "liability_equity",
  "Share Capital": "liability_equity",
  "Salary Payable": "liability_equity",
};

// Real Tally-synced Balance-Sheet ledgers (see seed-tally-pl-and-missing-bs.ts's
// BS_LEDGER_ITEMS / seed-tally-balance-sheet.ts's BALANCE_GROUP_NAMES) that
// aren't in BS_CLASSIFICATION above yet. Listed explicitly, not left to
// "whatever's still unclassified", so they keep surfacing in the Unclassified
// card for review even if they have zero financial_records rows under the
// Balance Sheet business unit - a Tally ledger with an unparseable
// CLOSINGBALANCE never gets pushed at all (see agent/src/tally_client.rs's
// parse_ledger_balances), so a real gap here can legitimately mean no data,
// not a wrong classification.
const BS_UNCLASSIFIED_KNOWN_NAMES = [
  "Loan & Advance-Other",
  "Security Deposit",
  "Suspense A/c",
  "Accrued Interest",
  "TDS",
];

// Every Balance-Sheet-natured line item name, classified or not. lineItems
// has no businessUnitId column - only businessId - so a CEPL P&L line item
// like "F&B Product Sales" shares the same businessId as these ~28 real
// Balance Sheet ledgers. Scoping resolveBsLi to this set (rather than just
// businessId) keeps unrelated P&L line items out of the Unclassified card.
const BS_LINE_ITEM_NAMES = new Set<string>([
  ...Object.keys(BS_CLASSIFICATION),
  ...BS_UNCLASSIFIED_KNOWN_NAMES,
]);

export interface BsLineItem {
  id: number;
  name: string;
}

export interface BsLi {
  assets: BsLineItem[];
  liabilityEquity: BsLineItem[];
  unclassified: BsLineItem[];
}

export function resolveBsLi(lineItems: LineItem[]): BsLi {
  const assets: BsLineItem[] = [];
  const liabilityEquity: BsLineItem[] = [];
  const unclassified: BsLineItem[] = [];
  for (const l of lineItems.filter((li) => li.businessId === CEPL_ID && BS_LINE_ITEM_NAMES.has(li.name))) {
    const entry = { id: l.id, name: l.name };
    const bucket = BS_CLASSIFICATION[l.name];
    if (bucket === "asset") assets.push(entry);
    else if (bucket === "liability_equity") liabilityEquity.push(entry);
    else unclassified.push(entry);
  }
  return { assets, liabilityEquity, unclassified };
}

/** Every "as of" snapshot period this business unit has records for, oldest first. */
export function allAsOfPeriods(periods: Period[], buId: number, records: FinancialRecord[]): Period[] {
  const periodById = new Map(periods.map((p) => [p.id, p]));
  const candidateIds = new Set(
    records.filter((r) => r.businessUnitId === buId).map((r) => r.periodId)
  );
  const result: Period[] = [];
  for (const pid of candidateIds) {
    const p = periodById.get(pid);
    if (p && p.periodType === "custom") result.push(p);
  }
  return result.sort((a, b) => a.endDate.localeCompare(b.endDate) || a.id - b.id);
}

/** The most recent "as of" snapshot period that this business unit has any record for. */
export function latestAsOfPeriod(periods: Period[], buId: number, records: FinancialRecord[]): Period | null {
  return allAsOfPeriods(periods, buId, records).at(-1) ?? null;
}

export interface BsLineTrendPoint {
  periodId: number;
  endDate: string;
  value: number | null;
}

export interface BsRow {
  name: string;
  value: number | null;
  trend: BsLineTrendPoint[];
}

export interface BalanceSheet {
  totalAssets: number;
  totalLiabilityEquity: number;
  imbalance: number;
  lines: {
    assets: BsRow[];
    liabilityEquity: BsRow[];
    unclassified: BsRow[];
  };
}

function rowsFor(idx: FrIndex, buId: number, periodId: number, items: BsLineItem[], sign: 1 | -1, asOfPeriods: Period[]): BsRow[] {
  return items.map((item) => {
    const raw = frGet(idx, buId, periodId, item.id);
    const trend = asOfPeriods.map((p) => {
      const v = frGet(idx, buId, p.id, item.id);
      return { periodId: p.id, endDate: p.endDate, value: v == null ? null : v * sign };
    });
    return { name: item.name, value: raw == null ? null : raw * sign, trend };
  });
}

const sumRows = (rows: BsRow[]): number => rows.reduce((a, r) => a + (r.value ?? 0), 0);

// Confirmed against live Tally-pushed data: debit-normal ledgers (the asset
// bucket here) come through with a negative raw value, credit-normal ones
// (liabilities/equity) come through positive - summing every line item
// unmodified nets close to zero, which is the accounting identity under
// this sign convention. Assets are flipped to a positive magnitude here so
// "Total Assets" reads as a normal positive figure; liabilities/equity and
// the unclassified bucket are left exactly as pushed, since a handful of
// liability-classified ledgers (e.g. an overpaid "Salary Payable") can
// legitimately carry the opposite sign in real data, and the unclassified
// bucket's true nature isn't known well enough to flip with confidence.
export function computeBalanceSheet(idx: FrIndex, buId: number, li: BsLi, periodId: number, asOfPeriods: Period[] = []): BalanceSheet {
  const assets = rowsFor(idx, buId, periodId, li.assets, -1, asOfPeriods);
  const liabilityEquity = rowsFor(idx, buId, periodId, li.liabilityEquity, 1, asOfPeriods);
  const unclassified = rowsFor(idx, buId, periodId, li.unclassified, 1, asOfPeriods);
  const totalAssets = sumRows(assets);
  const totalLiabilityEquity = sumRows(liabilityEquity);
  return {
    totalAssets,
    totalLiabilityEquity,
    imbalance: totalAssets - totalLiabilityEquity,
    lines: { assets, liabilityEquity, unclassified },
  };
}

const SECTION_LABELS = { assets: "Assets", liabilityEquity: "Liabilities & Equity", unclassified: "Unclassified" } as const;

export function balanceSheetExportSheets(bs: BalanceSheet): ExportSheet[] {
  const sections = Object.keys(SECTION_LABELS) as (keyof typeof SECTION_LABELS)[];

  const snapshot: ExportSheet = {
    name: "Balance Sheet",
    columns: ["Section", "Line", "Value"],
    rows: sections.flatMap((s) => bs.lines[s].map((r) => [SECTION_LABELS[s], r.name, r.value])),
  };

  const trend: ExportSheet = {
    name: "Trend",
    columns: ["Section", "Line", "As Of", "Value"],
    rows: sections.flatMap((s) =>
      bs.lines[s].flatMap((r) => r.trend.map((pt) => [SECTION_LABELS[s], r.name, pt.endDate, pt.value])),
    ),
  };

  return [snapshot, trend];
}
