// ─────────────────────────────────────────────────────────────────────────────
// Cash-flow adapter (CEPL workbook, FY 2025-26). Derives group-wide monthly
// money-in / money-out from the six departments' P&L records:
//   inflows  = every department's reported total sales
//   outflows = every department's reported total expenses
// and splits outflows into the workbook's own cost lines (payroll, materials,
// GST, licences, delivery commissions, site costs, …).
//
// HONEST LIMIT: the source workbooks are P&L statements. They contain no bank
// balance, receivables, payables, loan schedule or opening cash, so true
// cash-position / working-capital metrics are NOT derivable — see
// CASH_GAPS, which the Cash Flow page surfaces instead of invented numbers.
// ─────────────────────────────────────────────────────────────────────────────

import { MONTHS, FY2526_PIDS, lineItems, frGet, sum } from "./core";
import { FAB, STORE, TRADING_ITEMS, POTTERY, BATIK, STITCHING } from "./ceplData";

const CEPL_UNITS = [1, 2, 3, 4, 5, 6];

// sum one-or-more line items (by exact name) across all CEPL departments
const liIdsByName = (...names) =>
  lineItems
    .filter((l) => l.businessId === 1 && l.valueType === "amount" && names.includes(l.name))
    .map((l) => l.id);

function monthlyAcrossUnits(liIds) {
  return FY2526_PIDS.map((pid) =>
    sum(CEPL_UNITS.flatMap((u) => liIds.map((lid) => frGet(u, pid, lid))))
  );
}

// ── Group monthly inflows / outflows / net ──────────────────────────────────
const deptSeries = [FAB.totalRevenue, STORE.totalSales, TRADING_ITEMS.revenue, POTTERY.revenue, BATIK.revenue, STITCHING.revenue];
const expSeries = [FAB.totalExpense, STORE.totalExpense, TRADING_ITEMS.totalExpenses, POTTERY.totalExpenses, BATIK.totalExpenses, STITCHING.totalExpenses];

const inflows = MONTHS.map((_, i) => sum(deptSeries.map((s) => s[i])));
const outflows = MONTHS.map((_, i) => sum(expSeries.map((s) => s[i])));
const net = MONTHS.map((_, i) => inflows[i] - outflows[i]);
const cumulative = net.reduce((acc, v) => [...acc, (acc.at(-1) ?? 0) + v], []);

export const CASHFLOW = { months: MONTHS, inflows, outflows, net, cumulative };

// ── Outflow breakdown (the workbook's own cost lines, all departments) ──────
// 'HR Cost' is each sheet's salary + staff-welfare total, so the Salary /
// Staff Welfare sub-rows are deliberately not added on top of it. GST is NOT
// a category here: the 'GST Paid'/'GST Expenses' rows sit outside the sheets'
// own Total Expenses (verified: including them makes the residual negative in
// January), so GST is exported separately as a memo cash item below.
const CATEGORY_LINES = [
  ["Payroll & staff", ["HR Cost"]],
  ["Materials & purchases", ["Raw Material", "Raw Materials Purchase", "Trading Items Purchase"]],
  ["Site & utilities", ["Site Cost (IT, POS, Utilities, Internet, Phones, Electiricity & Similar Costs)"]],
  ["Repairs & maintenance", ["Repair & Maintenance (AMCs + Ad-hoc Repairs+Furniture+Equipment)"]],
  ["Delivery commissions", ["Delivery Partner Commission"]],
  ["Marketing & PR", ["Marketing & PR"]],
  ["Legal & licences", ["Legal Fees", "Licence Fees"]],
];

export const OUTFLOW_CATEGORIES = CATEGORY_LINES.map(([label, names]) => {
  const monthly = monthlyAcrossUnits(liIdsByName(...names));
  return { label, monthly, total: sum(monthly) };
});

// residual = reported total expenses minus the categorised lines
{
  const categorised = MONTHS.map((_, i) => sum(OUTFLOW_CATEGORIES.map((c) => c.monthly[i])));
  const monthly = MONTHS.map((_, i) => outflows[i] - categorised[i]);
  OUTFLOW_CATEGORIES.push({ label: "Other operating costs", monthly, total: sum(monthly) });
}

// GST memo — a real cash outflow, but reported outside the departmental
// expense totals in the source sheets (pass-through, not a P&L cost)
const gstMonthly = monthlyAcrossUnits(liIdsByName("GST Paid", "GST Expenses"));
export const GST_MEMO = { label: "GST paid", monthly: gstMonthly, total: sum(gstMonthly) };

// ── What the source data cannot answer ──────────────────────────────────────
export const CASH_GAPS = [
  "Opening / current bank balance",
  "Accounts receivable & collection timing",
  "Accounts payable & vendor payment terms",
  "Loan EMIs, interest schedule & debt position",
  "Capex and asset purchases",
];
