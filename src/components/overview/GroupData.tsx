import React, { createContext, useContext } from "react";
import type { KpiData } from "@/components/dashboard/KpiCard";
import type { StatusRowData } from "@/components/dashboard/StatusRow";
import { useOverviewFiscalYears } from "@/hooks/useOverviewFiscalYears";
import { useFyParam } from "@/hooks/useFyParam";
import { useOverviewYear, type OverviewYear } from "@/hooks/useOverviewYear";
import { useFnbStoreHistory } from "@/hooks/useFnbStoreHistory";
import { useReferenceData } from "@/hooks/useReferenceData";
import { useSalesRecords } from "@/hooks/useSalesRecords";
import { useFabYear } from "@/hooks/useFabYear";
import { useRevenueTargets } from "@/hooks/useRevenueTargets";
import { useImportFreshness, type ImportFreshness } from "@/hooks/useImportFreshness";
import { MONTHS, L, lastValidIdx, fyLabel } from "@/data/seriesKernel";

export const GROUP_KPI_KEYS = ["fnbRevenue", "storeRevenue", "fnbProfit", "storePL", "fnbLatest", "storeLatest"] as const;
export type GroupKpiKey = (typeof GROUP_KPI_KEYS)[number];

export interface GroupReady {
  status: "ready";
  fy: string;
  setFy: (fy: string) => void;
  /** Years with real data. "2026-2027" is always added as the targets entry. */
  realFys: string[];
  isTargetsFy: boolean;
  cur: OverviewYear["cur"];
  freshness: ImportFreshness | undefined;
  fnbStoreHistory: NonNullable<ReturnType<typeof useFnbStoreHistory>>;
  kpis: Partial<Record<GroupKpiKey, KpiData>>;
  statusItems: StatusRowData[];
  monthlyData: Record<string, string | number | null>[];
  historyData: Record<string, string | number>[];
  // Raw inputs for the FY 26-27 targets card, which is fixed to FY26-27 and
  // FY25-26 regardless of the year picker.
  ref: ReturnType<typeof useReferenceData>["data"];
  sales2627: ReturnType<typeof useSalesRecords>["data"];
  sales2526: ReturnType<typeof useSalesRecords>["data"];
  FAB2627: ReturnType<typeof useFabYear>;
  FAB2526: ReturnType<typeof useFabYear>;
  combinedTargets2627: ReturnType<typeof useRevenueTargets>["data"];
}

export type GroupData = { status: "loading" } | GroupReady;

const GroupContext = createContext<GroupData | null>(null);

/** null when no Group provider is mounted above (no Group widget is visible). */
export const useGroupData = () => useContext(GroupContext);

/** The data behind every `group.*` overview widget. Mounted only when at least
 *  one of them is visible, so hiding them all also stops these requests. */
export function GroupProvider({ children }: { children: React.ReactNode }) {
  const fys = useOverviewFiscalYears();
  // "2026-2027" is always handled as the synthetic/projected combined-targets
  // entry (the targets widget), never as a normal year - useOverviewFiscalYears()
  // already includes it for real once either business has FY26-27 data, so it's
  // excluded here to avoid double-counting it as a duplicate chip and to keep
  // the default landing year on the last complete one.
  const realFys = fys?.filter((y) => y !== "2026-2027");
  const [fy, setFy] = useFyParam(
    realFys && [...realFys, "2026-2027"],
    realFys?.at(-1) ?? fys?.at(-1),
  );
  const fyIdx = fys && fy ? fys.indexOf(fy) : -1;
  const prevFY = fys && fyIdx > 0 ? fys[fyIdx - 1] : null;
  const overview = useOverviewYear(fy, prevFY);
  const fnbStoreHistory = useFnbStoreHistory();

  // Combined FY26-27 Store + F&B targets data - fixed to FY26-27/FY25-26
  // regardless of the page-level year selector, same as StoreTab/SiennaTab.
  const { data: ref } = useReferenceData();
  const { data: sales2627 } = useSalesRecords({ fiscalYear: ["2026-2027"] });
  const { data: sales2526 } = useSalesRecords({ fiscalYear: ["2025-2026"] });
  const FAB2627 = useFabYear("2026-2027");
  const FAB2526 = useFabYear("2025-2026");
  const { data: combinedTargets2627 } = useRevenueTargets({ category: ["store", "fnb"], fiscalYear: ["2026-2027"] });
  const freshness = useImportFreshness(["fnbMonthly", "fnbWeekly", "cepl", "sienna"]);

  let value: GroupData = { status: "loading" };
  if (fys && fy && overview && fnbStoreHistory) {
    value = {
      status: "ready",
      fy,
      setFy,
      realFys: realFys ?? [],
      isTargetsFy: fy === "2026-2027",
      cur: overview.cur,
      freshness,
      fnbStoreHistory,
      ...derive(fy, prevFY, overview, fnbStoreHistory, freshness),
      ref, sales2627, sales2526, FAB2627, FAB2526, combinedTargets2627,
    };
  }

  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>;
}

function derive(
  fy: string,
  prevFY: string | null,
  overview: OverviewYear,
  fnbStoreHistory: NonNullable<ReturnType<typeof useFnbStoreHistory>>,
  freshness: ImportFreshness | undefined,
): Pick<GroupReady, "kpis" | "statusItems" | "monthlyData" | "historyData"> {
  const CUR = overview.cur;
  const prevTotals = overview.prev?.totals ?? null;

  // Multi-year F&B + Store history (annual sales & P&L, from the workbook's
  // Overview sheet for FY21-22 ... 24-25 and the department sheets for FY25-26)
  // - always shows every year, independent of the year picker.
  const historyData = fnbStoreHistory.map((y) => ({
    year: y.label,
    "F&B Revenue": y.fb.sales,
    "Store Revenue": y.store.sales,
    "F&B P&L": y.fb.pl,
    "Store P&L": y.store.pl,
  }));

  const monthlyData = MONTHS.map((m, i) => ({
    month: m,
    "F&B Sales":   CUR.fb.sales[i],
    "Store Sales": CUR.store.sales[i],
    "F&B P&L":     CUR.fb.pl[i],
    "Store P&L":   CUR.store.pl[i],
  }));

  const LATEST_IDX = lastValidIdx(CUR.fb.sales);
  const latestMonthLabel = LATEST_IDX >= 0 ? MONTHS[LATEST_IDX] : null;

  const fbMargin = CUR.totals.fbSales ? (CUR.totals.fbPL / CUR.totals.fbSales) * 100 : 0;
  const storeMargin = CUR.totals.storeSales ? (CUR.totals.storePL / CUR.totals.storeSales) * 100 : 0;
  const storeGrowthVsPrevYear = prevTotals?.storeSales
    ? ((CUR.totals.storeSales / prevTotals.storeSales) - 1) * 100 : null;

  const kpis: GroupReady["kpis"] = {
    fnbRevenue: {
      label: `F&B Revenue (${CUR.label})`, value: L(CUR.totals.fbSales), sub: `${fbMargin.toFixed(1)}% net margin`, status: "green",
      definition: "Total F&B sales across all departments for the fiscal year.",
      href: `/fnb?fy=${fy}`,
      ...freshness,
    },
    storeRevenue: {
      label: `Store Revenue (${CUR.label})`, value: L(CUR.totals.storeSales),
      sub: prevFY && storeGrowthVsPrevYear != null
        ? `${storeGrowthVsPrevYear >= 0 ? "+" : ""}${storeGrowthVsPrevYear.toFixed(0)}% vs ${fyLabel(prevFY)}`
        : "No prior year to compare",
      status: "green",
      definition: "Total Store sales for the fiscal year.",
      href: `/store?fy=${fy}`,
      ...freshness,
    },
    fnbProfit: {
      label: "F&B Net Profit (FY)", value: L(CUR.totals.fbPL), sub: `${fbMargin.toFixed(1)}% margin`, status: "green",
      definition: "F&B's net profit for the fiscal year, after all costs.",
      href: `/fnb?fy=${fy}`,
      ...freshness,
    },
    storePL: {
      label: "Store Net P&L (FY)", value: L(CUR.totals.storePL), sub: `${storeMargin.toFixed(1)}% margin`, status: CUR.totals.storePL > 0 ? "green" : "amber",
      definition: "Store's net profit or loss for the fiscal year, after all costs.",
      href: `/store?fy=${fy}`,
      ...freshness,
    },
  };
  if (CUR.hasMonthlyDetail && LATEST_IDX >= 0) {
    kpis.fnbLatest = {
      label: `F&B Revenue (${latestMonthLabel})`, value: L(CUR.fb.sales[LATEST_IDX]), sub: `${CUR.fb.plPct[LATEST_IDX]}% net margin`, status: "green",
      definition: "F&B sales for the most recent month with data.",
      href: `/fnb?fy=${fy}`,
      ...freshness,
    };
    kpis.storeLatest = {
      label: `Store Revenue (${latestMonthLabel})`, value: L(CUR.store.sales[LATEST_IDX]),
      sub: `${(CUR.store.plPct[LATEST_IDX] as number) > 0 ? "+" : ""}${CUR.store.plPct[LATEST_IDX]}% margin`,
      status: (CUR.store.plPct[LATEST_IDX] as number) > 0 ? "green" : "amber",
      definition: "Store sales for the most recent month with data.",
      href: `/store?fy=${fy}`,
      ...freshness,
    };
  }

  const bestFbIdx = CUR.fb.plPct.length ? CUR.fb.plPct.indexOf(Math.max(...(CUR.fb.plPct as number[]))) : -1;
  const worstFbIdx = CUR.fb.plPct.length ? CUR.fb.plPct.indexOf(Math.min(...(CUR.fb.plPct as number[]))) : -1;

  const statusItems: StatusRowData[] = [
    { label: "F&B FY net margin", status: fbMargin > 0 ? "green" : "red", value: `${fbMargin.toFixed(1)}% - ${fbMargin > 0 ? "profitable" : "loss-making"}` },
    { label: "Store FY net margin", status: storeMargin > 0 ? "green" : "amber", value: `${storeMargin.toFixed(1)}%` },
  ];
  if (bestFbIdx >= 0) {
    statusItems.push({ label: "F&B best margin month", status: "green", value: `${MONTHS[bestFbIdx]} - ${CUR.fb.plPct[bestFbIdx]}%` });
  }
  if (worstFbIdx >= 0) {
    statusItems.push({ label: "F&B weakest margin month", status: "amber", value: `${MONTHS[worstFbIdx]} - ${CUR.fb.plPct[worstFbIdx]}%` });
  }
  if (prevFY && storeGrowthVsPrevYear != null) {
    statusItems.push({
      label: `Store revenue vs ${fyLabel(prevFY)}`,
      status: storeGrowthVsPrevYear >= 0 ? "green" : "amber",
      value: `${storeGrowthVsPrevYear >= 0 ? "+" : ""}${storeGrowthVsPrevYear.toFixed(0)}% YoY`,
    });
  }

  return { kpis, statusItems, monthlyData, historyData };
}
