import React, { useMemo } from "react";
import KpiCard from "@/components/dashboard/KpiCard";
import DashCard from "@/components/dashboard/DashCard";
import ChartTooltip from "@/components/dashboard/ChartTooltip";
import PageSpinner from "@/components/dashboard/PageSpinner";
import { useFabMonthly } from "@/hooks/useFabMonthly";
import { useAllOutlets } from "@/hooks/useAllOutlets";
import { useCafeEarlyWeekly } from "@/hooks/useCafeEarlyWeekly";
import { useImportFreshness } from "@/hooks/useImportFreshness";
import { MONTHS, L, sum } from "@/data/seriesKernel";
import type { KpiData } from "@/components/dashboard/KpiCard";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from "recharts";

const PIE_COLORS = ["#8b5cf6", "#f59e0b", "#10b981"];

export default function BarPage() {
  const fab = useFabMonthly();
  const outlets = useAllOutlets();
  const early = useCafeEarlyWeekly();
  const freshness = useImportFreshness(["fnbMonthly", "fnbWeekly"]);

  const view = useMemo(() => {
    if (!fab || !outlets || !early) return null;
    const { liquorMix, outlets: byOutlet, weeks } = outlets;
    const liquorTotal = sum(liquorMix.map((x) => x.value));
    return {
      kpis: [
        {
          label: "Retail & Bar Revenue (FY)", value: `₹${L(sum(fab.retailBarSales))}`, sub: "F&B P&L line, FY 2025-26", status: "green",
          definition: "The F&B P&L's Retail & Bar line (includes retail items alongside the bar) for the fiscal year.",
          ...freshness,
        },
        {
          label: "Liquor Sales (Sep–Jan)", value: `₹${L(sum(byOutlet.total.liquor))}`, sub: "Weekly outlet detail",
          definition: "Liquor sales from September onward, split by outlet, from the weekly cafe workbook.",
          ...freshness,
        },
        {
          label: "Liquor Sales (Apr–Aug)", value: `₹${L(sum(early.weekly.liquor))}`, sub: "Whole-cafe weekly detail",
          definition: "Liquor sales April through August, before outlet-level detail started, from the weekly cafe workbook.",
          ...freshness,
        },
        {
          label: "Cocktail Share", value: liquorTotal ? `${((liquorMix[0]?.value / liquorTotal) * 100).toFixed(0)}%` : "-", sub: "Of liquor revenue since Sep", status: "green",
          definition: "Cocktails' share of total liquor revenue since September, when the liquor line started splitting by type.",
          ...freshness,
        },
      ] satisfies KpiData[],
      monthly: MONTHS.map((m, i) => ({ month: m, "Retail & Bar Sales": fab.retailBarSales[i] })),
      weekly: weeks.map((w, i) => ({
        week: w.short,
        "Dinning Room": byOutlet.dinningRoom.liquor[i],
        "Bosar Ghor": byOutlet.bosarGhor.liquor[i],
        Rannaghor: byOutlet.rannaghor.liquor[i],
      })),
      liquorMix,
    };
  }, [fab, outlets, early, freshness]);

  if (!view) return <PageSpinner />;
  const { kpis, monthly, weekly, liquorMix: LIQUOR_MIX } = view;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-3">
          Bar - Liquor & Retail-Bar Revenue · FY 2025-26
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
