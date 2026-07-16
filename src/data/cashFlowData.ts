// ─────────────────────────────────────────────────────────────────────────────
// Cash-flow adapter (CEPL workbook). Derives group-wide monthly money-in /
// money-out from all six departments' P&L records:
//   inflows  = every department's reported total sales
//   outflows = every department's reported total expenses
// and splits outflows into the workbook's own cost lines (payroll, materials,
// GST, licences, delivery commissions, site costs, …).
//
// This only produces a real number for a fiscal year when ALL SIX
// departments have monthly detail for it - unlike F&B/Store, the four craft
// departments have no annual-only fallback at all (checked directly against
// the dataset: only F&B and Store have Overview-sheet historical rows), so a
// partial (F&B+Store-only) total would silently misrepresent itself as
// "group cash flow." Years without full six-department detail get no
// computed numbers at all, not a partial one - see hasFullDetail below.
//
// HONEST LIMIT: the source workbooks are P&L statements. They contain no bank
// balance, receivables, payables, loan schedule or opening cash, so true
// cash-position / working-capital metrics are NOT derivable - see
// CASH_GAPS, which the Cash Flow page surfaces instead of invented numbers.
// ─────────────────────────────────────────────────────────────────────────────

import { MONTHS, monthPeriodIds, lineItems, frGet, sum, fyLabel } from "./core";
import { FAB_BY_FY, STORE_BY_FY, OVERVIEW_FYS, deptFinancials, type DeptKey } from "./ceplData";

const CEPL_UNITS = [1, 2, 3, 4, 5, 6];
const CRAFT_KEYS: DeptKey[] = ["tradingItems", "pottery", "batik", "stitching"];

// sum one-or-more line items (by exact name) across all CEPL departments
const liIdsByName = (...names: string[]): number[] =>
  lineItems
    .filter((l) => l.businessId === 1 && l.valueType === "amount" && names.includes(l.name))
    .map((l) => l.id);

function monthlyAcrossUnits(liIds: number[], pids: number[]): number[] {
  return pids.map((pid) =>
    sum(CEPL_UNITS.flatMap((u) => liIds.map((lid) => frGet(u, pid, lid))))
  );
}

// 'HR Cost' is each sheet's salary + staff-welfare total, so the Salary /
// Staff Welfare sub-rows are deliberately not added on top of it. GST is NOT
// a category here: the 'GST Paid'/'GST Expenses' rows sit outside the sheets'
// own Total Expenses (verified: including them makes the residual negative in
// January), so GST is exported separately as a memo cash item below.
export interface OutflowCategory { label: string; monthly: number[]; total: number }

const CATEGORY_LINES: [string, string[]][] = [
  ["Payroll & staff", ["HR Cost"]],
  ["Materials & purchases", ["Raw Material", "Raw Materials Purchase", "Trading Items Purchase"]],
  ["Site & utilities", ["Site Cost (IT, POS, Utilities, Internet, Phones, Electiricity & Similar Costs)"]],
  ["Repairs & maintenance", ["Repair & Maintenance (AMCs + Ad-hoc Repairs+Furniture+Equipment)"]],
  ["Delivery commissions", ["Delivery Partner Commission"]],
  ["Marketing & PR", ["Marketing & PR"]],
  ["Legal & licences", ["Legal Fees", "Licence Fees"]],
];

export interface CashFlowYearData {
  fy: string;
  label: string;
  hasFullDetail: boolean;
  months: string[];
  inflows: number[];
  outflows: number[];
  net: number[];
  cumulative: number[];
  outflowCategories: OutflowCategory[];
  gstMemo: { label: string; monthly: number[]; total: number };
}

function cashFlowForFY(fiscalYear: string): CashFlowYearData {
  const pids = monthPeriodIds(fiscalYear);
  const fab = FAB_BY_FY[fiscalYear];
  const store = STORE_BY_FY[fiscalYear];
  const crafts = CRAFT_KEYS.map((k) => deptFinancials(k, pids));

  const hasFullDetail = !!fab?.hasMonthlyDetail && !!store?.hasMonthlyDetail
    && crafts.every((c) => c.revenue.some((v) => v != null));

  if (!hasFullDetail) {
    return {
      fy: fiscalYear, label: fyLabel(fiscalYear), hasFullDetail: false,
      months: MONTHS, inflows: [], outflows: [], net: [], cumulative: [],
      outflowCategories: [], gstMemo: { label: "GST paid", monthly: [], total: 0 },
    };
  }

  const deptRevenue = [fab.totalRevenue, store.totalSales, ...crafts.map((c) => c.revenue)];
  const deptExpense = [fab.totalExpense, store.totalExpense, ...crafts.map((c) => c.totalExpenses)];
  const inflows = MONTHS.map((_, i) => sum(deptRevenue.map((s) => s[i])));
  const outflows = MONTHS.map((_, i) => sum(deptExpense.map((s) => s[i])));
  const net = MONTHS.map((_, i) => inflows[i] - outflows[i]);
  const cumulative = net.reduce((acc: number[], v) => [...acc, (acc.at(-1) ?? 0) + v], [] as number[]);

  const outflowCategories: OutflowCategory[] = CATEGORY_LINES.map(([label, names]) => {
    const monthly = monthlyAcrossUnits(liIdsByName(...names), pids);
    return { label, monthly, total: sum(monthly) };
  });
  // residual = reported total expenses minus the categorised lines
  const categorised = MONTHS.map((_, i) => sum(outflowCategories.map((c) => c.monthly[i])));
  const otherMonthly = MONTHS.map((_, i) => outflows[i] - categorised[i]);
  outflowCategories.push({ label: "Other operating costs", monthly: otherMonthly, total: sum(otherMonthly) });

  // GST memo - a real cash outflow, but reported outside the departmental
  // expense totals in the source sheets (pass-through, not a P&L cost)
  const gstMonthly = monthlyAcrossUnits(liIdsByName("GST Paid", "GST Expenses"), pids);

  return {
    fy: fiscalYear, label: fyLabel(fiscalYear), hasFullDetail: true,
    months: MONTHS, inflows, outflows, net, cumulative,
    outflowCategories,
    gstMemo: { label: "GST paid", monthly: gstMonthly, total: sum(gstMonthly) },
  };
}

export const CASHFLOW_BY_FY: Record<string, CashFlowYearData> = Object.fromEntries(
  OVERVIEW_FYS.map((fy) => [fy, cashFlowForFY(fy)])
);

// Kept for aiContext.ts, which is scoped to the current fiscal year only.
const CURRENT = CASHFLOW_BY_FY["2025-2026"];
export const CASHFLOW = { months: CURRENT.months, inflows: CURRENT.inflows, outflows: CURRENT.outflows, net: CURRENT.net, cumulative: CURRENT.cumulative };
export const OUTFLOW_CATEGORIES = CURRENT.outflowCategories;
export const GST_MEMO = CURRENT.gstMemo;

// ── What the source data cannot answer ──────────────────────────────────────
export const CASH_GAPS = [
  "Opening / current bank balance",
  "Accounts receivable & collection timing",
  "Accounts payable & vendor payment terms",
  "Loan EMIs, interest schedule & debt position",
  "Capex and asset purchases",
];
