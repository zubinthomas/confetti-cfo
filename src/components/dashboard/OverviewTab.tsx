import React from "react";
import KpiCard, { type KpiData } from "./KpiCard";
import DashCard from "./DashCard";
import StatusRow, { type StatusRowData } from "./StatusRow";
import { OVERVIEW, FNB_STORE_HISTORY } from "@/data/ceplData";
import { STORE_HISTORY } from "@/data/storeData";
import { MONTHS, L } from "@/data/core";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";

const CustomTooltip = ({ active = false, payload = [], label = "" }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
      <p className="text-xs font-semibold text-foreground mb-2">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-xs text-muted-foreground">
          <span style={{ color: p.color }}>●</span> {p.name}: {L(p.value)}
        </p>
      ))}
    </div>
  );
};

// FY 2025-26 has full line-item monthly P&L; earlier years (FY21-22 … FY24-25)
// come from the workbook's Overview sheet as monthly Sales/Expense/P&L, shown
// in the multi-year history below.
const CUR = OVERVIEW.fy2526;

const monthlyData = MONTHS.map((m, i) => ({
  month: m,
  "F&B Sales":   CUR.fb.sales[i],
  "Store Sales": CUR.store.sales[i],
  "F&B P&L":     CUR.fb.pl[i],
  "Store P&L":   CUR.store.pl[i],
}));

// Multi-year F&B + Store history (annual sales & P&L, from the workbook's
// Overview sheet for FY21-22 … 24-25 and the department sheets for FY25-26)
const historyData = FNB_STORE_HISTORY.map((y) => ({
  year: y.label,
  "F&B Revenue": y.fb.sales,
  "Store Revenue": y.store.sales,
  "F&B P&L": y.fb.pl,
  "Store P&L": y.store.pl,
}));

const LATEST_IDX = CUR.fb.sales.length - 1; // last month with data (Mar 2026)
const latestMonthLabel = MONTHS[LATEST_IDX];

const fbMargin = (CUR.totals.fbPL / CUR.totals.fbSales) * 100;
const storeMargin = (CUR.totals.storePL / CUR.totals.storeSales) * 100;
const storeGrowthVsPrevYear =
  ((STORE_HISTORY.at(-2).total / STORE_HISTORY.at(-3).total) - 1) * 100; // FY25-26 vs FY24-25
const fbGrowthVsPrevYear =
  ((FNB_STORE_HISTORY.at(-1).fb.sales / FNB_STORE_HISTORY.at(-2).fb.sales) - 1) * 100;

const kpis: KpiData[] = [
  { label: "F&B Revenue (FY 25-26)", value: L(CUR.totals.fbSales), sub: `${fbMargin.toFixed(1)}% net margin`, status: "green" },
  { label: "Store Revenue (FY 25-26)", value: L(CUR.totals.storeSales), sub: `${storeGrowthVsPrevYear >= 0 ? "+" : ""}${storeGrowthVsPrevYear.toFixed(0)}% vs FY24-25`, status: "green" },
  { label: "F&B Net Profit (FY)", value: L(CUR.totals.fbPL), sub: `${fbMargin.toFixed(1)}% margin`, status: "green" },
  { label: "Store Net P&L (FY)", value: L(CUR.totals.storePL), sub: `${storeMargin.toFixed(1)}% margin`, status: CUR.totals.storePL > 0 ? "green" : "amber" },
  { label: `F&B Revenue (${latestMonthLabel})`, value: L(CUR.fb.sales[LATEST_IDX]), sub: `${CUR.fb.plPct[LATEST_IDX]}% net margin`, status: "green" },
  { label: `Store Revenue (${latestMonthLabel})`, value: L(CUR.store.sales[LATEST_IDX]), sub: `${CUR.store.plPct[LATEST_IDX] > 0 ? "+" : ""}${CUR.store.plPct[LATEST_IDX]}% margin`, status: CUR.store.plPct[LATEST_IDX] > 0 ? "green" : "amber" },
];

const bestFbIdx = CUR.fb.plPct.indexOf(Math.max(...CUR.fb.plPct));
const worstFbIdx = CUR.fb.plPct.indexOf(Math.min(...CUR.fb.plPct));

const statusItems: StatusRowData[] = [
  { label: "F&B FY net margin", status: fbMargin > 0 ? "green" : "red", value: `${fbMargin.toFixed(1)}% - ${fbMargin > 0 ? "profitable" : "loss-making"}` },
  { label: "Store FY net margin", status: storeMargin > 0 ? "green" : "amber", value: `${storeMargin.toFixed(1)}%` },
  { label: "F&B best margin month", status: "green", value: `${MONTHS[bestFbIdx]} - ${CUR.fb.plPct[bestFbIdx]}%` },
  { label: "F&B weakest margin month", status: "amber", value: `${MONTHS[worstFbIdx]} - ${CUR.fb.plPct[worstFbIdx]}%` },
  { label: "Store revenue vs FY24-25", status: storeGrowthVsPrevYear >= 0 ? "green" : "amber", value: `${storeGrowthVsPrevYear >= 0 ? "+" : ""}${storeGrowthVsPrevYear.toFixed(0)}% YoY` },
];

export default function OverviewTab() {
  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div>
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-3">
          Group Snapshot - FY 2025-26
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
        </div>
      </div>

      {/* Monthly Revenue Chart */}
      <DashCard title="Monthly Revenue - F&B vs Store (FY 2025-26)">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={monthlyData} barGap={2}>
            <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="F&B Sales"   fill="#3b82f6" radius={[4,4,0,0]} />
            <Bar dataKey="Store Sales" fill="#10b981" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </DashCard>

      {/* Monthly P&L Chart */}
      <DashCard title="Monthly Net P&L - F&B vs Store (FY 2025-26)">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={monthlyData}>
            <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#e2e8f0" strokeDasharray="3 3" />
            <Line dataKey="F&B P&L"   stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
            <Line dataKey="Store P&L" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </DashCard>

      {/* Multi-year annual history - F&B + Store revenue and P&L */}
      <DashCard title="Annual Revenue - F&B vs Store (FY 21-22 → 25-26)">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={historyData} barGap={2}>
            <XAxis dataKey="year" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="F&B Revenue" fill="#3b82f6" radius={[4,4,0,0]} />
            <Bar dataKey="Store Revenue" fill="#10b981" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-2">
          F&B revenue grew {fbGrowthVsPrevYear >= 0 ? "+" : ""}{fbGrowthVsPrevYear.toFixed(0)}% in FY 25-26 -
          its first strongly profitable year (₹{L(FNB_STORE_HISTORY.at(-1).fb.pl)} net) after
          {" "}₹{L(Math.abs(FNB_STORE_HISTORY.at(-2).fb.pl))} of losses in FY 24-25.
        </p>
      </DashCard>

      <DashCard title="Annual Net P&L - F&B vs Store (FY 21-22 → 25-26)">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={historyData} barGap={2}>
            <XAxis dataKey="year" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#e2e8f0" />
            <Bar dataKey="F&B P&L" fill="#3b82f6" radius={[4,4,0,0]} />
            <Bar dataKey="Store P&L" fill="#10b981" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </DashCard>

      {/* Status */}
      <DashCard title="Performance Health Check">
        {statusItems.map((s) => <StatusRow key={s.label} {...s} />)}
      </DashCard>
    </div>
  );
}
