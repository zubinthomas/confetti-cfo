// Cash forecast: a flat trend projection from the latest known balance plus
// a trailing-3-month run-rate - not an AP/AR-timing-aware forecast. Per-bill
// due-date data exists now (src/data/billAgeing.ts, fed by Tally's bill-wise
// sync), but it isn't wired into this projection - ageing is surfaced as its
// own section instead (see CashFlowTab.tsx's AgeingSection), not folded into
// the trend line. Pure, frontend-only, fed by the server's computed position
// (server/db/bankBalanceLedger.ts's computePosition) and
// cashFlowFinancials.ts's own already-computed monthly inflow/outflow
// series - this app's convention of doing financial aggregation client-side
// over already-fetched data, not on the server.

export interface CashForecastWeek {
  week: number; // 1..weeks
  balance: number;
}

/** trailingInflows/trailingOutflows: the last 3 months' monthly totals
 *  (most recent last), both as positive numbers. Divides their average to a
 *  weekly rate and flat-lines it forward `weeks` weeks from startingBalance. */
export function computeCashForecast(
  startingBalance: number,
  trailingInflows: number[],
  trailingOutflows: number[],
  weeks = 13
): CashForecastWeek[] {
  const avg = (vals: number[]) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);
  const weeklyNet = (avg(trailingInflows) - avg(trailingOutflows)) / (52 / 12);

  const out: CashForecastWeek[] = [];
  let balance = startingBalance;
  for (let week = 1; week <= weeks; week++) {
    balance += weeklyNet;
    out.push({ week, balance });
  }
  return out;
}
