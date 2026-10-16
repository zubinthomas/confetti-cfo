import React, { useMemo } from "react";
import KpiCard from "./KpiCard";
import DashCard from "./DashCard";
import PLRow from "./PLRow";
import ExportButtons from "./ExportButtons";
import ChartTooltip from "./ChartTooltip";
import PageSpinner from "./PageSpinner";
import { MONTHS, L, pct, sum, maxIdx, minIdx, fyLabel, monthPeriodIds, buildFrIndex } from "@/data/seriesKernel";
import { computeCompanyPL, companyPLExportSheets, resolveCplBu, resolveCplLi, type CompanyPL, type LineItemTotal } from "@/data/companyPL";
import { useFyParam } from "@/hooks/useFyParam";
import { useReferenceData } from "@/hooks/useReferenceData";
import { useFinancialRecords } from "@/hooks/useFinancialRecords";
import { useImportFreshness } from "@/hooks/useImportFreshness";
import type { KpiData } from "./KpiCard";
import type { PLRowData } from "./PLRow";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

// Company-wide Profit & Loss, sourced from the Tally agent's "Profit & Loss"
// business unit push (51 raw ledger-group line items, summed here by
// category - see src/data/companyPL.ts for why this can't reuse the craft
// departments' named-total lookup).
export default function ProfitLossPage() {
  const { data: ref } = useReferenceData();
  const cplBu = ref ? resolveCplBu(ref.businessUnits) : -1;

  // Fetch every month record for this unit up front (unfiltered by fiscal
  // year) so the fiscal-year chip list can be derived from what actually has
  // data, rather than borrowing F&B/Store's own fiscal-year hook. Only fires
  // once the unit is actually found - if it doesn't exist yet (e.g. not
  // seeded in this environment), there's nothing to fetch.
  const { data: records } = useFinancialRecords({
    businessUnitId: cplBu >= 0 ? [cplBu] : undefined,
    periodType: cplBu >= 0 ? ["month"] : undefined,
  });

  // undefined = still loading reference data or (once the unit is confirmed
  // to exist) its records; [] = resolved, definitively nothing to show.
  const fys = useMemo(() => {
    if (!ref) return undefined;
    if (cplBu < 0) return [];
    if (!records) return undefined;
    const periodById = new Map(ref.periods.map((p) => [p.id, p]));
    const set = new Set<string>();
    for (const r of records) {
      const period = periodById.get(r.periodId);
      if (period?.periodType === "month") set.add(period.fiscalYear);
    }
    return [...set].sort();
  }, [ref, records, cplBu]);

  const [fy, setFy] = useFyParam(fys);

  const data = useMemo(() => {
    if (!ref || !records || !fy || cplBu < 0) return null;
    const idx = buildFrIndex(records);
    const li = resolveCplLi(ref.lineItems);
    return computeCompanyPL(idx, cplBu, li, monthPeriodIds(ref.periods, fy));
  }, [ref, records, fy, cplBu]);

  if (!ref || fys === undefined) return <PageSpinner />;

  if (fys.length === 0) {
    return (
      <DashCard title="Profit & Loss">
        <p className="text-sm text-muted-foreground">
          No company-wide Profit &amp; Loss data has been pushed yet. This page populates
          automatically once the Tally agent syncs the "Profit &amp; Loss" business unit.
        </p>
      </DashCard>
    );
  }

  if (!fy || !data) return <PageSpinner />;

  const label = fyLabel(fy);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Company Profit &amp; Loss · {label}
          </p>
          <ExportButtons filenameBase={`profit-loss-${fy}`} sheets={companyPLExportSheets(data)} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {fys.map((y) => (
            <button
              key={y}
              onClick={() => setFy(y)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                y === fy
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {fyLabel(y)}
            </button>
          ))}
        </div>
      </div>

      <PLDetail data={data} label={label} />
    </div>
  );
}

function PLDetail({ data, label }: { data: CompanyPL; label: string }) {
  const fyRevenue = sum(data.revenue);
  const fyCogs = sum(data.cogs);
  const fyGrossProfit = fyRevenue + fyCogs;
  const fyGrossMarginPct = fyRevenue ? (fyGrossProfit / fyRevenue) * 100 : 0;
  const fyHrCost = sum(data.hrCost);
  const fyOperatingCost = sum(data.operatingCost);
  const fyOther = sum(data.other);
  const fyNetPL = sum(data.netPL);
  const fyNetMarginPct = fyRevenue ? (fyNetPL / fyRevenue) * 100 : 0;
  // hrCost is already negative here (Tally sign convention - see companyPL.ts),
  // so this needs Math.abs to read as a plain positive percentage.
  const fyPeopleCostPct = fyRevenue ? (Math.abs(fyHrCost) / fyRevenue) * 100 : 0;

  const bestMonthIdx = maxIdx(data.netPL);
  const worstMonthIdx = minIdx(data.netPL);
  const profitableMonths = data.netPL.filter((v) => v != null && v > 0).length;

  const freshness = useImportFreshness(["tally"]);

  const kpis: KpiData[] = [
    {
      label: `Revenue (${label})`,
      value: `₹${L(fyRevenue)}`,
      definition: "Total company revenue for the fiscal year, summed from the Tally P&L's revenue line items.",
      ...freshness,
    },
    {
      label: "Gross Margin (FY)",
      value: `${fyGrossMarginPct.toFixed(1)}%`,
      sub: "Revenue − direct/COGS expenses",
      status: fyGrossMarginPct >= 40 ? "green" : fyGrossMarginPct >= 20 ? "amber" : "red",
      definition: "Gross profit (revenue minus direct/COGS expenses) as a percentage of revenue.",
      ...freshness,
    },
    {
      label: "Net Margin (FY)",
      value: pct(fyNetMarginPct),
      sub: "After all expenses",
      status: fyNetMarginPct >= 0 ? "green" : "red",
      definition: "Net profit as a percentage of revenue, after all operating, HR, and other costs.",
      ...freshness,
    },
    {
      label: "People Cost (% of Revenue)",
      value: `${fyPeopleCostPct.toFixed(1)}%`,
      sub: "HR/payroll cost as % of company revenue",
      status: fyPeopleCostPct < 30 ? "green" : fyPeopleCostPct <= 40 ? "amber" : "red",
      definition: "Total company HR/payroll cost as a percentage of total company revenue for the fiscal year.",
      ...freshness,
    },
    {
      label: "Profitable Months",
      value: `${profitableMonths}/12`,
      sub: profitableMonths >= 6 ? "Majority profitable" : "Majority loss-making",
      status: profitableMonths >= 6 ? "green" : "red",
      definition: "How many of the fiscal year's 12 months had a positive net P&L.",
      ...freshness,
    },
    {
      label: "Best Month",
      value: bestMonthIdx >= 0 ? MONTHS[bestMonthIdx] : "-",
      sub: bestMonthIdx >= 0 ? `₹${L(data.netPL[bestMonthIdx])} net P&L` : "",
      status: "green",
      definition: "The month with the highest net P&L for the fiscal year.",
      ...freshness,
    },
    {
      label: "Weakest Month",
      value: worstMonthIdx >= 0 ? MONTHS[worstMonthIdx] : "-",
      sub: worstMonthIdx >= 0 ? `₹${L(data.netPL[worstMonthIdx])} net P&L` : "",
      status: "red",
      definition: "The month with the lowest net P&L for the fiscal year.",
      ...freshness,
    },
  ];

  const formatDetail = (items: LineItemTotal[]) =>
    items.map((it) => ({ label: it.name, value: `₹${L(it.total)}` }));

  const plRows: PLRowData[] = [
    { label: "Revenue", value: `₹${L(fyRevenue)}`, details: formatDetail(data.lineItemBreakdown.revenue) },
    { label: "Direct / COGS expenses", value: `₹${L(fyCogs)}`, status: "red", details: formatDetail(data.lineItemBreakdown.cogs) },
    { label: "Gross profit", value: `₹${L(fyGrossProfit)} (${fyGrossMarginPct.toFixed(1)}%)`, status: "green", isTotal: true },
    { label: "HR / payroll costs", value: `₹${L(fyHrCost)}`, status: "red", details: formatDetail(data.lineItemBreakdown.hrCost) },
    { label: "Operating costs", value: `₹${L(fyOperatingCost)}`, status: "red", details: formatDetail(data.lineItemBreakdown.operatingCost) },
    { label: "Other income", value: `₹${L(fyOther)}`, status: fyOther >= 0 ? "green" : "red", details: formatDetail(data.lineItemBreakdown.other) },
    { label: "Net Profit & Loss", value: `₹${L(fyNetPL)} (${fyNetMarginPct.toFixed(1)}%)`, status: fyNetPL >= 0 ? "green" : "red", isTotal: true },
  ];

  const monthly = MONTHS.map((m, i) => ({
    month: m,
    Revenue: data.revenue[i],
    "Net P&L": data.netPL[i],
  }));

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
      </div>

      <DashCard title="Monthly Revenue vs Net P&L">
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={monthly}>
            <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Line type="monotone" dataKey="Net P&L" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </DashCard>

      <DashCard title={`${label} P&L Breakdown`}>
        {plRows.map((r) => <PLRow key={r.label} {...r} />)}
      </DashCard>

      <p className="text-xs text-muted-foreground">
        Figures are summed from the 51 raw ledger-group line items the Tally agent pushes for the
        company-wide Profit &amp; Loss unit, grouped by category (revenue, direct/COGS, HR, operating,
        other income) - there is no pre-computed "Total Sales"/"Net Profit" row in the source data.
      </p>
    </>
  );
}
