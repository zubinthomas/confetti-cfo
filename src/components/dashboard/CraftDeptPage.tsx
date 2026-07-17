import React, { useMemo, useState } from "react";
import KpiCard from "./KpiCard";
import DashCard from "./DashCard";
import PLRow from "./PLRow";
import StatusRow from "./StatusRow";
import ChartTooltip from "./ChartTooltip";
import PageSpinner from "./PageSpinner";
import { MONTHS, L, pct, sum, maxIdx, minIdx, fyLabel, monthPeriodIds, buildFrIndex } from "@/data/seriesKernel";
import { computeDeptFinancials, DEPT_BU, type DeptKey, type DeptFinancials } from "@/data/deptFinancials";
import { useReferenceData } from "@/hooks/useReferenceData";
import { useOverviewFiscalYears } from "@/hooks/useOverviewFiscalYears";
import { useFinancialRecords } from "@/hooks/useFinancialRecords";
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
  const [selectedFy, setSelectedFy] = useState<string | null>(null);
  const fy = selectedFy ?? fys?.at(-1);

  const { data: records } = useFinancialRecords({
    businessUnitId: fy ? [DEPT_BU[deptKey]] : undefined,
    fiscalYear: fy ? [fy] : undefined,
  });

  const data = useMemo(() => {
    if (!ref || !records || !fy) return null;
    const idx = buildFrIndex(records);
    return computeDeptFinancials(idx, deptKey, monthPeriodIds(ref.periods, fy));
  }, [ref, records, fy, deptKey]);

  if (!ref || !fys || !fy || !data) return <PageSpinner />;

  const label = fyLabel(fy);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          {heading} · {label}
        </p>
        <div className="flex gap-1.5">
          {fys.map((y) => (
            <button
              key={y}
              onClick={() => setSelectedFy(y)}
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
        <DeptDetail data={data} label={label} />
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

function DeptDetail({ data, label }: { data: DeptFinancials; label: string }) {
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

  const kpis: KpiData[] = [
    { label: `Revenue (${label})`, value: `₹${L(fyRevenue)}` },
    {
      label: "Gross Margin (FY)",
      value: `${fyGrossMarginPct.toFixed(1)}%`,
      sub: "Revenue − raw material/purchase cost",
      status: fyGrossMarginPct >= 40 ? "green" : fyGrossMarginPct >= 20 ? "amber" : "red",
    },
    {
      label: "Net Margin (FY)",
      value: pct(fyNetMarginPct),
      sub: "After all expenses",
      status: fyNetMarginPct >= 0 ? "green" : "red",
    },
    {
      label: "Profitable Months",
      value: `${profitableMonths}/12`,
      sub: profitableMonths >= 6 ? "Majority profitable" : "Majority loss-making",
      status: profitableMonths >= 6 ? "green" : "red",
    },
    {
      label: "Best Month",
      value: bestMonthIdx >= 0 ? MONTHS[bestMonthIdx] : "-",
      sub: bestMonthIdx >= 0 ? `₹${L(data.netPL[bestMonthIdx])} net P&L` : "",
      status: "green",
    },
    {
      label: "Weakest Month",
      value: worstMonthIdx >= 0 ? MONTHS[worstMonthIdx] : "-",
      sub: worstMonthIdx >= 0 ? `₹${L(data.netPL[worstMonthIdx])} net P&L` : "",
      status: "red",
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
