// Pure, parametrized Sienna store-sales computations (channel breakdown,
// category mix, revenue totals).
import type { SalesRecord, Category, Channel } from "./types";
import { sum } from "./seriesKernel";

const CHANNEL_NAME_MAP: Record<string, string> = { "Corporate Sales": "Corporate", "Online Sales": "Online" };
const CATEGORY_NAME_MAP: Record<string, string> = { "Leather & jute": "Leather & Jute" };

export function computeChannelBreakdown(
  salesRecords: SalesRecord[], channels: Channel[], periodIds: number[]
): Record<string, number[]> {
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

export function computeChannelTotals(breakdown: Record<string, number[]>): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const [name, vals] of Object.entries(breakdown)) totals[name] = sum(vals);
  return totals;
}

export function computeCategoriesForFY(
  salesRecords: SalesRecord[], categories: Category[], periodIds: number[]
) {
  return categories
    .map((cat) => ({
      name: CATEGORY_NAME_MAP[cat.name] || cat.name,
      value: sum(
        salesRecords
          .filter((r) => r.categoryId === cat.id && periodIds.includes(r.periodId))
          .map((r) => r.amount)
      ),
    }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);
}

export function computeStoreRevenue(salesRecords: SalesRecord[], periodIds: number[]): { total: number; method: "channel" } {
  const total = sum(
    salesRecords.filter((r) => periodIds.includes(r.periodId) && r.categoryId == null).map((r) => r.amount)
  );
  return { total, method: "channel" };
}

export function computeFirstMonthRevenue(salesRecords: SalesRecord[], periodIds: number[]): number | null {
  if (!periodIds.length) return null;
  return sum(
    salesRecords.filter((r) => r.periodId === periodIds[0] && r.categoryId == null).map((r) => r.amount)
  );
}
