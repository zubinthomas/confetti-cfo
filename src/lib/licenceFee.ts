// A licence's fee is an amount per payment interval, e.g. 5,000 every quarter.
// The values match server/db/licenceFee.ts.
export const FEE_INTERVALS = [
  { value: "monthly", label: "Monthly", per: "month" },
  { value: "quarterly", label: "Quarterly", per: "quarter" },
  { value: "half_yearly", label: "Half-yearly", per: "half-year" },
  { value: "annual", label: "Annual", per: "year" },
] as const;

export type FeeInterval = typeof FEE_INTERVALS[number]["value"];
export const DEFAULT_FEE_INTERVAL: FeeInterval = "annual";

/** The interval for a stored value; anything unknown or missing counts as annual. */
export function feeInterval(value: string | null | undefined) {
  return FEE_INTERVALS.find((i) => i.value === value) ?? FEE_INTERVALS[FEE_INTERVALS.length - 1];
}

/** Label for the amount box: "Annual fee (Rs)", "Amount per quarter (Rs)". */
export function amountFieldLabel(value: string | null | undefined): string {
  const i = feeInterval(value);
  return i.value === "annual" ? "Annual fee (₹)" : `Amount per ${i.per} (₹)`;
}

/** "₹5,000 / quarter" for the licence list, or null when there is no fee. */
export function feeLabel(amount: number | string | null | undefined, value: string | null | undefined): string | null {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `₹${n.toLocaleString("en-IN")} / ${feeInterval(value).per}`;
}
