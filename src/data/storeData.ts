// ─────────────────────────────────────────────────────────────────────────────
// Sienna store-sales workbook adapter: channel breakdowns, category mix,
// multi-year revenue history, and consignment / partner-brand sales.
// ─────────────────────────────────────────────────────────────────────────────

import {
  MONTHS, FY2526_PIDS, periods, categories, channels, salesRecords,
  vendors, consignmentRecords, monthPeriodIds, sum,
} from "./core";

// ── Channel breakdown (real, "Overall sales" sheet) ─────────────────────────
const CHANNEL_NAME_MAP: Record<string, string> = { "Corporate Sales": "Corporate", "Online Sales": "Online" };

function channelBreakdown(periodIds: number[]): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const c of channels) {
    const name = CHANNEL_NAME_MAP[c.name] || c.name;
    out[name] = periodIds.map((pid) => {
      const rec = salesRecords.find(
        (r) => r.periodId === pid && r.channelId === c.id && r.categoryId == null
      );
      return rec ? rec.amount : 0;
    });
  }
  const channelNames = Object.keys(out);
  out.Total = periodIds.map((_, i) => sum(channelNames.map((name) => out[name][i])));
  return out;
}
function channelTotals(breakdown: Record<string, number[]>): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const [name, vals] of Object.entries(breakdown)) totals[name] = sum(vals);
  return totals;
}

const FY2627_PIDS = periods
  .filter((p) => p.periodType === "month" && p.fiscalYear === "2026-2027" && p.id <= 58)
  .sort((a, b) => a.id - b.id)
  .map((p) => p.id); // only Apr & May 2026 currently in the source data

const fy2526Channels = channelBreakdown(FY2526_PIDS);
const fy2627Channels = channelBreakdown(FY2627_PIDS);

export const SIENNA_STORE = {
  fy2526: { months: MONTHS, channels: fy2526Channels, totals: channelTotals(fy2526Channels) },
  fy2627: { months: ["Apr", "May"], channels: fy2627Channels, totals: channelTotals(fy2627Channels) },
};

// ── Annual category totals ──────────────────────────────────────────────────
// Category detail is complete for FY 2021-22 … FY 2025-26 (12 months each),
// so the headline mix uses the current year and a per-year breakdown is
// exported for comparisons.
const CATEGORY_NAME_MAP: Record<string, string> = { "Leather & jute": "Leather & Jute" };

function categoriesForFY(fiscalYear: string) {
  const pids = monthPeriodIds(fiscalYear);
  return categories
    .map((cat) => ({
      name: CATEGORY_NAME_MAP[cat.name] || cat.name,
      value: sum(
        salesRecords
          .filter((r) => r.categoryId === cat.id && pids.includes(r.periodId))
          .map((r) => r.amount)
      ),
    }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);
}

export const SIENNA_CATEGORIES_LABEL = "FY 2025-26";
export const SIENNA_CATEGORIES = categoriesForFY("2025-2026");
export const SIENNA_CATEGORIES_BY_FY = Object.fromEntries(
  ["2021-2022", "2022-2023", "2023-2024", "2024-2025", "2025-2026"].map((fy) => [
    fy,
    categoriesForFY(fy),
  ])
);

// ── Store revenue — multi-year history ─────────────────────────────────────
// Every fiscal year has a channel-level "Overall sales" block in the source,
// so all totals are summed from monthly channel records.
function fyStoreRevenue(fiscalYear: string) {
  const pids = monthPeriodIds(fiscalYear);
  const total = sum(
    salesRecords.filter((r) => pids.includes(r.periodId) && r.categoryId == null).map((r) => r.amount)
  );
  return { total, method: "channel" };
}

export const STORE_HISTORY = [
  { fy: "2021-2022", label: "FY 21-22", ...fyStoreRevenue("2021-2022") },
  { fy: "2022-2023", label: "FY 22-23", ...fyStoreRevenue("2022-2023") },
  { fy: "2023-2024", label: "FY 23-24", ...fyStoreRevenue("2023-2024") },
  { fy: "2024-2025", label: "FY 24-25", ...fyStoreRevenue("2024-2025") },
  { fy: "2025-2026", label: "FY 25-26", ...fyStoreRevenue("2025-2026") },
  { fy: "2026-2027", label: "FY 26-27 (Apr–May)", ...fyStoreRevenue("2026-2027") },
];

// ── Consignment & partner brands ────────────────────────────────────────────
export const CONSIGNMENT_FYS = ["2023-2024", "2024-2025", "2025-2026", "2026-2027"];
export const CONSIGNMENT = CONSIGNMENT_FYS.map((fy) => {
  const pids = monthPeriodIds(fy);
  const rows = vendors
    .map((v) => ({
      name: v.name,
      group: v.group,
      rate: v.commissionRate,
      total: sum(
        consignmentRecords
          .filter((r) => r.vendorId === v.id && pids.includes(r.periodId))
          .map((r) => r.amount)
      ),
    }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
  return {
    fy,
    label: `FY ${fy.slice(2, 4)}-${fy.slice(7)}`,
    vendors: rows,
    total: sum(rows.map((r) => r.total)),
    commission: sum(rows.map((r) => r.total * (r.rate || 0))),
  };
});
