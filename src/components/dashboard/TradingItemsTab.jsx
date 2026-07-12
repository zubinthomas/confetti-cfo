import React from "react";
import KpiCard from "./KpiCard";
import DashCard from "./DashCard";
import PLRow from "./PLRow";
import StatusRow from "./StatusRow";
import { TRADING_ITEMS, MONTHS, L, pct } from "@/data/financialData";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const sum = (arr) => arr.reduce((a, b) => a + (b || 0), 0);

const fyRevenue = sum(TRADING_ITEMS.revenue);
const fyCogs = sum(TRADING_ITEMS.cogs);
const fyGrossProfit = fyRevenue - fyCogs;
const fyGrossMarginPct = (fyGrossProfit / fyRevenue) * 100;
const fyTotalExpenses = sum(TRADING_ITEMS.totalExpenses);
const fyNetPL = sum(TRADING_ITEMS.netPL);
const fyNetMarginPct = (fyNetPL / fyRevenue) * 100;

const profitableMonths = TRADING_ITEMS.netPL.filter((v) => v != null && v > 0).length;
const bestMonthIdx = TRADING_ITEMS.netPL.reduce(
  (best, v, i) => (v != null && (best === -1 || v > TRADING_ITEMS.netPL[best]) ? i : best), -1
);
const worstMonthIdx = TRADING_ITEMS.netPL.reduce(
  (worst, v, i) => (v != null && (worst === -1 || v < TRADING_ITEMS.netPL[worst]) ? i : worst), -1
);

const kpis = [
  { label: "Revenue (FY 25-26)", value: `₹${L(fyRevenue)}` },
  {
    label: "Gross Margin (FY)",
    value: `${fyGrossMarginPct.toFixed(1)}%`,
    sub: "Revenue − trading items purchase cost",
    status: fyGrossMarginPct >= 40 ? "green" : fyGrossMarginPct >= 20 ? "amber" : "red",
  },
  {
    label: "Net Margin (FY)",
    value: pct(fyNetMarginPct),
    sub: "After all expenses",
    status: fyNetPL >= 0 ? "green" : "red",
  },
  {
    label: "Profitable Months",
    value: `${profitableMonths}/12`,
    sub: profitableMonths >= 6 ? "Majority profitable" : "Majority loss-making",
    status: profitableMonths >= 6 ? "green" : "red",
  },
  {
    label: "Best Month",
    value: bestMonthIdx >= 0 ? MONTHS[bestMonthIdx] : "—",
    sub: bestMonthIdx >= 0 ? `₹${L(TRADING_ITEMS.netPL[bestMonthIdx])} net P&L` : "",
    status: "green",
  },
  {
    label: "Weakest Month",
    value: worstMonthIdx >= 0 ? MONTHS[worstMonthIdx] : "—",
    sub: worstMonthIdx >= 0 ? `₹${L(TRADING_ITEMS.netPL[worstMonthIdx])} net P&L` : "",
    status: "red",
  },
];

const plRows = [
  { label: "Revenue (Total Sales)", value: `₹${L(fyRevenue)}` },
  { label: "Trading items purchase cost", value: `−₹${L(fyCogs)}`, status: "red" },
  { label: "Gross profit", value: `₹${L(fyGrossProfit)} (${fyGrossMarginPct.toFixed(1)}%)`, status: "green", isTotal: true },
  { label: "HR + operating costs", value: `−₹${L(fyTotalExpenses - fyCogs)}`, status: "red" },
  { label: "Net Profit & Loss", value: `₹${L(fyNetPL)} (${fyNetMarginPct.toFixed(1)}%)`, status: fyNetPL >= 0 ? "green" : "red", isTotal: true },
];

const monthly = MONTHS.map((m, i) => ({
  month: m,
  Revenue: TRADING_ITEMS.revenue[i],
  "Net P&L": TRADING_ITEMS.netPL[i],
}));

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

const statusItems = [
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
];

export default function TradingItemsTab() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-3">
          Trading Items Division · FY 2025-26
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
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Revenue" fill="#f59e0b" radius={[4, 4, 0, 0]} />
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

      <p className="text-xs text-muted-foreground">
        Figures are computed directly from the Trading Items department's monthly financial
        records (Total Sales, Trading Items Purchase, Total Expenses, and Net Profit &amp; Loss
        as reported in the source P&amp;L workbook). No depreciation/interest breakout exists in
        the source data, so EBITDA is not shown — Net Margin (post all expenses) is used instead.
      </p>
    </div>
  );
}
