// Shared "FY 26-27" view for the Target vs Projection and prior-year vs
// current-year comparisons, rendered by both StoreTab (category "store") and
// SiennaTab (category "fnb") - each page supplies its own already-computed
// monthly Actual/Target series for its own data source (Sienna HP Store
// channel vs CEPL F&B department); this component only does the shared
// projection math, KPIs, and charts.
import React from "react";
import KpiCard, { type KpiData } from "./KpiCard";
import DashCard from "./DashCard";
import { MONTHS, L } from "@/data/seriesKernel";
import { projectionSeries, computeGap } from "@/data/revenueTargets";
import type { Period } from "@/data/types";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

interface TooltipPayloadItem { color: string; name: string; value: number | null }
const CustomTooltip = ({ active = false, payload = [], label = "" }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
      <p className="text-xs font-semibold text-foreground mb-2">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-xs" style={{ color: p.color }}>
          {p.name}: {p.value == null ? "-" : L(p.value)}
        </p>
      ))}
    </div>
  );
};

export interface TargetsViewProps {
  categoryLabel: string; // "Store" | "F&B"
  fyLabel: string; // "FY 26-27"
  periods: Period[];
  periodIds: number[]; // 12 FY26-27 month period ids, Apr..Mar
  actual: (number | null)[]; // aligned with periodIds
  target: (number | null)[]; // aligned with periodIds
  priorYearLabel: string; // "FY 25-26"
  priorYearActual: (number | null)[]; // aligned with periodIds (same Apr..Mar month positions, prior FY)
}

export default function TargetsView({
  categoryLabel, fyLabel, periods, periodIds, actual, target, priorYearLabel, priorYearActual,
}: TargetsViewProps) {
  const today = new Date();
  const { series: projection, growthRateSource } = projectionSeries(actual, priorYearActual, target, periods, periodIds, today);
  const gap = projection.map((p, i) => computeGap(p, target[i]));
  const isTargetFallback = growthRateSource === "target";

  const periodById = new Map(periods.map((p) => [p.id, p]));
  const todayStr = today.toISOString().slice(0, 10);
  const currentIdx = periodIds.findIndex((pid) => {
    const p = periodById.get(pid);
    return p && todayStr >= p.startDate && todayStr < p.endDate;
  });

  const chartData = MONTHS.map((m, i) => ({
    month: m,
    Target: target[i],
    Projection: projection[i],
    Actual: actual[i],
  }));

  const yoyData = MONTHS.map((m, i) => ({
    month: m,
    [priorYearLabel]: priorYearActual[i],
    [fyLabel]: projection[i],
  }));

  const kpis: KpiData[] = [];
  if (currentIdx >= 0) {
    const t = target[currentIdx];
    const p = projection[currentIdx];
    const g = gap[currentIdx];
    kpis.push(
      { label: `${MONTHS[currentIdx]} Target`, value: L(t), status: "green" },
      { label: `${MONTHS[currentIdx]} Actual (so far)`, value: L(actual[currentIdx]), status: "amber" },
      { label: `${MONTHS[currentIdx]} Projection`, value: L(p), status: "amber" },
      {
        label: "Gap vs Target",
        value: g == null ? "-" : `${g >= 0 ? "+" : ""}${L(g)}`,
        status: g == null ? null : g >= 0 ? "green" : "red",
      },
    );
  }

  const fyTargetTotal = target.reduce((a, b) => a + (b || 0), 0);
  const fyProjectionTotal = projection.reduce((a, b) => a + (b || 0), 0);
  const fyGapTotal = fyProjectionTotal - fyTargetTotal;

  return (
    <div className="space-y-6">
      {isTargetFallback && (
        <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
          No {fyLabel} actuals are available yet, so Projection can&rsquo;t be based on this year&rsquo;s
          performance. It&rsquo;s currently estimated from the Target&rsquo;s own implied growth over{" "}
          {priorYearLabel} instead - treat it as a reshaped target, not a performance-based forecast,
          until actual data starts coming in.
        </div>
      )}

      {kpis.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
        </div>
      )}

      <DashCard title={`${categoryLabel} - Target vs Projection (${fyLabel})`}>
        <p className="text-xs text-muted-foreground -mt-1 mb-2">
          Projection is a day-elapsed run-rate for the current month, and equals Actual once a month
          has fully closed. Months with no actual data yet (including ones still ahead) are
          estimated from {priorYearLabel}&rsquo;s same month, scaled by{" "}
          {isTargetFallback ? "the Target's implied growth (no actuals yet)" : "this year's growth so far"}.
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData}>
            <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Target" fill="#94a3b8" radius={[4, 4, 0, 0]} />
            <Line dataKey="Projection" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <span>FY Target total: <span className="font-medium text-foreground">{L(fyTargetTotal)}</span></span>
          <span>FY Projection total (to date): <span className="font-medium text-foreground">{L(fyProjectionTotal)}</span></span>
          <span className={fyGapTotal >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
            Gap: {fyGapTotal >= 0 ? "+" : ""}{L(fyGapTotal)}
          </span>
        </div>
      </DashCard>

      <DashCard title={`${categoryLabel} - ${priorYearLabel} vs ${fyLabel}`}>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={yoyData} barGap={8}>
            <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey={priorYearLabel} fill="#94a3b8" radius={[4, 4, 0, 0]} />
            <Bar dataKey={fyLabel} fill="#10b981" radius={[4, 4, 0, 0]} />
          </ComposedChart>
        </ResponsiveContainer>
      </DashCard>
    </div>
  );
}
