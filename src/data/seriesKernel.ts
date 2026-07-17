// Pure, dataset-independent aggregation kernel. Every function here takes its
// inputs explicitly (an FrIndex, a periods array, etc.) rather than reading
// a module-level dataset singleton - this is what lets the per-route hooks
// (see src/hooks/useFinancialRecords.ts et al.) and the pure computation
// modules built on top of them (deptFinancials.ts, outletData.ts, etc.)
// share the same aggregation logic.
import type { FinancialRecord, Period } from "./types";

export type Series = (number | null)[];

export interface FrIndex {
  get(businessUnitId: number, periodId: number, lineItemId: number | null): number | null;
}

export function buildFrIndex(records: FinancialRecord[]): FrIndex {
  const map: Record<number, Record<number, Record<number, number>>> = {};
  for (const r of records) {
    (map[r.businessUnitId] ??= {});
    (map[r.businessUnitId][r.periodId] ??= {});
    map[r.businessUnitId][r.periodId][r.lineItemId] = r.value;
  }
  return {
    get: (businessUnitId, periodId, lineItemId) =>
      lineItemId == null ? null : map[businessUnitId]?.[periodId]?.[lineItemId] ?? null,
  };
}

export const frGet = (
  idx: FrIndex,
  businessUnitId: number,
  periodId: number,
  lineItemId: number | null
): number | null => idx.get(businessUnitId, periodId, lineItemId);

export function series(idx: FrIndex, businessUnitId: number, lineItemId: number | null, periodIds: number[]): Series {
  return periodIds.map((pid) => idx.get(businessUnitId, pid, lineItemId));
}

// financialRecords stores percentages as fractions (0.296 = 29.6%)
export function pctSeries(idx: FrIndex, businessUnitId: number, lineItemId: number, periodIds: number[]): Series {
  return series(idx, businessUnitId, lineItemId, periodIds).map((v) =>
    v == null ? null : Math.round(v * 1000) / 10
  );
}

export function monthPeriodIds(periods: Period[], fiscalYear: string): number[] {
  return periods
    .filter((p) => p.periodType === "month" && p.fiscalYear === fiscalYear)
    .sort((a, b) => a.id - b.id)
    .map((p) => p.id);
}

export const sum = (arr: (number | null | undefined)[]): number =>
  arr.reduce((a: number, b) => a + (b || 0), 0);

export const avg = (arr: (number | null | undefined)[]): number => {
  const valid = arr.filter((v): v is number => v != null);
  return valid.length ? sum(valid) / valid.length : 0;
};

/** Index of the max value in a (possibly null-containing) series, or -1 if all null. */
export const maxIdx = (arr: (number | null | undefined)[]): number =>
  arr.reduce((best: number, v, i) => (v != null && (best === -1 || v > (arr[best] as number)) ? i : best), -1);

/** Index of the min value in a (possibly null-containing) series, or -1 if all null. */
export const minIdx = (arr: (number | null | undefined)[]): number =>
  arr.reduce((worst: number, v, i) => (v != null && (worst === -1 || v < (arr[worst] as number)) ? i : worst), -1);

/** Index of the last non-null value in a series, or -1 if all null. */
export const lastValidIdx = (arr: (number | null | undefined)[]): number => {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return i;
  return -1;
};

export const MONTHS = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"];

/** "2025-2026" -> "FY 25-26" */
export const fyLabel = (fy: string): string => `FY ${fy.slice(2, 4)}-${fy.slice(7)}`;

// ── Format helpers ───────────────────────────────────────────────────────────
export const L = (n: number | null | undefined): string => {
  if (n == null) return "-";
  const abs = Math.abs(n);
  if (abs >= 10000000) return `${(n/10000000).toFixed(2)}Cr`;
  if (abs >= 100000)   return `${(n/100000).toFixed(1)}L`;
  if (abs >= 1000)     return `${(n/1000).toFixed(1)}K`;
  return String(Math.round(n));
};

export const pct = (n: number | null | undefined): string => (n == null ? "-" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);
