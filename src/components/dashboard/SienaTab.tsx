import React, { useState } from "react";
import KpiCard, { type KpiData } from "./KpiCard";
import DashCard from "./DashCard";
import StatusRow, { type StatusRowData } from "./StatusRow";
import { FAB } from "@/data/ceplData";
import { MONTHS, L } from "@/data/core";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";

const COLORS = { product: "#3b82f6", retail: "#10b981", events: "#f59e0b", pl: "#8b5cf6" };

const CustomTooltip = ({ active = false, payload = [], label = "" }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
      <p className="text-xs font-semibold text-foreground mb-2">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-xs" style={{ color: p.color }}>
          {p.name}: {typeof p.value === "number" && p.name.includes("%") ? `${p.value.toFixed(1)}%` : L(p.value)}
        </p>
      ))}
    </div>
  );
};

// Build monthly data
const revenueData = MONTHS.map((m, i) => ({
  month: m,
  "Product Sales":    FAB.productSales[i],
  "Retail & Bar":     FAB.retailBarSales[i],
  "Events/Catering":  FAB.eventCatering[i],
}));

const marginData = MONTHS.map((m, i) => ({
  month: m,
  "COGS %":      FAB.cogsPct[i],
  "HR %":        FAB.hrPct[i],
  "Net Margin %": FAB.plPct[i],
}));

const plData = MONTHS.map((m, i) => ({
  month: m,
  "Net P&L":    FAB.profitLoss[i],
  "Revenue":    FAB.totalRevenue[i],
}));

const costData = MONTHS.map((m, i) => ({
  month: m,
  "Raw Material": FAB.rawMaterial[i],
  "HR Cost":      FAB.hrCost[i],
  "Delivery Comm":FAB.deliveryComm[i],
  "Site Cost":    FAB.siteCost[i],
  "Marketing":    FAB.marketingCost[i],
}));

// Full-year totals
const fyTotal    = FAB.totalRevenue.reduce((a,b)=>a+b,0);
const fyPL       = FAB.profitLoss.reduce((a,b)=>a+b,0);
const fyHR       = FAB.hrCost.reduce((a,b)=>a+b,0);
const fyCOGS     = FAB.rawMaterial.reduce((a,b)=>a+b,0);
const fyDelivery = FAB.deliveryComm.reduce((a,b)=>a+b,0);
const bestMonth  = MONTHS[FAB.plPct.indexOf(Math.max(...FAB.plPct))];
const worstMonth = MONTHS[FAB.plPct.indexOf(Math.min(...FAB.plPct))];

const kpis: KpiData[] = [
  { label: "Annual F&B Revenue", value: L(fyTotal), sub: "FY 2025-26", status: "green" },
  { label: "Annual Net Profit", value: L(fyPL), sub: `${((fyPL/fyTotal)*100).toFixed(1)}% margin`, status: "green" },
  { label: "Avg Monthly Revenue", value: L(Math.round(fyTotal/12)), sub: "Per month", status: "green" },
  { label: "Annual HR Cost", value: L(fyHR), sub: `${((fyHR/fyTotal)*100).toFixed(1)}% of revenue`, status: "amber" },
  { label: "Annual COGS", value: L(fyCOGS), sub: `${((fyCOGS/fyTotal)*100).toFixed(1)}% COGS ratio`, status: "green" },
  { label: "Delivery Commissions", value: L(fyDelivery), sub: `${((fyDelivery/fyTotal)*100).toFixed(1)}% of revenue`, status: "amber" },
];

const statusItems: StatusRowData[] = [
  { label: "Best margin month", status: "green", value: `${bestMonth} — ${Math.max(...FAB.plPct)}%` },
  { label: "Weakest margin month", status: "amber", value: `${worstMonth} — ${Math.min(...FAB.plPct)}%` },
  { label: "COGS trend", status: "green", value: "Avg 31.2% — within 35% target" },
  { label: "HR cost (peak)", status: "red", value: "44.9% in Jun — improving to 21.5% by Jan" },
  { label: "Events revenue", status: "green", value: `${L(FAB.eventCatering.reduce((a,b)=>a+b,0))} annual — strong Q3/Q4` },
  { label: "Seasonality", status: "amber", value: "Dec–Jan peak (Durga Puja + year-end). Apr–Jul slow." },
];

export default function SienaTab() {
  const [view, setView] = useState("revenue");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-3">
          Siena F&B — Monthly P&L · FY 2025-26
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
        </div>
      </div>

      {/* View switcher */}
      <div className="flex gap-1.5 flex-wrap">
        {[
          { key: "revenue", label: "Revenue Mix" },
          { key: "margins", label: "Margin Trends" },
          { key: "pl",      label: "Net P&L" },
          { key: "costs",   label: "Cost Breakdown" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              view === key
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "revenue" && (
        <DashCard title="Monthly Revenue by Stream">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={revenueData}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area dataKey="Product Sales"   stackId="1" stroke={COLORS.product} fill={COLORS.product} fillOpacity={0.8} />
              <Area dataKey="Retail & Bar"    stackId="1" stroke={COLORS.retail}  fill={COLORS.retail}  fillOpacity={0.8} />
              <Area dataKey="Events/Catering" stackId="1" stroke={COLORS.events}  fill={COLORS.events}  fillOpacity={0.8} />
            </AreaChart>
          </ResponsiveContainer>
        </DashCard>
      )}

      {view === "margins" && (
        <DashCard title="Monthly Cost & Margin %">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={marginData}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} domain={[0, 55]} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={0} stroke="#e2e8f0" />
              <Line dataKey="COGS %"       stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
              <Line dataKey="HR %"         stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
              <Line dataKey="Net Margin %" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-xs text-muted-foreground">
            <span><span className="inline-block w-3 h-0.5 bg-amber-500 mr-1 align-middle" />COGS avg: {((fyCOGS/fyTotal)*100).toFixed(1)}%</span>
            <span><span className="inline-block w-3 h-0.5 bg-red-500 mr-1 align-middle" />HR avg: {((fyHR/fyTotal)*100).toFixed(1)}%</span>
            <span><span className="inline-block w-3 h-0.5 bg-emerald-500 mr-1 align-middle" />Net avg: {((fyPL/fyTotal)*100).toFixed(1)}%</span>
          </div>
        </DashCard>
      )}

      {view === "pl" && (
        <DashCard title="Monthly Net Profit / Loss">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={plData}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={0} stroke="#e2e8f0" />
              <Bar dataKey="Net P&L" fill="#8b5cf6" radius={[4,4,0,0]}
                   label={{ position: "top", formatter: L, style: { fontSize: 10 } }} />
            </BarChart>
          </ResponsiveContainer>
        </DashCard>
      )}

      {view === "costs" && (
        <DashCard title="Monthly Operating Costs Breakdown">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={costData}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="HR Cost"       stackId="a" fill="#ef4444"  radius={[0,0,0,0]} />
              <Bar dataKey="Raw Material"  stackId="a" fill="#f59e0b"  />
              <Bar dataKey="Delivery Comm" stackId="a" fill="#3b82f6"  />
              <Bar dataKey="Site Cost"     stackId="a" fill="#8b5cf6"  />
              <Bar dataKey="Marketing"     stackId="a" fill="#10b981" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </DashCard>
      )}

      <DashCard title="Performance Health Check">
        {statusItems.map((s) => <StatusRow key={s.label} {...s} />)}
      </DashCard>
    </div>
  );
}
