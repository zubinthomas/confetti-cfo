import React, { useState } from "react";
import KpiCard from "./KpiCard";
import DashCard from "./DashCard";
import StatusRow from "./StatusRow";
import { SIENNA_STORE, SIENNA_CATEGORIES, SIENNA_CATEGORIES_LABEL, STORE_HISTORY, STORE, MONTHS, L } from "@/data/financialData";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const FY = SIENNA_STORE.fy2526;
const FY27 = SIENNA_STORE.fy2627;

const CHAN_COLORS = {
  "HP Store": "#3b82f6",
  "Corporate": "#f59e0b",
  "Factory Outlet": "#10b981",
  "Online": "#8b5cf6",
};
const CAT_COLORS = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4","#84cc16","#f97316","#ec4899"];

const CustomTooltip = ({ active = false, payload = [], label = "" }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
      <p className="text-xs font-semibold text-foreground mb-2">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-xs" style={{ color: p.color }}>
          {p.name}: {L(p.value)}
        </p>
      ))}
    </div>
  );
};

// Monthly channel data for FY25-26
const channelMonthly = MONTHS.map((m, i) => ({
  month: m,
  "HP Store":       FY.channels["HP Store"][i],
  "Corporate":      FY.channels["Corporate"][i],
  "Factory Outlet": FY.channels["Factory Outlet"][i],
  "Online":         FY.channels["Online"][i],
}));

// YoY monthly comparison: FY25-26 vs FY26-27 (Apr, May only)
const yoyMonthly = [
  { month: "Apr", "FY 25-26": FY.channels["Total"][0], "FY 26-27": FY27.channels["Total"][0] },
  { month: "May", "FY 25-26": FY.channels["Total"][1], "FY 26-27": FY27.channels["Total"][1] },
];

// Cost structure (from CEPL Store sheet)
const costMonthly = MONTHS.map((m, i) => ({
  month: m,
  "HR Cost":       STORE.hrCost[i],
  "Trading Items": STORE.tradingItems[i],
  "Direct Exp":    STORE.directExpenses[i],
  "Raw Material":  STORE.rawMaterial[i],
  "Site Cost":     STORE.siteCost[i],
}));

// KPIs
const t = FY.totals;
const hp27 = FY27.totals["HP Store"];
const hp26Apr = FY.channels["HP Store"][0];
const hp26May = FY.channels["HP Store"][1];
const storeFYPL = STORE.totalSales.reduce((a,b)=>a+b,0);
const storeHR   = STORE.hrCost.reduce((a,b)=>a+b,0);

const kpis = [
  { label: "HP Store Revenue (FY)",   value: L(t["HP Store"]),   sub: `${((t["HP Store"]/t["Total"])*100).toFixed(0)}% of total`, status: "green" },
  { label: "Corporate Sales (FY)",    value: L(t["Corporate"]),  sub: `${((t["Corporate"]/t["Total"])*100).toFixed(0)}% of total`, status: "amber" },
  { label: "Total Store Revenue (FY)",value: L(t["Total"]),      sub: "FY 2025-26", status: "green" },
  { label: "Apr–May FY26-27",         value: L(FY27.totals["Total"]), sub: `${(((hp27)/(hp26Apr+hp26May)-1)*100).toFixed(0)}% HP YoY`, status: "green" },
  { label: "Annual HR % of Revenue",  value: `${((storeHR/storeFYPL)*100).toFixed(1)}%`, sub: "Improving H2", status: "amber" },
  { label: "Online Sales (FY)",       value: L(t["Online"]),     sub: `${((t["Online"]/t["Total"])*100).toFixed(1)}% share`, status: "amber" },
];

const statusItems = [
  { label: "HP Store dominance", status: "green", value: `83.4% of FY revenue — reliable base` },
  { label: "Corporate spike", status: "amber",  value: "Sep–Jan surge (₹24L+/mo) — concentration risk" },
  { label: "Online channel", status: "red",  value: "Only 0.7% share — growth opportunity" },
  { label: "Dec 2025 peak", status: "green",  value: `${L(FY.channels["Total"][8])} — seasonal high (Christmas/year-end)` },
  { label: "Aug 2025 dip", status: "amber",  value: `${L(FY.channels["Total"][4])} — seasonal low` },
  { label: "FY26-27 early trend", status: "green",  value: "Apr ₹22.7L — strongest Apr on record" },
];

export default function StoreTab() {
  const [view, setView] = useState("channels");

  const pieData = Object.entries(t)
    .filter(([k]) => k !== "Total" && k !== "JP Store")
    .map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-3">
          Sienna Store — Sales Analysis · FY 2025-26
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
        </div>
      </div>

      {/* View switcher */}
      <div className="flex gap-1.5 flex-wrap">
        {[
          { key: "channels",   label: "Channel Mix" },
          { key: "categories", label: "Categories" },
          { key: "yoy",        label: "YoY Comparison" },
          { key: "costs",      label: "Cost Structure" },
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

      {view === "channels" && (
        <>
          <DashCard title="Monthly Revenue by Channel">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={channelMonthly}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {Object.keys(CHAN_COLORS).map((ch) => (
                  <Bar key={ch} dataKey={ch} stackId="a" fill={CHAN_COLORS[ch]}
                       radius={ch === "Online" ? [4,4,0,0] : [0,0,0,0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </DashCard>

          {/* Channel pie */}
          <DashCard title="Annual Channel Mix (FY 2025-26)">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <ResponsiveContainer width={200} height={200}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => L(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 flex-1">
                {pieData.map(({ name, value }, i) => (
                  <div key={name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }} />
                      {name}
                    </span>
                    <span className="font-medium text-foreground">
                      {L(value)} <span className="text-xs text-muted-foreground ml-1">({((value/t["Total"])*100).toFixed(1)}%)</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </DashCard>
        </>
      )}

      {view === "categories" && (
        <DashCard title={`Annual Sales by Product Category (${SIENNA_CATEGORIES_LABEL})`}>
          <p className="text-xs text-muted-foreground -mt-1 mb-2">
            Most recent year with a complete 12-month category breakdown in the source data —
            FY 2025-26 category-level detail is only available for Apr &amp; May so far.
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={SIENNA_CATEGORIES} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={100} />
              <Tooltip formatter={(v) => [L(v), "Revenue"]} />
              {SIENNA_CATEGORIES.map((_, i) => null)}
              <Bar dataKey="value" name="Revenue" radius={[0,4,4,0]}>
                {SIENNA_CATEGORIES.map((_, i) => (
                  <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 flex flex-wrap gap-2">
            {SIENNA_CATEGORIES.map(({ name, value }, i) => (
              <span key={name} className="text-xs text-muted-foreground flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CAT_COLORS[i] }} />
                {name}: {((value / SIENNA_CATEGORIES.reduce((a,c)=>a+c.value,0))*100).toFixed(1)}%
              </span>
            ))}
          </div>
        </DashCard>
      )}

      {view === "yoy" && (
        <>
          <DashCard title="Apr & May — FY 25-26 vs FY 26-27">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={yoyMonthly} barGap={8}>
                <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="FY 25-26" fill="#94a3b8" radius={[4,4,0,0]} />
                <Bar dataKey="FY 26-27" fill="#3b82f6" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {yoyMonthly.map(({ month, ...vals }) => {
                const growth = ((vals["FY 26-27"] / vals["FY 25-26"]) - 1) * 100;
                return (
                  <div key={month} className="bg-muted/40 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">{month}</p>
                    <p className="text-sm font-semibold text-foreground">{L(vals["FY 26-27"])}</p>
                    <p className={`text-xs font-medium ${growth > 0 ? "text-green-600" : "text-red-500"}`}>
                      {growth > 0 ? "+" : ""}{growth.toFixed(1)}% YoY
                    </p>
                  </div>
                );
              })}
            </div>
          </DashCard>

          <DashCard title="Historical Annual Channel Revenue">
            <div className="space-y-3">
              {[
                { label: "FY 2026-27 (Apr–May)", total: FY27.totals["Total"], hp: FY27.totals["HP Store"], corp: FY27.totals["Corporate"] },
                { label: "FY 2025-26", total: t["Total"], hp: t["HP Store"], corp: t["Corporate"] },
              ].map(({ label, total, hp, corp }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <div className="flex gap-4 text-right">
                    <div>
                      <p className="text-xs text-muted-foreground">HP Store</p>
                      <p className="text-sm font-medium">{L(hp)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Corporate</p>
                      <p className="text-sm font-medium">{L(corp)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="text-sm font-semibold text-foreground">{L(total)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </DashCard>

          <DashCard title="Store Revenue — Full Multi-Year History">
            <div className="space-y-2">
              {[...STORE_HISTORY].reverse().map(({ label, total, method }) => (
                <div key={label} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{L(total)}</span>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 bg-muted px-1.5 py-0.5 rounded">
                      {method === "channel" ? "channel data" : "category data"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              FY 22-23 and FY 23-24 are totaled from category-level sales (no channel breakdown for those years
              in the source data); other years use the channel-level total directly.
            </p>
          </DashCard>
        </>
      )}

      {view === "costs" && (
        <DashCard title="Monthly Store Cost Breakdown">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={costMonthly}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="HR Cost"       stackId="a" fill="#ef4444" />
              <Bar dataKey="Trading Items" stackId="a" fill="#f59e0b" />
              <Bar dataKey="Direct Exp"    stackId="a" fill="#3b82f6" />
              <Bar dataKey="Raw Material"  stackId="a" fill="#10b981" />
              <Bar dataKey="Site Cost"     stackId="a" fill="#8b5cf6" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-2">
            Note: HR cost drops sharply in Mar 2026 (₹{L(STORE.hrCost[11])}) — likely one-month anomaly.
          </p>
        </DashCard>
      )}

      <DashCard title="Performance Health Check">
        {statusItems.map((s) => <StatusRow key={s.label} {...s} />)}
      </DashCard>
    </div>
  );
}
