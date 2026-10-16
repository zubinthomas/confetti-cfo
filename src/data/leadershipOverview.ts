// Leadership Command Centre support types. The page itself composes numbers
// already produced by computeCompanyPL/computeBalanceSheet/computeCashFlowForFY
// - this module holds only what's genuinely new: the one derived Store+F&B
// target-pace figure (no existing module produces it), and the list of
// things leadership will ask for that no source data can answer yet, kept
// here rather than invented or silently omitted - same convention as
// CASH_GAPS in cashFlowFinancials.ts.
import { CASH_GAPS } from "./cashFlowFinancials";

export interface StoreFnbTargetPace {
  actual: number;
  target: number;
  gap: number;
}

// "Receivables & payables ageing" was removed once Tally's bill-wise sync
// shipped - see src/data/billAgeing.ts.
export const UNAVAILABLE_METRICS = [
  ...CASH_GAPS,
  "Scenario / what-if planning",
];
