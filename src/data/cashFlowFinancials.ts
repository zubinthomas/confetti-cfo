// Pure, parametrized group cash-flow computation (CEPL workbook, all six
// departments - F&B, Store, Trading Items, Pottery, Batik, Stitching).
//
// This only produces a real number for a fiscal year when ALL SIX
// departments have monthly detail for it - unlike F&B/Store, the four craft
// departments have no annual-only fallback at all, so a partial
// (F&B+Store-only) total would silently misrepresent itself as "group cash
// flow." Years without full six-department detail get no computed numbers
// at all, not a partial one - see hasFullDetail below.
//
// HONEST LIMIT: the source workbooks are P&L statements. They contain no
// bank balance, receivables, payables, loan schedule or opening cash, so
// true cash-position / working-capital metrics are NOT derivable - see
// CASH_GAPS below, which the Cash Flow page and the AI context builder
// surface instead of invented numbers.
import { MONTHS, frGet, sum, fyLabel, type FrIndex } from "./seriesKernel";
import type { BusinessUnit, LineItem } from "./types";
import { computeFabMonthly, resolveFnbBu, resolveFabLi, type FabLi } from "./fabData";
import { computeStoreYear, resolveStoreBu, resolveStoreLi, type StoreLi } from "./storeFinancials";
import { computeDeptFinancials, resolveDeptBu, resolveDeptLi, type DeptKey, type DeptLi } from "./deptFinancials";

const CRAFT_KEYS: DeptKey[] = ["tradingItems", "pottery", "batik", "stitching"];

export interface CashFlowIds {
  fnbBu: number; storeBu: number; deptBu: Record<DeptKey, number>;
  fnbLi: FabLi; storeLi: StoreLi; deptLi: DeptLi;
}

export function resolveCashFlowIds(businessUnits: BusinessUnit[], lineItems: LineItem[]): CashFlowIds {
  return {
    fnbBu: resolveFnbBu(businessUnits), storeBu: resolveStoreBu(businessUnits), deptBu: resolveDeptBu(businessUnits),
    fnbLi: resolveFabLi(lineItems), storeLi: resolveStoreLi(lineItems), deptLi: resolveDeptLi(lineItems),
  };
}

// sum one-or-more line items (by exact name) across all CEPL departments
const liIdsByName = (lineItems: LineItem[], ...names: string[]): number[] =>
  lineItems
    .filter((l) => l.businessId === 1 && l.valueType === "amount" && names.includes(l.name))
    .map((l) => l.id);

function monthlyAcrossUnits(idx: FrIndex, units: number[], liIds: number[], periodIds: number[]): number[] {
  return periodIds.map((pid) =>
    sum(units.flatMap((u) => liIds.map((lid) => frGet(idx, u, pid, lid))))
  );
}

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

export function computeCashFlowForFY(
  idx: FrIndex, ids: CashFlowIds, lineItems: LineItem[], fiscalYear: string, periodIds: number[]
): CashFlowYearData {
  const allUnits = [ids.fnbBu, ids.storeBu, ...CRAFT_KEYS.map((k) => ids.deptBu[k])];
  const fab = computeFabMonthly(idx, ids.fnbBu, ids.fnbLi, periodIds);
  const fabHasMonthlyDetail = fab.totalRevenue.some((v) => v != null);
  const store = computeStoreYear(idx, ids.storeBu, ids.storeLi, fiscalYear, fyLabel(fiscalYear), periodIds);
  const crafts = CRAFT_KEYS.map((k) => computeDeptFinancials(idx, ids.deptBu[k], ids.deptLi, k, periodIds));

  const hasFullDetail = fabHasMonthlyDetail && store.hasMonthlyDetail
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
    const monthly = monthlyAcrossUnits(idx, allUnits, liIdsByName(lineItems, ...names), periodIds);
    return { label, monthly, total: sum(monthly) };
  });
  // residual = reported total expenses minus the categorised lines
  const categorised = MONTHS.map((_, i) => sum(outflowCategories.map((c) => c.monthly[i])));
  const otherMonthly = MONTHS.map((_, i) => outflows[i] - categorised[i]);
  outflowCategories.push({ label: "Other operating costs", monthly: otherMonthly, total: sum(otherMonthly) });

  // GST memo - a real cash outflow, but reported outside the departmental
  // expense totals in the source sheets (pass-through, not a P&L cost)
  const gstMonthly = monthlyAcrossUnits(idx, allUnits, liIdsByName(lineItems, "GST Paid", "GST Expenses"), periodIds);

  return {
    fy: fiscalYear, label: fyLabel(fiscalYear), hasFullDetail: true,
    months: MONTHS, inflows, outflows, net, cumulative,
    outflowCategories,
    gstMemo: { label: "GST paid", monthly: gstMonthly, total: sum(gstMonthly) },
  };
}

// ── What the source data cannot answer ──────────────────────────────────────
// The source workbooks are P&L statements: no bank balance, receivables,
// payables, loan schedule or opening cash, so true cash-position /
// working-capital metrics are NOT derivable - the Cash Flow page and the AI
// context builder surface this list instead of inventing numbers.
export const CASH_GAPS = [
  "Opening / current bank balance",
  "Accounts receivable & collection timing",
  "Accounts payable & vendor payment terms",
  "Loan EMIs, interest schedule & debt position",
  "Capex and asset purchases",
];
