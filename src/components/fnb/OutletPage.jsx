import React from "react";
import KpiCard from "@/components/dashboard/KpiCard";
import DashCard from "@/components/dashboard/DashCard";
import ChartTooltip from "@/components/dashboard/ChartTooltip";
import { OUTLETS, OUTLET_WEEKS } from "@/data/fnbOutletData";
import { L } from "@/data/core";
import {
  ComposedChart, AreaChart, Area, BarChart, Bar, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";

const sum = (arr) => arr.reduce((a, b) => a + (b || 0), 0);

export default function OutletPage({ outletKey, heading, description, children }) {
  const data = OUTLETS[outletKey];
  const totalRevenue = sum(data.totalSales);
  const totalPL = sum(data.pl);
  const allRevenue = sum(OUTLETS.total.totalSales);
  const share = allRevenue ? (totalRevenue / allRevenue) * 100 : 0;
  const margin = totalRevenue ? (totalPL / totalRevenue) * 100 : 0;
  const weeksWithData = data.totalSales.filter((v) => v != null).length;
  const bestIdx = data.totalSales.reduce(
    (best, v, i) => (v != null && (best === -1 || v > data.totalSales[best]) ? i : best), -1);

  const kpis = [
    { label: "Revenue (Sep–Jan)", value: `₹${L(totalRevenue)}`, sub: `${weeksWithData} weeks of data`, status: "green" },
    { label: "Avg Weekly Revenue", value: `₹${L(weeksWithData ? totalRevenue / weeksWithData : 0)}` },
    { label: "Net P&L (Sep–Jan)", value: `₹${L(totalPL)}`, sub: `${margin.toFixed(1)}% margin`, status: totalPL >= 0 ? "green" : "red" },
    { label: "Share of F&B outlets", value: `${share.toFixed(1)}%`, sub: "Of all-outlet revenue" },
    { label: "Best Week", value: bestIdx >= 0 ? OUTLET_WEEKS[bestIdx].short : "—", sub: bestIdx >= 0 ? `₹${L(data.totalSales[bestIdx])}` : "" , status: "green" },
  ];

  const weekly = OUTLET_WEEKS.map((w, i) => ({
    week: w.short,
    Revenue: data.totalSales[i],
    "Net P&L": data.pl[i],
  }));

  const streams = OUTLET_WEEKS.map((w, i) => ({
    week: w.short,
    "Inhouse Menu": data.inhouse[i],
    Liquor: data.liquor[i],
    Events: data.events[i],
    "Outside Products": data.outside[i],
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-3">
          {heading} — Weekly P&L · Sep 2025 onwards
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
        </div>
      </div>

      <DashCard title="Weekly Revenue vs Net P&L">
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={weekly}>
            <XAxis dataKey="week" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={1} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#e2e8f0" />
            <Bar dataKey="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Line type="monotone" dataKey="Net P&L" stroke="#ef4444" strokeWidth={2} dot={{ r: 2.5 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </DashCard>

      <DashCard title="Weekly Revenue by Stream">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={streams}>
            <XAxis dataKey="week" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={1} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area dataKey="Inhouse Menu" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.8} />
            <Area dataKey="Liquor" stackId="1" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.8} />
            <Area dataKey="Events" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.8} />
            <Area dataKey="Outside Products" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.8} />
          </AreaChart>
        </ResponsiveContainer>
      </DashCard>

      {children}

      <p className="text-xs text-muted-foreground">
        {description} Weekly outlet-level detail exists from September 2025 onwards; April–August 2025
        is reported as a single combined Cafe P&L in the source workbook (see the Cafe page). The
        &ldquo;Durga Puja 2025&rdquo; summary weeks are already included in the regular weekly figures.
      </p>
    </div>
  );
}

export function MenuMixCard({ items, title }) {
  if (!items.length) return null;
  const top = items.slice(0, 12);
  return (
    <DashCard title={title}>
      <ResponsiveContainer width="100%" height={Math.max(160, top.length * 28)}>
        <BarChart data={top} layout="vertical">
          <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={150} />
          <Tooltip content={<ChartTooltip />} />
          <Bar dataKey="value" name="Revenue" fill="#3b82f6" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </DashCard>
  );
}
