import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList } from "lucide-react";
import KpiCard from "./KpiCard";
import DashCard from "./DashCard";
import PLRow from "./PLRow";
import StatusRow from "./StatusRow";
import ExportButtons from "./ExportButtons";
import ChartTooltip from "./ChartTooltip";
import PageSpinner from "./PageSpinner";
import TrackerImportBadge from "./TrackerImportBadge";
import { MONTHS, L, pct, sum, maxIdx, minIdx, fyLabel, fyDateRange, monthPeriodIds, buildFrIndex } from "@/data/seriesKernel";
import { computeDeptFinancials, deptFinancialsExportSheets, resolveDeptBu, resolveDeptLi, DEPT_BU_NAMES, type DeptKey, type DeptFinancials } from "@/data/deptFinancials";
import { computeTheoreticalCogs, computeCogsVariance, type CogsVarianceResult } from "@/data/cogsVariance";
import { listTransactionsForBusinessUnit } from "@/api/inventoryApi";
import { useReferenceData } from "@/hooks/useReferenceData";
import { useOverviewFiscalYears } from "@/hooks/useOverviewFiscalYears";
import { useFyParam } from "@/hooks/useFyParam";
import { useFinancialRecords } from "@/hooks/useFinancialRecords";
import { useImportFreshness } from "@/hooks/useImportFreshness";
import type { KpiData } from "./KpiCard";
import type { PLRowData } from "./PLRow";
import type { StatusRowData } from "./StatusRow";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

// One craft department's page (Pottery / Batik / Stitching / Trading Items).
export default function CraftDeptPage({ deptKey, heading }: { deptKey: DeptKey; heading: string }) {
  const { data: ref } = useReferenceData();
  const fys = useOverviewFiscalYears();
  const [fy, setFy] = useFyParam(fys);

  const deptBu = ref ? resolveDeptBu(ref.businessUnits) : null;
  const { data: records } = useFinancialRecords({
    businessUnitId: fy && deptBu ? [deptBu[deptKey]] : undefined,
    fiscalYear: fy ? [fy] : undefined,
  });

  const data = useMemo(() => {
    if (!ref || !records || !fy || !deptBu) return null;
    const idx = buildFrIndex(records);
    const deptLi = resolveDeptLi(ref.lineItems);
    return computeDeptFinancials(idx, deptBu[deptKey], deptLi, deptKey, monthPeriodIds(ref.periods, fy));
  }, [ref, records, fy, deptKey, deptBu]);

  const freshness = useImportFreshness(["cepl"]);

  if (!ref || !fys || !fy || !data) return <PageSpinner />;

  const label = fyLabel(fy);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            {heading} · {label}
          </p>
          <TrackerImportBadge freshness={freshness} />
          {deptKey === "pottery" && (
            <Link
              to={`/ops/production?fy=${fy}`}
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <ClipboardList className="w-3.5 h-3.5" />
              Daily production log
            </Link>
          )}
          {data.hasMonthlyDetail && (
            <ExportButtons filenameBase={`${deptKey}-${fy}`} sheets={deptFinancialsExportSheets(data)} />
          )}
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

      {data.hasMonthlyDetail ? (
        <DeptDetail data={data} label={label} deptKey={deptKey} fy={fy} />
      ) : (
        <DashCard title={`Monthly detail - ${label}`}>
          <p className="text-sm text-muted-foreground">
            {heading} has no data at all for {label} - unlike F&B/Store, the craft departments have
            no Overview-sheet annual fallback either, so there&rsquo;s nothing to show until a full
            CEPL P&L workbook with this department&rsquo;s monthly data is imported for this year.
            Once it is, this page will populate automatically.
          </p>
        </DashCard>
      )}
    </div>
  );
}

function DeptDetail({ data, label, deptKey, fy }: { data: DeptFinancials; label: string; deptKey: DeptKey; fy: string }) {
  const fyRevenue = sum(data.revenue);
  const fyCogs = sum(data.cogs);
  const fyGrossProfit = fyRevenue - fyCogs;
  const fyGrossMarginPct = fyRevenue ? (fyGrossProfit / fyRevenue) * 100 : 0;
  const fyTotalExpenses = sum(data.totalExpenses);
  const fyNetPL = sum(data.netPL);
  const fyNetMarginPct = fyRevenue ? (fyNetPL / fyRevenue) * 100 : 0;

  const bestMonthIdx = maxIdx(data.netPL);
  const worstMonthIdx = minIdx(data.netPL);
  const profitableMonths = data.netPL.filter((v) => v != null && v > 0).length;

  const freshness = useImportFreshness(["cepl"]);

  // Theoretical COGS from the inventory ledger's "out" transactions for
  // items tagged with this department, compared against the P&L's actual
  // reported COGS (fyCogs, above) - see src/data/cogsVariance.ts.
  const [variance, setVariance] = useState<CogsVarianceResult | null>(null);
  useEffect(() => {
    setVariance(null);
    const [from, to] = fyDateRange(fy);
    listTransactionsForBusinessUnit(DEPT_BU_NAMES[deptKey], from, to)
      .then((txns) => setVariance(computeCogsVariance(computeTheoreticalCogs(txns), fyCogs)))
      .catch(() => setVariance(null));
  }, [deptKey, fy, fyCogs]);

  const kpis: KpiData[] = [
    {
      label: `Revenue (${label})`, value: `₹${L(fyRevenue)}`,
      definition: "Total department sales for the fiscal year.",
      ...freshness,
    },
    {
      label: "Gross Margin (FY)",
      value: `${fyGrossMarginPct.toFixed(1)}%`,
      sub: "Revenue − raw material/purchase cost",
      status: fyGrossMarginPct >= 40 ? "green" : fyGrossMarginPct >= 20 ? "amber" : "red",
      definition: "Gross profit (revenue minus raw material/purchase cost) as a percentage of revenue.",
      ...freshness,
    },
    {
      label: "Net Margin (FY)",
      value: pct(fyNetMarginPct),
      sub: "After all expenses",
      status: fyNetMarginPct >= 0 ? "green" : "red",
      definition: "Net profit as a percentage of revenue, after HR and operating costs.",
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
    {
      label: "COGS Variance (Theoretical)",
      value: variance?.variancePct != null ? `${variance.variancePct > 0 ? "+" : ""}${variance.variancePct.toFixed(1)}%` : "-",
      sub: variance?.theoretical != null
        ? `₹${L(variance.theoretical)} theoretical vs ₹${L(fyCogs)} actual`
        : "No items tagged to this department yet",
      status: variance?.variancePct == null ? "grey" : Math.abs(variance.variancePct) <= 10 ? "green" : Math.abs(variance.variancePct) <= 25 ? "amber" : "red",
      definition: "Actual reported COGS vs. the inventory ledger's own quantity × cost for \"out\" transactions on items tagged to this department. Includes any waste recorded as a plain stock-out, since the ledger has no separate waste/spoilage category - a wide variance can mean waste, miscosted items, or items not yet tagged with a financial department.",
    },
  ];

  const plRows: PLRowData[] = [
    { label: "Revenue (Total Sales)", value: `₹${L(fyRevenue)}` },
    { label: "Raw material / purchase cost", value: `−₹${L(fyCogs)}`, status: "red" },
    { label: "Gross profit", value: `₹${L(fyGrossProfit)} (${fyGrossMarginPct.toFixed(1)}%)`, status: "green", isTotal: true },
    { label: "HR + operating costs", value: `−₹${L(fyTotalExpenses - fyCogs)}`, status: "red" },
    { label: "Net Profit & Loss", value: `₹${L(fyNetPL)} (${fyNetMarginPct.toFixed(1)}%)`, status: fyNetPL >= 0 ? "green" : "red", isTotal: true },
  ];

  const monthly = MONTHS.map((m, i) => ({
    month: m,
    Revenue: data.revenue[i],
    "Net P&L": data.netPL[i],
  }));

  const grossRange = data.grossMarginPct.filter((v) => v != null);
  const alerts: StatusRowData[] = [
    {
      label: "FY net position",
      status: fyNetPL >= 0 ? "green" : "red",
      value: fyNetPL >= 0 ? `₹${L(fyNetPL)} profit for ${label}` : `₹${L(Math.abs(fyNetPL))} loss for ${label}`,
    },
    {
      label: "Loss-making months",
      status: profitableMonths < 6 ? "red" : "amber",
      value: `${12 - profitableMonths} of 12 months in the red`,
    },
    {
      label: "Gross margin volatility",
      status: "amber",
      value: grossRange.length
        ? `${Math.min(...grossRange).toFixed(0)}%–${Math.max(...grossRange).toFixed(0)}% range across months`
        : "-",
    },
  ];

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashCard title={`${label} P&L Breakdown`}>
          {plRows.map((r) => <PLRow key={r.label} {...r} />)}
        </DashCard>

        <DashCard title="Margin Alerts">
          {alerts.map((a) => <StatusRow key={a.label} {...a} />)}
        </DashCard>
      </div>

      <p className="text-xs text-muted-foreground">
        Figures are computed directly from the department&rsquo;s monthly financial records
        (Total Sales, Raw Materials/Trading Items Purchase, Total Expenses, and Net Profit &amp; Loss
        as reported in the source P&amp;L workbook). No depreciation/interest breakout exists in the
        source data, so EBITDA is not shown - Net Margin (post all expenses) is used instead.
      </p>
    </>
  );
}
