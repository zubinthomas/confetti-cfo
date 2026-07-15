import React from "react";
import KpiCard from "./KpiCard";
import DashCard from "./DashCard";
import PLRow from "./PLRow";
import StatusRow from "./StatusRow";
import ChartTooltip from "./ChartTooltip";
import { MONTHS, L, pct, sum, maxIdx, minIdx } from "@/data/core";
import type { DeptFinancials } from "@/data/ceplData";
import type { KpiData } from "./KpiCard";
import type { PLRowData } from "./PLRow";
import type { StatusRowData } from "./StatusRow";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

// One craft department's FY view (Pottery / Batik / Stitching / Trading Items).
// `data` is a deptFinancials() export from ceplData.js.
export default function CraftDeptPage({ data, heading }: { data: DeptFinancials; heading: string }) {
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
    { label: "Revenue (FY 25-26)", value: `₹${L(fyRevenue)}` },
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
      value: fyNetPL >= 0 ? `₹${L(fyNetPL)} profit for FY 25-26` : `₹${L(Math.abs(fyNetPL))} loss for FY 25-26`,
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
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-3">
          {heading} · FY 2025-26
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
        </div>
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
        <DashCard title="FY 2025-26 P&L Breakdown">
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
    </div>
  );
}
