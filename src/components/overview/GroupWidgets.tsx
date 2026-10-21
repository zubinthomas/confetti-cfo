import React from "react";
import KpiCard from "@/components/dashboard/KpiCard";
import DashCard from "@/components/dashboard/DashCard";
import StatusRow from "@/components/dashboard/StatusRow";
import PageSpinner from "@/components/dashboard/PageSpinner";
import TargetsView from "@/components/dashboard/TargetsView";
import TrackerImportBadge from "@/components/dashboard/TrackerImportBadge";
import { computeChannelBreakdown } from "@/data/storeSalesData";
import { targetSeries } from "@/data/revenueTargets";
import { MONTHS, L, fyLabel, monthPeriodIds } from "@/data/seriesKernel";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import Cell, { type WidgetProps } from "./Cell";
import { useGroupData, type GroupKpiKey, type GroupReady } from "./GroupData";

interface TooltipPayloadItem { color: string; name: string; value: number }
const CustomTooltip = ({ active = false, payload = [], label = "" }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) => {
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

/** The ready Group data, or null while it loads or when no provider is mounted. */
function useReadyGroup(): GroupReady | null {
  const g = useGroupData();
  return g?.status === "ready" ? g : null;
}

export function GroupHeader({ width }: WidgetProps) {
  const g = useReadyGroup();
  if (!g) return null;
  return (
    <Cell width={width} kind="header">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Group Snapshot - {g.isTargetsFy ? "FY 26-27" : g.cur.label}
          </p>
          <TrackerImportBadge freshness={g.freshness} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {[...g.realFys, "2026-2027"].map((y) => (
            <button
              key={y}
              onClick={() => g.setFy(y)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                y === g.fy
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {y === "2026-2027" ? "FY 26-27" : fyLabel(y)}
            </button>
          ))}
        </div>
      </div>
    </Cell>
  );
}

function groupKpi(key: GroupKpiKey) {
  return function GroupKpi({ width }: WidgetProps) {
    const g = useReadyGroup();
    const kpi = g && !g.isTargetsFy ? g.kpis[key] : undefined;
    if (!kpi) return null;
    return <Cell width={width} kind="kpi"><KpiCard {...kpi} /></Cell>;
  };
}

export const GroupKpiFnbRevenue = groupKpi("fnbRevenue");
export const GroupKpiStoreRevenue = groupKpi("storeRevenue");
export const GroupKpiFnbProfit = groupKpi("fnbProfit");
export const GroupKpiStorePL = groupKpi("storePL");
export const GroupKpiFnbLatest = groupKpi("fnbLatest");
export const GroupKpiStoreLatest = groupKpi("storeLatest");

export function GroupTargets({ width }: WidgetProps) {
  const g = useReadyGroup();
  if (!g || !g.isTargetsFy) return null;
  const { ref, sales2627, sales2526, FAB2627, FAB2526, combinedTargets2627 } = g;

  if (!(ref && sales2627 && sales2526 && FAB2627 && FAB2526 && combinedTargets2627)) {
    return <Cell width={width} kind="card"><DashCard title="FY 26-27 Targets"><PageSpinner /></DashCard></Cell>;
  }

  const targetsPeriodIds = monthPeriodIds(ref.periods, "2026-2027");
  const priorPeriodIds = monthPeriodIds(ref.periods, "2025-2026");
  const hpStoreChannelId = ref.channels.find((c) => c.name === "HP Store")?.id;
  // Same 0-vs-null masking StoreTab uses: computeChannelBreakdown
  // defaults a missing record to 0, which would make a month with no
  // Store data imported yet look like a genuine zero instead of "no
  // data" - null it out instead.
  const periodsWithStoreData = new Set(
    sales2627.filter((r) => r.channelId === hpStoreChannelId && r.categoryId == null).map((r) => r.periodId)
  );
  const rawStoreActual = computeChannelBreakdown(sales2627, ref.channels, targetsPeriodIds)["HP Store"] ?? [];
  const storeActual = targetsPeriodIds.map((pid, i) => (periodsWithStoreData.has(pid) ? rawStoreActual[i] : null));
  const storePriorYearActual = computeChannelBreakdown(sales2526, ref.channels, priorPeriodIds)["HP Store"] ?? [];

  const fnbActual = FAB2627.totalRevenue;
  const fnbPriorYearActual = FAB2526.totalRevenue;

  const storeTarget = targetSeries(combinedTargets2627, "store", targetsPeriodIds);
  const fnbTarget = targetSeries(combinedTargets2627, "fnb", targetsPeriodIds);

  // A month combines whichever business has data, treating a missing
  // one as 0 (rather than nulling the whole month) - null only when
  // BOTH are missing. "Partial" months (exactly one business missing)
  // are called out below since the combined figure understates the
  // true total for them.
  const sumAvailable = (a: number | null, b: number | null) => (a == null && b == null ? null : (a ?? 0) + (b ?? 0));
  const combinedActual = targetsPeriodIds.map((_, i) => sumAvailable(storeActual[i], fnbActual[i]));
  const combinedTarget = targetsPeriodIds.map((_, i) => sumAvailable(storeTarget[i], fnbTarget[i]));
  const combinedPriorYearActual = targetsPeriodIds.map((_, i) => sumAvailable(storePriorYearActual[i], fnbPriorYearActual[i]));
  // Growth-rate input: partial months are nulled out here (display-only
  // combinedActual keeps its summed value) so an understated partial
  // month doesn't drag the growth rate - and every later month's
  // projection - down. See projectionSeries' growthRateActual param.
  const growthRateActual = targetsPeriodIds.map((_, i) =>
    (storeActual[i] == null) !== (fnbActual[i] == null) ? null : combinedActual[i]
  );

  const missingStoreMonths = targetsPeriodIds
    .map((_, i) => (storeActual[i] == null && fnbActual[i] != null ? MONTHS[i] : null))
    .filter((m): m is string => m != null);
  const missingFnbMonths = targetsPeriodIds
    .map((_, i) => (fnbActual[i] == null && storeActual[i] != null ? MONTHS[i] : null))
    .filter((m): m is string => m != null);

  return (
    <Cell width={width} kind="card">
      <div className="space-y-6">
        {(missingStoreMonths.length > 0) && (
          <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 space-y-1">
            {missingStoreMonths.length > 0 && (
              <p>{missingStoreMonths.join(", ")}: Store actual isn&rsquo;t imported yet - the combined figure reflects F&B only.</p>
            )}
            {missingFnbMonths.length > 0 && (
              <p>{missingFnbMonths.join(", ")}: F&B actual isn&rsquo;t imported yet - the combined figure reflects Store only.</p>
            )}
          </div>
        )}
        <TargetsView
          categoryLabel="Store + F&B"
          fyLabel="FY 26-27"
          periods={ref.periods}
          periodIds={targetsPeriodIds}
          actual={combinedActual}
          target={combinedTarget}
          priorYearLabel="FY 25-26"
          priorYearActual={combinedPriorYearActual}
          growthRateActual={growthRateActual}
        />
      </div>
    </Cell>
  );
}

export function GroupMonthlyRevenue({ width }: WidgetProps) {
  const g = useReadyGroup();
  if (!g || g.isTargetsFy) return null;
  const { cur, monthlyData } = g;

  // Without monthly detail this one card stands in for both monthly charts.
  if (!cur.hasMonthlyDetail) {
    return (
      <Cell width={width} kind="card">
        <DashCard title={`Monthly detail - ${cur.label}`}>
          <p className="text-sm text-muted-foreground">
            Monthly P&L detail isn&rsquo;t available for {cur.label} yet - only annual totals from
            the workbook&rsquo;s Overview sheet are shown above. Once a CEPL P&L workbook with
            department-level monthly data is imported for this year, monthly charts will appear
            here automatically.
          </p>
        </DashCard>
      </Cell>
    );
  }

  return (
    <Cell width={width} kind="card">
      <DashCard title={`Monthly Revenue - F&B vs Store (${cur.label})`}>
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
    </Cell>
  );
}

export function GroupMonthlyPL({ width }: WidgetProps) {
  const g = useReadyGroup();
  if (!g || g.isTargetsFy || !g.cur.hasMonthlyDetail) return null;
  return (
    <Cell width={width} kind="card">
      <DashCard title={`Monthly Net P&L - F&B vs Store (${g.cur.label})`}>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={g.monthlyData}>
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
    </Cell>
  );
}

export function GroupAnnualRevenue({ width }: WidgetProps) {
  const g = useReadyGroup();
  if (!g || g.isTargetsFy) return null;
  const history = g.fnbStoreHistory;
  return (
    <Cell width={width} kind="card">
      <DashCard title="Annual Revenue - F&B vs Store (FY 21-22 → 25-26)">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={g.historyData} barGap={2}>
            <XAxis dataKey="year" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="F&B Revenue" fill="#3b82f6" radius={[4,4,0,0]} />
            <Bar dataKey="Store Revenue" fill="#10b981" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-2">
          F&B revenue grew {(((history.at(-1)!.fb.sales / history.at(-2)!.fb.sales) - 1) * 100) >= 0 ? "+" : ""}
          {((((history.at(-1)!.fb.sales / history.at(-2)!.fb.sales) - 1) * 100)).toFixed(0)}% in FY 25-26 -
          its first strongly profitable year (₹{L(history.at(-1)!.fb.pl)} net) after
          {" "}₹{L(Math.abs(history.at(-2)!.fb.pl))} of losses in FY 24-25.
        </p>
      </DashCard>
    </Cell>
  );
}

export function GroupAnnualPL({ width }: WidgetProps) {
  const g = useReadyGroup();
  if (!g || g.isTargetsFy) return null;
  return (
    <Cell width={width} kind="card">
      <DashCard title="Annual Net P&L - F&B vs Store (FY 21-22 → 25-26)">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={g.historyData} barGap={2}>
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
    </Cell>
  );
}

export function GroupHealth({ width }: WidgetProps) {
  const g = useReadyGroup();
  if (!g || g.isTargetsFy) return null;
  return (
    <Cell width={width} kind="card">
      <DashCard title="Performance Health Check">
        {g.statusItems.map((s) => <StatusRow key={s.label} {...s} />)}
      </DashCard>
    </Cell>
  );
}
