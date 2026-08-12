import React, { useState } from "react";
import KpiCard, { type KpiData } from "./KpiCard";
import DashCard from "./DashCard";
import StatusRow, { type StatusRowData } from "./StatusRow";
import PageSpinner from "./PageSpinner";
import TargetsView from "./TargetsView";
import { useStoreData, STORE_FYS } from "@/hooks/useStoreData";
import { useReferenceData } from "@/hooks/useReferenceData";
import { useSalesRecords } from "@/hooks/useSalesRecords";
import { useRevenueTargets } from "@/hooks/useRevenueTargets";
import { computeChannelBreakdown } from "@/data/storeSalesData";
import { targetSeries, projectionSeries } from "@/data/revenueTargets";
import { MONTHS, L, avg, maxIdx, minIdx, sum, monthPeriodIds } from "@/data/seriesKernel";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const CHAN_COLORS: Record<string, string> = {
  "HP Store": "#3b82f6",
  "Corporate": "#f59e0b",
  "Factory Outlet": "#10b981",
  "Online": "#8b5cf6",
};
const CAT_COLORS = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4","#84cc16","#f97316","#ec4899"];

interface TooltipPayloadItem { color: string; name: string; value: number }
const CustomTooltip = ({ active = false, payload = [], label = "" }: { active?: boolean; payload?: TooltipPayloadItem[]; label?: string }) => {
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

const STORE_FY_CHIPS = [...STORE_FYS, "2026-2027"];

export default function StoreTab() {
  const storeData = useStoreData();
  const [view, setView] = useState("channels");
  const [fy, setFy] = useState(STORE_FYS.at(-1)!);
  const isTargetsFy = fy === "2026-2027";

  // FY26-27 Targets data - deliberately NOT reusing useStoreData's
  // siennaStore.fy2627 (capped to Apr-May, the only months with real sales
  // data today) since Targets need all 12 months, most still target-only.
  const { data: ref } = useReferenceData();
  const { data: sales2627 } = useSalesRecords({ fiscalYear: ["2026-2027"] });
  const { data: storeTargets2627 } = useRevenueTargets({ category: ["store"], fiscalYear: ["2026-2027"] });

  if (!storeData) return <PageSpinner />;

  const { siennaStore, storeSalesByFy, categoriesByFy, storeHistory, aprilByFy, storeFinancialsByFy } = storeData;

  // Store's FY26-27 Target/Actual/Projection series - computed once here so
  // both the "FY 26-27" targets view and the multi-year history list below
  // (which needs a full-year total, not just the Apr-May actual sum) can use
  // the same numbers.
  const targetsPeriodIds = ref ? monthPeriodIds(ref.periods, "2026-2027") : [];
  let storeActual2627: (number | null)[] = [];
  let storeTarget2627: (number | null)[] = [];
  let storeProjection2627: (number | null)[] = [];
  if (ref && sales2627 && storeTargets2627) {
    const hpStoreChannelId = ref.channels.find((c) => c.name === "HP Store")?.id;
    // computeChannelBreakdown defaults a missing record to 0, which is right
    // for charts that only ever look at past/complete years, but here it
    // would make a month with no Store data imported yet (vs. one that's
    // genuinely zero-revenue) look like a huge miss - null it out instead so
    // projectionSeries treats it as "no data" rather than "actual is 0".
    const periodsWithData = new Set(
      sales2627.filter((r) => r.channelId === hpStoreChannelId && r.categoryId == null).map((r) => r.periodId)
    );
    const rawActual = computeChannelBreakdown(sales2627, ref.channels, targetsPeriodIds)["HP Store"] ?? [];
    storeActual2627 = targetsPeriodIds.map((pid, i) => (periodsWithData.has(pid) ? rawActual[i] : null));
    storeTarget2627 = targetSeries(storeTargets2627, "store", targetsPeriodIds);
    storeProjection2627 = projectionSeries(
      storeActual2627, storeSalesByFy["2025-2026"].channels["HP Store"], storeTarget2627, ref.periods, targetsPeriodIds
    ).series;
  }
  const storeProjectedFyTotal2627 = storeProjection2627.reduce((a: number, b) => a + (b || 0), 0);

  const storeHistoryDisplay = storeHistory.map((h) =>
    h.fy === "2026-2027"
      ? { ...h, label: "FY 26-27 (Projected)", total: storeProjectedFyTotal2627, method: "projected" as const }
      : h
  );

  const fyChipRow = (
    <div className="flex gap-1.5">
      {STORE_FY_CHIPS.map((y) => (
        <button
          key={y}
          onClick={() => setFy(y)}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            y === fy
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          {y === "2026-2027" ? "FY 26-27" : storeSalesByFy[y].label}
        </button>
      ))}
    </div>
  );

  if (isTargetsFy) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Sienna Store - Sales Analysis · FY 26-27
          </p>
          {fyChipRow}
        </div>
        {ref && sales2627 && storeTargets2627 ? (
          <TargetsView
            categoryLabel="Store"
            fyLabel="FY 26-27"
            periods={ref.periods}
            periodIds={targetsPeriodIds}
            actual={storeActual2627}
            target={storeTarget2627}
            priorYearLabel="FY 25-26"
            priorYearActual={storeSalesByFy["2025-2026"].channels["HP Store"]}
          />
        ) : (
          <DashCard title="FY 26-27 Targets"><PageSpinner /></DashCard>
        )}
      </div>
    );
  }

  // FY26-27 is only Apr-May so far - the YoY view and its KPI/status items are
  // fixed to "FY 25-26 vs the newest in-progress year" regardless of which
  // year the page-level selector below is on, since that's what they're
  // actually answering (not "whichever year is selected").
  const FY2526 = storeSalesByFy["2025-2026"];
  const FY27 = siennaStore.fy2627;

  // YoY monthly comparison: FY25-26 vs FY26-27 (Apr, May only) - fixed, not
  // tied to the page-level year selector.
  const yoyMonthly = [
    { month: "Apr", "FY 25-26": FY2526.channels["Total"][0], "FY 26-27": FY27.channels["Total"][0] },
    { month: "May", "FY 25-26": FY2526.channels["Total"][1], "FY 26-27": FY27.channels["Total"][1] },
  ];

  const hp27 = FY27.totals["HP Store"];
  const hp26Apr = FY2526.channels["HP Store"][0];
  const hp26May = FY2526.channels["HP Store"][1];

  // Is FY26-27's April the strongest April across every year with data? - also
  // fixed, always about the newest in-progress year.
  const fy2627April = FY27.channels["Total"][0];
  const priorAprils = Object.values(aprilByFy);
  const isStrongestApril = priorAprils.length > 0 && priorAprils.every((v) => fy2627April >= v);
  const bestPriorApril = priorAprils.length ? Math.max(...priorAprils) : 0;

  const FY = storeSalesByFy[fy];
  const STORE = storeFinancialsByFy[fy];
  const CATEGORIES = categoriesByFy[fy];

  const t = FY.totals;
  const pieData = Object.entries(t)
    .filter(([k]) => k !== "Total" && k !== "JP Store")
    .map(([name, value]) => ({ name, value }));

  const channelMonthly = MONTHS.map((m, i) => ({
    month: m,
    "HP Store":       FY.channels["HP Store"][i],
    "Corporate":      FY.channels["Corporate"][i],
    "Factory Outlet": FY.channels["Factory Outlet"][i],
    "Online":         FY.channels["Online"][i],
  }));

  const costMonthly = MONTHS.map((m, i) => ({
    month: m,
    "HR Cost":       STORE.hrCost[i],
    "Trading Items": STORE.tradingItems[i],
    "Direct Exp":    STORE.directExpenses[i],
    "Raw Material":  STORE.rawMaterial[i],
    "Site Cost":     STORE.siteCost[i],
  }));

  const storeFYPL = sum(STORE.totalSales);
  const storeHR   = sum(STORE.hrCost);

  // HP Store's share of total FY revenue.
  const hpSharePct = t["Total"] ? (t["HP Store"] / t["Total"]) * 100 : 0;

  // Online's share of total FY revenue.
  const onlineSharePct = t["Total"] ? (t["Online"] / t["Total"]) * 100 : 0;

  // Corporate channel concentration: peak month vs its own monthly average.
  const corpMonthly = FY.channels["Corporate"];
  const corpAvg = avg(corpMonthly);
  const corpPeakIdx = maxIdx(corpMonthly);
  const corpPeakRatio = corpPeakIdx >= 0 && corpAvg > 0 ? corpMonthly[corpPeakIdx]! / corpAvg : 0;

  // Seasonality: strongest/weakest revenue months, computed rather than assumed.
  const totalMonthly = FY.channels["Total"];
  const totalBestIdx = maxIdx(totalMonthly);
  const totalWorstIdx = minIdx(totalMonthly);

  // HR cost as % of sales, per month, H1 (Apr-Sep) vs H2 (Oct-Mar) average.
  const hrPctMonthly = MONTHS.map((_, i) =>
    STORE.totalSales[i] ? ((STORE.hrCost[i] || 0) / (STORE.totalSales[i] as number)) * 100 : null);
  const hrH1Avg = avg(hrPctMonthly.slice(0, 6));
  const hrH2Avg = avg(hrPctMonthly.slice(6, 12));

  // Flag the lowest HR-cost month as a likely anomaly only if it's well below
  // the average of the other months (not just "the lowest one").
  const hrCostMinIdx = minIdx(STORE.hrCost);
  const hrCostOthersAvg = hrCostMinIdx >= 0
    ? avg(STORE.hrCost.filter((_, i) => i !== hrCostMinIdx))
    : 0;
  const hrCostMinIsAnomaly = hrCostMinIdx >= 0 && hrCostOthersAvg > 0
    && (STORE.hrCost[hrCostMinIdx] as number) < hrCostOthersAvg * 0.5;

  const kpis: KpiData[] = [
    { label: "HP Store Revenue (FY)",   value: L(t["HP Store"]),   sub: `${((t["HP Store"]/t["Total"])*100).toFixed(0)}% of total`, status: "green" },
    { label: "Corporate Sales (FY)",    value: L(t["Corporate"]),  sub: `${((t["Corporate"]/t["Total"])*100).toFixed(0)}% of total`, status: "amber" },
    { label: "Total Store Revenue (FY)",value: L(t["Total"]),      sub: FY.label, status: "green" },
    { label: "Apr–May FY26-27",         value: L(FY27.totals["Total"]), sub: `${(((hp27)/(hp26Apr+hp26May)-1)*100).toFixed(0)}% HP YoY`, status: "green" },
    { label: "Online Sales (FY)",       value: L(t["Online"]),     sub: `${((t["Online"]/t["Total"])*100).toFixed(1)}% share`, status: "amber" },
  ];
  if (STORE.hasMonthlyDetail) {
    kpis.splice(4, 0, {
      label: "Annual HR % of Revenue", value: `${((storeHR/storeFYPL)*100).toFixed(1)}%`,
      sub: hrH2Avg < hrH1Avg ? "Improving H2" : "Higher in H2", status: "amber",
    });
  }

  const statusItems: StatusRowData[] = [
    {
      label: "HP Store dominance",
      status: hpSharePct >= 60 ? "amber" : "green",
      value: `${hpSharePct.toFixed(1)}% of FY revenue - ${hpSharePct >= 60 ? "concentrated in one channel" : "reliable base"}`,
    },
    {
      label: "Corporate concentration",
      status: corpPeakRatio >= 2 ? "amber" : "green",
      value: corpPeakIdx >= 0
        ? `Peak in ${MONTHS[corpPeakIdx]} (${L(corpMonthly[corpPeakIdx])}, ${corpPeakRatio.toFixed(1)}× monthly avg)${corpPeakRatio >= 2 ? " - concentration risk" : ""}`
        : "-",
    },
    {
      label: "Online channel",
      status: onlineSharePct < 5 ? "red" : "amber",
      value: `${onlineSharePct.toFixed(1)}% share - ${onlineSharePct < 5 ? "growth opportunity" : "gaining traction"}`,
    },
    {
      label: "Seasonal peak",
      status: "green",
      value: totalBestIdx >= 0 ? `${MONTHS[totalBestIdx]} - ${L(totalMonthly[totalBestIdx])}` : "-",
    },
    {
      label: "Seasonal low",
      status: "amber",
      value: totalWorstIdx >= 0 ? `${MONTHS[totalWorstIdx]} - ${L(totalMonthly[totalWorstIdx])}` : "-",
    },
    {
      label: "FY26-27 early trend",
      status: isStrongestApril ? "green" : "amber",
      value: priorAprils.length === 0
        ? `Apr ${L(fy2627April)} - no prior April to compare`
        : isStrongestApril
          ? `Apr ${L(fy2627April)} - strongest April on record`
          : `Apr ${L(fy2627April)} - below the best prior April (${L(bestPriorApril)})`,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Sienna Store - Sales Analysis · {FY.label}
          </p>
          {fyChipRow}
        </div>
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
          <DashCard title={`Monthly Revenue by Channel (${FY.label})`}>
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
          <DashCard title={`Annual Channel Mix (${FY.label})`}>
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <ResponsiveContainer width={200} height={200}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => L(v as number)} />
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
        <DashCard title={`Annual Sales by Product Category (${FY.label})`}>
          <p className="text-xs text-muted-foreground -mt-1 mb-2">
            Complete 12-month category breakdown for the selected year.
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={CATEGORIES} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={100} />
              <Tooltip formatter={(v) => [L(v as number), "Revenue"]} />
              <Bar dataKey="value" name="Revenue" radius={[0,4,4,0]}>
                {CATEGORIES.map((_, i) => (
                  <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 flex flex-wrap gap-2">
            {CATEGORIES.map(({ name, value }, i) => (
              <span key={name} className="text-xs text-muted-foreground flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: CAT_COLORS[i] }} />
                {name}: {((value / CATEGORIES.reduce((a,c)=>a+c.value,0))*100).toFixed(1)}%
              </span>
            ))}
          </div>
        </DashCard>
      )}

      {view === "yoy" && (
        <>
          <DashCard title="Apr & May - FY 25-26 vs FY 26-27">
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
                { label: "FY 2025-26", total: FY2526.totals["Total"], hp: FY2526.totals["HP Store"], corp: FY2526.totals["Corporate"] },
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

          <DashCard title="Store Revenue - Full Multi-Year History">
            <div className="space-y-2">
              {[...storeHistoryDisplay].reverse().map(({ label, total, method }) => (
                <div key={label} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{L(total)}</span>
                    <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                      method === "projected"
                        ? "text-amber-600 dark:text-amber-400 bg-amber-500/10"
                        : "text-muted-foreground/70 bg-muted"
                    }`}>
                      {method === "channel" ? "channel data" : method === "projected" ? "projected" : "category data"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Years are totaled from the monthly channel-level &ldquo;Overall sales&rdquo; records in the
              source workbook. FY 26-27 uses the projected full-year total (see the FY 26-27 tab) since
              only Apr-May actuals exist so far.
            </p>
          </DashCard>
        </>
      )}

      {view === "costs" && (
        STORE.hasMonthlyDetail ? (
          <DashCard title={`Monthly Store Cost Breakdown (${FY.label})`}>
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
            {hrCostMinIdx >= 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                Note: HR cost is lowest in {MONTHS[hrCostMinIdx]} ({L(STORE.hrCost[hrCostMinIdx])})
                {hrCostMinIsAnomaly ? " - well below the other months' average, likely a one-month anomaly." : "."}
              </p>
            )}
          </DashCard>
        ) : (
          <DashCard title={`Cost Structure - ${FY.label}`}>
            <p className="text-sm text-muted-foreground">
              Monthly cost-structure detail isn&rsquo;t available for {FY.label} yet - the CEPL P&L
              workbook only has department-level monthly breakdowns (HR, trading items, direct
              expenses, raw material, site cost) for FY 2025-26 so far. Once a workbook with that
              detail is imported for this year, this chart will appear automatically.
            </p>
          </DashCard>
        )
      )}

      <DashCard title="Performance Health Check">
        {statusItems.map((s) => <StatusRow key={s.label} {...s} />)}
      </DashCard>
    </div>
  );
}
