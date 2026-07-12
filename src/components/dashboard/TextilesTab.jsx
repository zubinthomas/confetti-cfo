import React, { useState } from "react";
import KpiCard from "./KpiCard";
import DashCard from "./DashCard";
import PLRow from "./PLRow";
import StatusRow from "./StatusRow";
import { BATIK, STITCHING, MONTHS, L, pct } from "@/data/financialData";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const sum = (arr) => arr.reduce((a, b) => a + (b || 0), 0);

const DEPTS = {
  batik: { label: "Batik", data: BATIK },
  stitching: { label: "Stitching", data: STITCHING },
};

const CustomTooltip = ({ active = false, payload = [], label = "" }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
      <p className="text-xs font-semibold text-foreground mb-2">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-xs" style={{ color: p.color }}>
          {p.name}: ₹{L(p.value)}
        </p>
      ))}
    </div>
  );
};

function buildStats(data) {
  const fyRevenue = sum(data.revenue);
  const fyCogs = sum(data.cogs);
  const fyGrossProfit = fyRevenue - fyCogs;
  const fyGrossMarginPct = fyRevenue ? (fyGrossProfit / fyRevenue) * 100 : null;
  const fyTotalExpenses = sum(data.totalExpenses);
  const fyNetPL = sum(data.netPL);
  const fyNetMarginPct = fyRevenue ? (fyNetPL / fyRevenue) * 100 : null;
  const profitableMonths = data.netPL.filter((v) => v != null && v > 0).length;
  const validMonths = data.netPL.filter((v) => v != null).length;
  const bestMonthIdx = data.netPL.reduce(
    (best, v, i) => (v != null && (best === -1 || v > data.netPL[best]) ? i : best), -1
  );
  const worstMonthIdx = data.netPL.reduce(
    (worst, v, i) => (v != null && (worst === -1 || v < data.netPL[worst]) ? i : worst), -1
  );
  return { fyRevenue, fyCogs, fyGrossProfit, fyGrossMarginPct, fyTotalExpenses, fyNetPL, fyNetMarginPct, profitableMonths, validMonths, bestMonthIdx, worstMonthIdx };
}

function DeptView({ label, data }) {
  const s = buildStats(data);

  const kpis = [
    { label: "Revenue (FY 25-26)", value: `₹${L(s.fyRevenue)}` },
    {
      label: "Gross Margin (FY)",
      value: s.fyGrossMarginPct == null ? "—" : `${s.fyGrossMarginPct.toFixed(1)}%`,
      sub: "Revenue − raw material cost",
      status: s.fyGrossMarginPct >= 40 ? "green" : s.fyGrossMarginPct >= 20 ? "amber" : "red",
    },
    {
      label: "Net Margin (FY)",
      value: pct(s.fyNetMarginPct),
      sub: "After all expenses",
      status: s.fyNetPL >= 0 ? "green" : "red",
    },
    {
      label: "Profitable Months",
      value: `${s.profitableMonths}/${s.validMonths}`,
      sub: s.profitableMonths >= s.validMonths / 2 ? "Majority profitable" : "Majority loss-making",
      status: s.profitableMonths >= s.validMonths / 2 ? "green" : "red",
    },
    {
      label: "Best Month",
      value: s.bestMonthIdx >= 0 ? MONTHS[s.bestMonthIdx] : "—",
      sub: s.bestMonthIdx >= 0 ? `₹${L(data.netPL[s.bestMonthIdx])} net P&L` : "",
      status: "green",
    },
    {
      label: "Weakest Month",
      value: s.worstMonthIdx >= 0 ? MONTHS[s.worstMonthIdx] : "—",
      sub: s.worstMonthIdx >= 0 ? `₹${L(data.netPL[s.worstMonthIdx])} net P&L` : "",
      status: "red",
    },
  ];

  const plRows = [
    { label: "Revenue (Total Sales)", value: `₹${L(s.fyRevenue)}` },
    { label: "Raw material cost", value: `−₹${L(s.fyCogs)}`, status: "red" },
    { label: "Gross profit", value: `₹${L(s.fyGrossProfit)} (${s.fyGrossMarginPct?.toFixed(1)}%)`, status: "green", isTotal: true },
    { label: "HR + operating costs", value: `−₹${L(s.fyTotalExpenses - s.fyCogs)}`, status: "red" },
    { label: "Net Profit & Loss", value: `₹${L(s.fyNetPL)} (${s.fyNetMarginPct?.toFixed(1)}%)`, status: s.fyNetPL >= 0 ? "green" : "red", isTotal: true },
  ];

  const monthly = MONTHS.map((m, i) => ({
    month: m,
    Revenue: data.revenue[i],
    "Net P&L": data.netPL[i],
  }));

  const statusItems = [
    {
      label: "FY net position",
      status: s.fyNetPL >= 0 ? "green" : "red",
      value: s.fyNetPL >= 0 ? `₹${L(s.fyNetPL)} profit for FY 25-26` : `₹${L(Math.abs(s.fyNetPL))} loss for FY 25-26`,
    },
    {
      label: "Loss-making months",
      status: s.profitableMonths < s.validMonths / 2 ? "red" : "amber",
      value: `${s.validMonths - s.profitableMonths} of ${s.validMonths} months in the red`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
      </div>

      <DashCard title={`${label} — Monthly Revenue vs Net P&L`}>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={monthly}>
            <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Line type="monotone" dataKey="Net P&L" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </DashCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashCard title="FY 2025-26 P&L Breakdown">
          {plRows.map((r) => <PLRow key={r.label} {...r} />)}
        </DashCard>
        <DashCard title="Performance Flags">
          {statusItems.map((a) => <StatusRow key={a.label} {...a} />)}
        </DashCard>
      </div>
    </div>
  );
}

export default function TextilesTab() {
  const [dept, setDept] = useState("batik");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-3">
          Textiles & Lifestyle Division · FY 2025-26
        </p>
        <div className="flex gap-1.5 flex-wrap">
          {Object.entries(DEPTS).map(([key, { label }]) => (
            <button
              key={key}
              onClick={() => setDept(key)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                dept === key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <DeptView label={DEPTS[dept].label} data={DEPTS[dept].data} />

      <p className="text-xs text-muted-foreground">
        Figures are computed directly from each department's monthly financial records
        (Total Sales, Raw Materials Purchase, Total Expenses, and Net Profit &amp; Loss as
        reported in the source P&amp;L workbook). No depreciation/interest breakout exists in
        the source data, so EBITDA is not shown — Net Margin (post all expenses) is used instead.
      </p>
    </div>
  );
}
