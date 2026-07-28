// ─────────────────────────────────────────────────────────────────────────────
// Builds the CFO-assistant context string for the AI Queries page from the
// real, verified data - so the LLM's answers agree with the dashboards
// instead of the fabricated placeholder figures it used to receive.
//
// Takes every input as an explicit parameter (computed elsewhere from
// hook-fetched, filtered data - see src/components/dashboard/AIQueriesTab.tsx)
// instead of reading whole-dataset module constants.
// ─────────────────────────────────────────────────────────────────────────────

import { MONTHS, L, sum, type Series } from "./seriesKernel";
import type { DeptFinancials, DeptKey } from "./deptFinancials";
import type { FabMonthly } from "./fabData";
import type { FnbStoreHistoryYear } from "./overviewData";
import type { OutflowCategory } from "./cashFlowFinancials";
import type { OutletKey, OutletStreams } from "./outletData";

const R = (n: number | null | undefined) => `₹${L(n)}`;
const marginPct = (pl: number, rev: number) => (rev ? ((pl / rev) * 100).toFixed(1) : "0");

function deptLine(name: string, d: DeptFinancials) {
  const rev = sum(d.revenue), pl = sum(d.netPL);
  return `${name}: revenue ${R(rev)}, net P&L ${R(pl)} (${marginPct(pl, rev)}% margin)`;
}

export interface CFOContextInputs {
  fab: FabMonthly;
  store: { totalSales: Series; profitLoss: Series };
  craft: Record<DeptKey, DeptFinancials>;
  fnbStoreHistoryPrevYear: FnbStoreHistoryYear;
  cashflowInflows: number[];
  cashflowOutflows: number[];
  outflowCategories: OutflowCategory[];
  gstMemoTotal: number;
  outlets: Record<OutletKey, OutletStreams>;
  outletWeeksCount: number;
  durgaPuja: { label: string; totalSales: number | null; pl: number | null };
  liquorMix: { name: string; value: number }[];
  siennaStoreFy2526Totals: Record<string, number>;
  siennaCategories: { name: string; value: number }[];
  consignment: { total: number; commission: number } | undefined;
  cashGaps: string[];
}

export function buildCFOContext(inputs: CFOContextInputs): string {
  const {
    fab, store, craft, fnbStoreHistoryPrevYear: prevYear, cashflowInflows, cashflowOutflows,
    outflowCategories, gstMemoTotal, outlets, outletWeeksCount, durgaPuja, liquorMix,
    siennaStoreFy2526Totals, siennaCategories, consignment, cashGaps,
  } = inputs;

  const fbRev = sum(fab.totalRevenue), fbPL = sum(fab.profitLoss);
  const stRev = sum(store.totalSales), stPL = sum(store.profitLoss);
  const latest = MONTHS.length - 1; // March 2026
  const groupIn = sum(cashflowInflows), groupOut = sum(cashflowOutflows);
  const outletRev = (o: "bosarGhor" | "dinningRoom" | "rannaghor") => sum(outlets[o].totalSales);
  const topCats = siennaCategories.slice(0, 5).map((c) => `${c.name} ${R(c.value)}`).join(", ");
  const topOutflows = outflowCategories.filter((c) => c.label !== "Other operating costs")
    .sort((a, b) => b.total - a.total).slice(0, 5)
    .map((c) => `${c.label} ${R(c.total)}`).join(", ");

  return `You are a CFO AI assistant for Confetti Exports / Sienna. All figures below are real FY 2025-26 (Apr 2025 – Mar 2026) numbers derived from the company's verified P&L and sales workbooks.

GROUP (FY 2025-26): total revenue ${R(groupIn)}, total expenses ${R(groupOut)}, net ${R(groupIn - groupOut)}.

DIVISIONS (FY 2025-26):
- F&B (Sienna restaurant/cafe/bar): revenue ${R(fbRev)}, net profit ${R(fbPL)} (${marginPct(fbPL, fbRev)}% margin). Streams: product sales ${R(sum(fab.productSales))}, retail & bar ${R(sum(fab.retailBarSales))}, events/catering ${R(sum(fab.eventCatering))}. Prior year (FY 24-25): revenue ${R(prevYear.fb.sales)}, net ${R(prevYear.fb.pl)}.
- Store (Sienna retail): revenue ${R(stRev)}, net P&L ${R(stPL)} (${marginPct(stPL, stRev)}% margin). Channels: HP Store ${R(siennaStoreFy2526Totals["HP Store"])}, Corporate ${R(siennaStoreFy2526Totals["Corporate"])}, Factory Outlet ${R(siennaStoreFy2526Totals["Factory Outlet"])}, Online ${R(siennaStoreFy2526Totals["Online"])}. Top categories: ${topCats}. Consignment partner sales ${R(consignment?.total)} (~${R(consignment?.commission)} commission).
- ${deptLine("Pottery", craft.pottery)}
- ${deptLine("Batik", craft.batik)}
- ${deptLine("Stitching", craft.stitching)}
- ${deptLine("Trading Items", craft.tradingItems)}

LATEST MONTH (${MONTHS[latest]} 2026): F&B revenue ${R(fab.totalRevenue[latest])} (net ${R(fab.profitLoss[latest])}), Store revenue ${R(store.totalSales[latest])} (net ${R(store.profitLoss[latest])}).

F&B OUTLETS (weekly detail, Sep 2025 – Jan 2026, ${outletWeeksCount} weeks): Bosar Ghor (cafe) ${R(outletRev("bosarGhor"))}, Dinning Room (restaurant) ${R(outletRev("dinningRoom"))}, Rannaghor (events kitchen) ${R(outletRev("rannaghor"))}. Liquor mix: ${liquorMix.map((x) => `${x.name} ${R(x.value)}`).join(", ")}. ${durgaPuja.label}: sales ${R(durgaPuja.totalSales)}, P&L ${R(durgaPuja.pl)}.

TOP COST LINES (FY, all departments): ${topOutflows}. GST paid ${R(gstMemoTotal)} (reported outside the P&L expense totals).

DATA NOT AVAILABLE (do not invent these - say so if asked): ${cashGaps.join("; ")}; depreciation/interest split (so true EBITDA is not derivable - use net margin).

Answer with specific numbers from the context above, actionable insights, and recommendations. Format with markdown headings and bullet points.`;
}
