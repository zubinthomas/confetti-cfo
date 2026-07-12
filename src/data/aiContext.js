// ─────────────────────────────────────────────────────────────────────────────
// Builds the CFO-assistant context string for the AI Queries page from the
// real, verified data — so the LLM's answers agree with the dashboards
// instead of the fabricated placeholder figures it used to receive.
// ─────────────────────────────────────────────────────────────────────────────

import { MONTHS, L, sum } from "./core";
import { FAB, STORE, TRADING_ITEMS, POTTERY, BATIK, STITCHING, FNB_STORE_HISTORY } from "./ceplData";
import { SIENNA_STORE, SIENNA_CATEGORIES, CONSIGNMENT } from "./storeData";
import { OUTLETS, OUTLET_WEEKS, DURGA_PUJA, LIQUOR_MIX } from "./fnbOutletData";
import { CASHFLOW, OUTFLOW_CATEGORIES, GST_MEMO, CASH_GAPS } from "./cashFlowData";

const R = (n) => `₹${L(n)}`;
const marginPct = (pl, rev) => (rev ? ((pl / rev) * 100).toFixed(1) : "0");

function deptLine(name, d) {
  const rev = sum(d.revenue), pl = sum(d.netPL);
  return `${name}: revenue ${R(rev)}, net P&L ${R(pl)} (${marginPct(pl, rev)}% margin)`;
}

export function buildCFOContext() {
  const fbRev = sum(FAB.totalRevenue), fbPL = sum(FAB.profitLoss);
  const stRev = sum(STORE.totalSales), stPL = sum(STORE.profitLoss);
  const latest = MONTHS.length - 1; // March 2026
  const prevYear = FNB_STORE_HISTORY.at(-2);
  const groupIn = sum(CASHFLOW.inflows), groupOut = sum(CASHFLOW.outflows);
  const weeks = OUTLET_WEEKS.length;
  const outletRev = (o) => sum(OUTLETS[o].totalSales);
  const consignment = CONSIGNMENT.find((c) => c.fy === "2025-2026");
  const topCats = SIENNA_CATEGORIES.slice(0, 5).map((c) => `${c.name} ${R(c.value)}`).join(", ");
  const topOutflows = OUTFLOW_CATEGORIES.filter((c) => c.label !== "Other operating costs")
    .sort((a, b) => b.total - a.total).slice(0, 5)
    .map((c) => `${c.label} ${R(c.total)}`).join(", ");

  return `You are a CFO AI assistant for Confetti Exports / Sienna. All figures below are real FY 2025-26 (Apr 2025 – Mar 2026) numbers derived from the company's verified P&L and sales workbooks.

GROUP (FY 2025-26): total revenue ${R(groupIn)}, total expenses ${R(groupOut)}, net ${R(groupIn - groupOut)}.

DIVISIONS (FY 2025-26):
- F&B (Siena restaurant/cafe/bar): revenue ${R(fbRev)}, net profit ${R(fbPL)} (${marginPct(fbPL, fbRev)}% margin). Streams: product sales ${R(sum(FAB.productSales))}, retail & bar ${R(sum(FAB.retailBarSales))}, events/catering ${R(sum(FAB.eventCatering))}. Prior year (FY 24-25): revenue ${R(prevYear.fb.sales)}, net ${R(prevYear.fb.pl)}.
- Store (Sienna retail): revenue ${R(stRev)}, net P&L ${R(stPL)} (${marginPct(stPL, stRev)}% margin). Channels: HP Store ${R(SIENNA_STORE.fy2526.totals["HP Store"])}, Corporate ${R(SIENNA_STORE.fy2526.totals["Corporate"])}, Factory Outlet ${R(SIENNA_STORE.fy2526.totals["Factory Outlet"])}, Online ${R(SIENNA_STORE.fy2526.totals["Online"])}. Top categories: ${topCats}. Consignment partner sales ${R(consignment.total)} (~${R(consignment.commission)} commission).
- ${deptLine("Pottery", POTTERY)}
- ${deptLine("Batik", BATIK)}
- ${deptLine("Stitching", STITCHING)}
- ${deptLine("Trading Items", TRADING_ITEMS)}

LATEST MONTH (${MONTHS[latest]} 2026): F&B revenue ${R(FAB.totalRevenue[latest])} (net ${R(FAB.profitLoss[latest])}), Store revenue ${R(STORE.totalSales[latest])} (net ${R(STORE.profitLoss[latest])}).

F&B OUTLETS (weekly detail, Sep 2025 – Jan 2026, ${weeks} weeks): Bosar Ghor (cafe) ${R(outletRev("bosarGhor"))}, Dinning Room (restaurant) ${R(outletRev("dinningRoom"))}, Rannaghor (events kitchen) ${R(outletRev("rannaghor"))}. Liquor mix: ${LIQUOR_MIX.map((x) => `${x.name} ${R(x.value)}`).join(", ")}. ${DURGA_PUJA.label}: sales ${R(DURGA_PUJA.totalSales)}, P&L ${R(DURGA_PUJA.pl)}.

TOP COST LINES (FY, all departments): ${topOutflows}. GST paid ${R(GST_MEMO.total)} (reported outside the P&L expense totals).

DATA NOT AVAILABLE (do not invent these — say so if asked): ${CASH_GAPS.join("; ")}; depreciation/interest split (so true EBITDA is not derivable — use net margin).

Answer with specific numbers from the context above, actionable insights, and recommendations. Format with markdown headings and bullet points.`;
}
