// Pure, parametrized F&B (CEPL department "F&B") monthly P&L computation.
//
// Business-unit and line-item ids aren't hardcoded here - they're assigned
// by whatever order the importer (or `npm run db:seed`'s canonical dataset)
// happened to create rows in, which varies between a fresh Excel import and
// the seeded verified dataset. Only the (businessId, name[, valueType])
// identity is stable, so resolveFnbBu/resolveFabLi/resolveFabOvLi look ids
// up by name against live reference data, the same way fnbVenueData.ts and
// outletData.ts's buildLi2Lookup already do for their own tables.
import { MONTHS, series, pctSeries, sum, type FrIndex, type Series } from "./seriesKernel";
import type { BusinessUnit, LineItem } from "./types";

export const CEPL_ID = 1;
const FNB_BU_NAME = "F&B";

export function resolveFnbBu(businessUnits: BusinessUnit[]): number {
  return businessUnits.find((u) => u.businessId === CEPL_ID && u.name === FNB_BU_NAME)?.id ?? -1;
}

const LI_NAMES = {
  productSales: "F&B Product Sales",
  retailBarSales: "F&B Retail & Bar Sales",
  eventCatering: "F&B Event & Catering Receipt",
  totalRevenue: "Total F&B Sales Monthwise",
  rawMaterial: "Raw Material",
  cogsPct: "% COGS",
  hrCost: "HR Cost",
  hrPct: "HR Cost Percentage",
  siteCost: "Site Cost (IT, POS, Utilities, Internet, Phones, Electiricity & Similar Costs)",
  marketingCost: "Marketing & PR",
  deliveryComm: "Delivery Partner Commission",
  totalExpense: "Total F&B Expenses",
  profitLoss: "P+L = Gross Revenue - Operating Costs",
  plPct: "Profit & Loss %",
} as const;

export type FabLi = Record<keyof typeof LI_NAMES, number | null>;

export function resolveFabLi(lineItems: LineItem[]): FabLi {
  const byName = new Map(lineItems.filter((l) => l.businessId === CEPL_ID).map((l) => [l.name, l.id]));
  const out = {} as FabLi;
  for (const key of Object.keys(LI_NAMES) as (keyof typeof LI_NAMES)[]) {
    out[key] = byName.get(LI_NAMES[key]) ?? null;
  }
  return out;
}

// F&B has no secondary workbook with multi-year detail to fall back on the
// way Store does - years without department-sheet data only get the two
// Overview-sheet annual totals for the F&B business unit, nothing else.
const OV_LI_NAMES = { sales: "Sales (Overview)", pl: "Profit & Loss (Overview)" } as const;

export type FabOvLi = Record<keyof typeof OV_LI_NAMES, number | null>;

export function resolveFabOvLi(lineItems: LineItem[]): FabOvLi {
  const byName = new Map(lineItems.filter((l) => l.businessId === CEPL_ID).map((l) => [l.name, l.id]));
  const out = {} as FabOvLi;
  for (const key of Object.keys(OV_LI_NAMES) as (keyof typeof OV_LI_NAMES)[]) {
    out[key] = byName.get(OV_LI_NAMES[key]) ?? null;
  }
  return out;
}

export interface FabMonthly {
  months: string[];
  productSales: Series; retailBarSales: Series; eventCatering: Series; totalRevenue: Series;
  rawMaterial: Series; cogsPct: Series; hrCost: Series; hrPct: Series; siteCost: Series;
  marketingCost: Series; deliveryComm: Series; totalExpense: Series; profitLoss: Series; plPct: Series;
}

export function computeFabMonthly(idx: FrIndex, bu: number, li: FabLi, periodIds: number[]): FabMonthly {
  return {
    months: MONTHS,
    productSales:   series(idx, bu, li.productSales, periodIds),
    retailBarSales: series(idx, bu, li.retailBarSales, periodIds),
    eventCatering:  series(idx, bu, li.eventCatering, periodIds),
    totalRevenue:   series(idx, bu, li.totalRevenue, periodIds),
    rawMaterial:    series(idx, bu, li.rawMaterial, periodIds),
    cogsPct:        pctSeries(idx, bu, li.cogsPct, periodIds),
    hrCost:         series(idx, bu, li.hrCost, periodIds),
    hrPct:          pctSeries(idx, bu, li.hrPct, periodIds),
    siteCost:       series(idx, bu, li.siteCost, periodIds),
    marketingCost:  series(idx, bu, li.marketingCost, periodIds),
    deliveryComm:   series(idx, bu, li.deliveryComm, periodIds),
    totalExpense:   series(idx, bu, li.totalExpense, periodIds),
    profitLoss:     series(idx, bu, li.profitLoss, periodIds),
    plPct:          pctSeries(idx, bu, li.plPct, periodIds),
  };
}

export interface FabYearData {
  fy: string;
  label: string;
  hasMonthlyDetail: boolean;
  productSales: Series; retailBarSales: Series; eventCatering: Series; totalRevenue: Series;
  rawMaterial: Series; cogsPct: Series; hrCost: Series; hrPct: Series; siteCost: Series;
  marketingCost: Series; deliveryComm: Series; totalExpense: Series; profitLoss: Series; plPct: Series;
  totals: { revenue: number; pl: number };
}

export function computeFabYear(
  idx: FrIndex, bu: number, li: FabLi, ovLi: FabOvLi, fy: string, label: string, periodIds: number[]
): FabYearData {
  const m = computeFabMonthly(idx, bu, li, periodIds);
  const hasMonthlyDetail = m.totalRevenue.some((v) => v != null);
  const totals = hasMonthlyDetail
    ? { revenue: sum(m.totalRevenue), pl: sum(m.profitLoss) }
    : {
        revenue: sum(series(idx, bu, ovLi.sales, periodIds)),
        pl: sum(series(idx, bu, ovLi.pl, periodIds)),
      };
  return {
    fy, label, hasMonthlyDetail,
    productSales: m.productSales, retailBarSales: m.retailBarSales, eventCatering: m.eventCatering,
    totalRevenue: m.totalRevenue, rawMaterial: m.rawMaterial, cogsPct: m.cogsPct, hrCost: m.hrCost,
    hrPct: m.hrPct, siteCost: m.siteCost, marketingCost: m.marketingCost, deliveryComm: m.deliveryComm,
    totalExpense: m.totalExpense, profitLoss: m.profitLoss, plPct: m.plPct,
    totals,
  };
}
