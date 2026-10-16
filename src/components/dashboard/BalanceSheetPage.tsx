import React, { useMemo } from "react";
import KpiCard from "./KpiCard";
import DashCard from "./DashCard";
import PLRow from "./PLRow";
import ExportButtons from "./ExportButtons";
import PageSpinner from "./PageSpinner";
import ReconciledBadge from "./ReconciledBadge";
import { L, buildFrIndex } from "@/data/seriesKernel";
import {
  allAsOfPeriods, balanceSheetExportSheets, computeBalanceSheet, latestAsOfPeriod, resolveBsBu, resolveBsLi,
  type BalanceSheet, type BsLineTrendPoint,
} from "@/data/balanceSheet";
import { useReferenceData } from "@/hooks/useReferenceData";
import { useFinancialRecords } from "@/hooks/useFinancialRecords";
import { useImportFreshness, downgradeIfStale } from "@/hooks/useImportFreshness";
import type { KpiData } from "./KpiCard";
import type { PLRowData } from "./PLRow";

// Company Balance Sheet, sourced from the Tally agent's "Balance Sheet"
// business unit push - a point-in-time snapshot ("As of <date>"), not a
// monthly series, so this page has no fiscal-year chips or chart.
export default function BalanceSheetPage() {
  const { data: ref } = useReferenceData();
  const bsBu = ref ? resolveBsBu(ref.businessUnits) : -1;

  const { data: records } = useFinancialRecords({
    businessUnitId: bsBu >= 0 ? [bsBu] : undefined,
    periodType: bsBu >= 0 ? ["custom"] : undefined,
  });

  // undefined = still loading reference data or (once the unit is confirmed
  // to exist) its records; null = resolved, definitively nothing to show.
  const asOf = useMemo(() => {
    if (!ref) return undefined;
    if (bsBu < 0) return null;
    if (!records) return undefined;
    return latestAsOfPeriod(ref.periods, bsBu, records);
  }, [ref, records, bsBu]);

  const asOfPeriods = useMemo(() => {
    if (!ref || !records || bsBu < 0) return [];
    return allAsOfPeriods(ref.periods, bsBu, records);
  }, [ref, records, bsBu]);

  const data = useMemo(() => {
    if (!ref || !records || !asOf || bsBu < 0) return null;
    const idx = buildFrIndex(records);
    const li = resolveBsLi(ref.lineItems);
    return computeBalanceSheet(idx, bsBu, li, asOf.id, asOfPeriods);
  }, [ref, records, asOf, bsBu, asOfPeriods]);

  if (!ref || asOf === undefined) return <PageSpinner />;

  if (!asOf || !data) {
    return (
      <DashCard title="Balance Sheet">
        <p className="text-sm text-muted-foreground">
          No Balance Sheet snapshot has been pushed yet. This page populates automatically once
          the Tally agent syncs the "Balance Sheet" business unit.
        </p>
      </DashCard>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Balance Sheet · As of {asOf.endDate}
        </p>
        <ReconciledBadge period={asOf} showAction />
        <ExportButtons filenameBase={`balance-sheet-as-of-${asOf.endDate}`} sheets={balanceSheetExportSheets(data)} />
      </div>
      <BsDetail data={data} />
    </div>
  );
}

function BsDetail({ data }: { data: BalanceSheet }) {
  const imbalanceAbs = Math.abs(data.imbalance);
  const nearZero = imbalanceAbs < Math.max(1, data.totalAssets * 0.001);

  const freshness = useImportFreshness(["tally"]);

  const rawKpis: KpiData[] = [
    {
      label: "Total Assets",
      value: `₹${L(data.totalAssets)}`,
      definition: "Everything the company owns - cash, receivables, inventory, fixed assets - as of this balance sheet date.",
      ...freshness,
    },
    {
      label: "Total Liabilities & Equity",
      value: `₹${L(data.totalLiabilityEquity)}`,
      definition: "Everything the company owes plus owner's equity, as of this balance sheet date. Should equal Total Assets.",
      ...freshness,
    },
    {
      label: "Balance Check",
      value: `₹${L(data.imbalance)}`,
      sub: nearZero
        ? "Assets match Liabilities & Equity"
        : "Known gap - see note below",
      status: nearZero ? "green" : "amber",
      definition: "The difference between Total Assets and Total Liabilities & Equity. Should be zero or near-zero; see the note below for why it isn't always.",
      ...freshness,
    },
  ];
  const kpis: KpiData[] = rawKpis.map((k) => ({ ...k, status: downgradeIfStale(k.status, freshness) }));

  const formatTrend = (trend: BsLineTrendPoint[]) => {
    if (trend.length < 2) return [];
    return trend.map((pt, i) => {
      const prev = i > 0 ? trend[i - 1].value : null;
      const delta = pt.value != null && prev != null ? pt.value - prev : null;
      const deltaStr = delta == null ? "" : delta === 0 ? " (no change)" : ` (${delta > 0 ? "+" : ""}₹${L(delta)})`;
      return { label: pt.endDate, value: `₹${L(pt.value ?? 0)}${deltaStr}` };
    });
  };

  const assetRows: PLRowData[] = [
    ...data.lines.assets.map((r) => ({ label: r.name, value: `₹${L(r.value ?? 0)}`, details: formatTrend(r.trend) })),
    { label: "Total Assets", value: `₹${L(data.totalAssets)}`, isTotal: true },
  ];
  const liabilityRows: PLRowData[] = [
    ...data.lines.liabilityEquity.map((r) => ({ label: r.name, value: `₹${L(r.value ?? 0)}`, details: formatTrend(r.trend) })),
    { label: "Total Liabilities & Equity", value: `₹${L(data.totalLiabilityEquity)}`, isTotal: true },
  ];

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashCard title="Assets">
          {assetRows.map((r) => <PLRow key={r.label} {...r} />)}
        </DashCard>
        <DashCard title="Liabilities & Equity">
          {liabilityRows.map((r) => <PLRow key={r.label} {...r} />)}
        </DashCard>
      </div>

      {data.lines.unclassified.length > 0 && (
        <DashCard title="Unclassified - needs review">
          {data.lines.unclassified.map((r) => (
            <PLRow key={r.name} label={r.name} value={`₹${L(r.value ?? 0)}`} details={formatTrend(r.trend)} />
          ))}
          <p className="text-xs text-muted-foreground mt-3">
            These line items don&rsquo;t have a confirmed Asset / Liability &amp; Equity
            classification yet, so they&rsquo;re excluded from both totals above rather than
            guessed. They can be classified in src/data/balanceSheet.ts once reviewed.
          </p>
        </DashCard>
      )}

      <p className="text-xs text-muted-foreground">
        Figures come directly from the Tally agent&rsquo;s Balance Sheet push for this date.
        Amounts are shown as positive magnitudes on both sides; a non-zero Balance Check mostly
        reflects line items in the Unclassified bucket above (excluded from both totals) plus a
        known, previously documented reconciliation gap in Current Assets traced to Sundry
        Debtors/Advance sub-ledgers with no parseable closing balance in Tally - not a dashboard
        calculation error.
      </p>
    </>
  );
}
