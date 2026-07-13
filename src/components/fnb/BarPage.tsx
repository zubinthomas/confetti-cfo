import React from "react";
import KpiCard from "@/components/dashboard/KpiCard";
import DashCard from "@/components/dashboard/DashCard";
import ChartTooltip from "@/components/dashboard/ChartTooltip";
import { FAB } from "@/data/ceplData";
import { OUTLETS, OUTLET_WEEKS, LIQUOR_MIX, CAFE_MONTHLY } from "@/data/fnbOutletData";
import { MONTHS, L, sum } from "@/data/core";
import type { KpiData } from "@/components/dashboard/KpiCard";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from "recharts";

const fyRetailBar = sum(FAB.retailBarSales);
const weeklyLiquor = sum(OUTLETS.total.liquor);
const aprAugLiquor = sum(CAFE_MONTHLY.liquor);
const liquorTotal = sum(LIQUOR_MIX.map((x) => x.value));

const monthly = MONTHS.map((m, i) => ({ month: m, "Retail & Bar Sales": FAB.retailBarSales[i] }));

const weekly = OUTLET_WEEKS.map((w, i) => ({
  week: w.short,
  "Dinning Room": OUTLETS.dinningRoom.liquor[i],
  "Bosar Ghor": OUTLETS.bosarGhor.liquor[i],
  Rannaghor: OUTLETS.rannaghor.liquor[i],
}));

const PIE_COLORS = ["#8b5cf6", "#f59e0b", "#10b981"];

const kpis: KpiData[] = [
  { label: "Retail & Bar Revenue (FY)", value: `₹${L(fyRetailBar)}`, sub: "F&B P&L line, FY 2025-26", status: "green" },
  { label: "Liquor Sales (Sep–Jan)", value: `₹${L(weeklyLiquor)}`, sub: "Weekly outlet detail" },
  { label: "Liquor Sales (Apr–Aug)", value: `₹${L(aprAugLiquor)}`, sub: "Whole-cafe monthly detail" },
  { label: "Cocktail Share", value: liquorTotal ? `${((LIQUOR_MIX[0]?.value / liquorTotal) * 100).toFixed(0)}%` : "—", sub: "Of liquor revenue since Sep", status: "green" },
];

export default function BarPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-3">
          Bar — Liquor & Retail-Bar Revenue · FY 2025-26
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
        </div>
      </div>

      <DashCard title="Monthly Retail & Bar Sales (F&B P&L line, full FY)">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={monthly}>
            <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="Retail & Bar Sales" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </DashCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashCard title="Weekly Liquor Sales by Outlet (Sep 2025 onwards)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={weekly}>
              <XAxis dataKey="week" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={1} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Dinning Room" stackId="a" fill="#8b5cf6" />
              <Bar dataKey="Bosar Ghor" stackId="a" fill="#f59e0b" />
              <Bar dataKey="Rannaghor" stackId="a" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </DashCard>

        <DashCard title="Liquor Mix (Sep 2025 onwards)">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={LIQUOR_MIX} dataKey="value" nameKey="name"
                cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}
              >
                {LIQUOR_MIX.map((entry, i) => (
                  <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </DashCard>
      </div>

      <p className="text-xs text-muted-foreground">
        &ldquo;Retail &amp; Bar Sales&rdquo; is the F&B department P&L line (includes retail items alongside the bar).
        The liquor-only view comes from the weekly cafe workbook: a single combined &ldquo;Liquor&rdquo; line
        Apr–Aug 2025, then cocktails/spirits/wine &amp; beer split by outlet from September 2025.
      </p>
    </div>
  );
}
