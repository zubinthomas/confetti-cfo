import React, { useState } from "react";
import KpiCard, { type KpiData } from "./KpiCard";
import DashCard from "./DashCard";
import StatusRow, { type StatusRowData } from "./StatusRow";
import PageSpinner from "./PageSpinner";
import TargetsView from "./TargetsView";
import { MenuMixCard } from "@/components/fnb/OutletPage";
import { useOverviewFiscalYears } from "@/hooks/useOverviewFiscalYears";
import { useFabYear } from "@/hooks/useFabYear";
import { useReferenceData } from "@/hooks/useReferenceData";
import { useRevenueTargets } from "@/hooks/useRevenueTargets";
import { useFinancialRecords } from "@/hooks/useFinancialRecords";
import { useFnbVenueData } from "@/hooks/useFnbVenueData";
import { targetSeries, projectionSeries } from "@/data/revenueTargets";
import { computeFabYear, FNB_BU } from "@/data/fabData";
import { VENUE_NAMES, DRILL_DOWN_CATEGORIES } from "@/data/fnbVenueData";
import { MONTHS, L, avg, maxIdx, minIdx, lastValidIdx, sum, fyLabel, monthPeriodIds, buildFrIndex } from "@/data/seriesKernel";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";

const COLORS = { product: "#3b82f6", retail: "#10b981", events: "#f59e0b", pl: "#8b5cf6" };
const VENUE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899"];

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

const QUARTER_LABELS = ["Q1 (Apr-Jun)", "Q2 (Jul-Sep)", "Q3 (Oct-Dec)", "Q4 (Jan-Mar)"];
// Sienna's internal COGS target - a fixed policy ceiling, not a data value.
const COGS_TARGET_PCT = 35;

export default function SiennaTab() {
  const [view, setView] = useState("revenue");
  const [fyDetailView, setFyDetailView] = useState<"targets" | "venue" | "item">("targets");
  const [drillCategory, setDrillCategory] = useState<string | null>(null);
  const fys = useOverviewFiscalYears();
  // "2026-2027" is always handled as the synthetic/projected targets entry
  // (below), never as a normal year - now that real FY26-27 F&B data exists,
  // useOverviewFiscalYears() legitimately includes it too, so it's excluded
  // here to avoid double-counting it (as a duplicate chip, a duplicate
  // history-list row, and - since it'd otherwise be the newest entry - the
  // page's default landing year instead of the last complete one).
  const realFys = fys?.filter((y) => y !== "2026-2027");
  const [selectedFy, setSelectedFy] = useState<string | null>(null);
  const fy = selectedFy ?? realFys?.at(-1) ?? fys?.at(-1);
  const isTargetsFy = fy === "2026-2027";
  const FAB = useFabYear(fy);

  // FY26-27 Targets data - fixed to FY26-27/FY25-26 regardless of the
  // page-level year selector above, same as StoreTab's yoy view.
  const { data: ref } = useReferenceData();
  const FAB2627 = useFabYear("2026-2027");
  const FAB2526 = useFabYear("2025-2026");
  const { data: fnbTargets2627 } = useRevenueTargets({ category: ["fnb"], fiscalYear: ["2026-2027"] });
  // Opt-in venue/item drill-down (F&B Weekly P&L import) - only ever has
  // data for FY26-27 weeks so far, surfaced as an extra toggle on that tab
  // rather than the general view switcher below (which FY26-27 never
  // reaches - it's fully replaced by the targets branch).
  const venueData = useFnbVenueData();
  // Unfiltered-by-year fetch so the multi-year history list below can total
  // every year in one pass, the way StoreTab's storeHistory already does.
  const { data: allFnbRecords } = useFinancialRecords({ businessUnitId: [FNB_BU] });

  if (!fys || !fy || !FAB) return <PageSpinner />;

  // F&B's FY26-27 Target/Actual/Projection series - computed once here so
  // both the "FY 26-27" targets view and the multi-year history list below
  // (which needs a full-year total, not the near-zero raw actual) use the
  // same numbers.
  const targetsPeriodIds2627 = ref ? monthPeriodIds(ref.periods, "2026-2027") : [];
  const fnbTarget2627 = fnbTargets2627 ? targetSeries(fnbTargets2627, "fnb", targetsPeriodIds2627) : [];
  const fnbProjection2627 = ref && FAB2627 && FAB2526 && fnbTargets2627
    ? projectionSeries(FAB2627.totalRevenue, FAB2526.totalRevenue, fnbTarget2627, ref.periods, targetsPeriodIds2627).series
    : [];
  const fnbProjectedFyTotal2627 = fnbProjection2627.reduce((a: number, b) => a + (b || 0), 0);

  const fnbHistory = ref
    ? [
        ...(allFnbRecords
          ? (() => {
              const idx = buildFrIndex(allFnbRecords);
              return (realFys ?? []).map((y) => ({
                fy: y,
                label: fyLabel(y),
                total: computeFabYear(idx, y, fyLabel(y), monthPeriodIds(ref.periods, y)).totals.revenue,
                method: "actual" as const,
              }));
            })()
          : []),
        { fy: "2026-2027", label: "FY 26-27 (Projected)", total: fnbProjectedFyTotal2627, method: "projected" as const },
      ]
    : [];

  const fyChips = [...realFys!, "2026-2027"];
  const fyChipRow = (
    <div className="flex gap-1.5">
      {fyChips.map((y) => (
        <button
          key={y}
          onClick={() => setSelectedFy(y)}
          className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
            y === fy
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          {y === "2026-2027" ? "FY 26-27" : fyLabel(y)}
        </button>
      ))}
    </div>
  );

  if (isTargetsFy) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Sienna F&B - Monthly P&L · FY 26-27
          </p>
          {fyChipRow}
        </div>

        {venueData && (
          <div className="flex gap-1.5 flex-wrap">
            {[
              { key: "targets", label: "Targets" },
              { key: "venue", label: "By Venue" },
              { key: "item", label: "By Item" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFyDetailView(key as typeof fyDetailView)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  fyDetailView === key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {fyDetailView === "targets" && (
          ref && FAB2627 && FAB2526 && fnbTargets2627 ? (
            <TargetsView
              categoryLabel="F&B"
              fyLabel="FY 26-27"
              periods={ref.periods}
              periodIds={targetsPeriodIds2627}
              actual={FAB2627.totalRevenue}
              target={fnbTarget2627}
              priorYearLabel="FY 25-26"
              priorYearActual={FAB2526.totalRevenue}
            />
          ) : (
            <DashCard title="FY 26-27 Targets"><PageSpinner /></DashCard>
          )
        )}

        {fyDetailView === "venue" && venueData && (() => {
          const venueChartData = venueData.weeks.map((w, i) => {
            const row: { week: string; [k: string]: string | number | null } = { week: w.short };
            for (const name of VENUE_NAMES) {
              const v = venueData.venues[name];
              if (v) row[name] = v.totalSales[i];
            }
            return row;
          });
          const activeVenues = VENUE_NAMES.filter((name) => venueData.venues[name]);
          return (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {activeVenues.map((name) => {
                  const v = venueData.venues[name]!;
                  const rev = sum(v.totalSales);
                  const pl = sum(v.pl);
                  return (
                    <KpiCard
                      key={name}
                      label={name}
                      value={L(rev)}
                      sub={rev ? `${((pl / rev) * 100).toFixed(1)}% margin` : "-"}
                      status={pl >= 0 ? "green" : "red"}
                    />
                  );
                })}
              </div>
              <DashCard title="Weekly Revenue by Venue">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={venueChartData}>
                    <XAxis dataKey="week" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={1} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {activeVenues.map((name, i) => (
                      <Bar key={name} dataKey={name} stackId="v" fill={VENUE_COLORS[i % VENUE_COLORS.length]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </DashCard>
            </>
          );
        })()}

        {fyDetailView === "item" && venueData && (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <MenuMixCard items={venueData.menuMix} title="Menu Mix (FY 26-27, all venues)" />
              <MenuMixCard items={venueData.liquorMix} title="Liquor Mix (FY 26-27, all venues)" />
              <MenuMixCard items={venueData.costMix} title="Cost Breakdown by Category (FY 26-27, all venues)" />
              <MenuMixCard items={venueData.deliveryPlatformMix} title="Delivery Platform Mix (FY 26-27, all venues)" />
            </div>

            <div>
              <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-2">
                Drill into a category
              </p>
              <div className="flex gap-1.5 flex-wrap">
                {DRILL_DOWN_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setDrillCategory(drillCategory === cat ? null : cat)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                      drillCategory === cat
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {drillCategory && (
              <MenuMixCard items={venueData.drillDown(drillCategory)} title={`${drillCategory} - Detail (FY 26-27, all venues)`} />
            )}
          </>
        )}
      </div>
    );
  }

  const fyTotal = FAB.totals.revenue;
  const fyPL = FAB.totals.pl;

  const kpis: KpiData[] = [
    { label: "Annual F&B Revenue", value: L(fyTotal), sub: FAB.label, status: "green" },
    { label: "Annual Net Profit", value: L(fyPL), sub: fyTotal ? `${((fyPL/fyTotal)*100).toFixed(1)}% margin` : "-", status: "green" },
  ];

  const statusItems: StatusRowData[] = [
    {
      label: "F&B FY net margin",
      status: fyPL > 0 ? "green" : "red",
      value: fyTotal ? `${((fyPL/fyTotal)*100).toFixed(1)}% - ${fyPL > 0 ? "profitable" : "loss-making"}` : "-",
    },
  ];

  let revenueData: { month: string; [k: string]: number | string | null }[] = [];
  let marginData: typeof revenueData = [];
  let plData: typeof revenueData = [];
  let costData: typeof revenueData = [];

  if (FAB.hasMonthlyDetail) {
    const fyHR       = sum(FAB.hrCost);
    const fyCOGS     = sum(FAB.rawMaterial);
    const fyDelivery = sum(FAB.deliveryComm);
    const bestMonth  = MONTHS[FAB.plPct.indexOf(Math.max(...(FAB.plPct as number[])))];
    const worstMonth = MONTHS[FAB.plPct.indexOf(Math.min(...(FAB.plPct as number[])))];

    const avgCogsPct = avg(FAB.cogsPct);

    const hrPeakIdx = maxIdx(FAB.hrPct);
    const hrLatestIdx = lastValidIdx(FAB.hrPct);
    const hrPeakPct = hrPeakIdx >= 0 ? (FAB.hrPct[hrPeakIdx] as number) : null;
    const hrLatestPct = hrLatestIdx >= 0 ? (FAB.hrPct[hrLatestIdx] as number) : null;
    const hrImproving = hrPeakPct != null && hrLatestPct != null && hrLatestPct < hrPeakPct;

    const bestRevIdx = maxIdx(FAB.totalRevenue);
    const worstRevIdx = minIdx(FAB.totalRevenue);

    const eventQuarterTotals = QUARTER_LABELS.map((_, q) =>
      FAB.eventCatering.slice(q * 3, q * 3 + 3).reduce((a, b) => a + (b || 0), 0));
    const bestEventQuarter = eventQuarterTotals.indexOf(Math.max(...eventQuarterTotals));

    kpis.push(
      { label: "Avg Monthly Revenue", value: L(Math.round(fyTotal/12)), sub: "Per month", status: "green" },
      { label: "Annual HR Cost", value: L(fyHR), sub: `${((fyHR/fyTotal)*100).toFixed(1)}% of revenue`, status: "amber" },
      { label: "Annual COGS", value: L(fyCOGS), sub: `${((fyCOGS/fyTotal)*100).toFixed(1)}% COGS ratio`, status: "green" },
      { label: "Delivery Commissions", value: L(fyDelivery), sub: `${((fyDelivery/fyTotal)*100).toFixed(1)}% of revenue`, status: "amber" },
    );

    statusItems.push(
      { label: "Best margin month", status: "green", value: `${bestMonth} - ${Math.max(...(FAB.plPct as number[]))}%` },
      { label: "Weakest margin month", status: "amber", value: `${worstMonth} - ${Math.min(...(FAB.plPct as number[]))}%` },
      {
        label: "COGS trend",
        status: avgCogsPct <= COGS_TARGET_PCT ? "green" : "red",
        value: `Avg ${avgCogsPct.toFixed(1)}% - ${avgCogsPct <= COGS_TARGET_PCT ? "within" : "above"} ${COGS_TARGET_PCT}% target`,
      },
      {
        label: "HR cost (peak)",
        status: hrImproving ? "amber" : "red",
        value: hrPeakPct == null || hrLatestPct == null
          ? "-"
          : `${hrPeakPct.toFixed(1)}% in ${MONTHS[hrPeakIdx]} - ${hrImproving
              ? `improving to ${hrLatestPct.toFixed(1)}% by ${MONTHS[hrLatestIdx]}`
              : `still ${hrLatestPct.toFixed(1)}% as of ${MONTHS[hrLatestIdx]}`}`,
      },
      { label: "Events revenue", status: "green", value: `${L(sum(FAB.eventCatering))} annual - strongest in ${QUARTER_LABELS[bestEventQuarter]}` },
      {
        label: "Seasonality",
        status: "amber",
        value: bestRevIdx >= 0 && worstRevIdx >= 0
          ? `${MONTHS[bestRevIdx]} peak (${L(FAB.totalRevenue[bestRevIdx])}) - ${MONTHS[worstRevIdx]} slowest (${L(FAB.totalRevenue[worstRevIdx])})`
          : "-",
      },
    );

    revenueData = MONTHS.map((m, i) => ({
      month: m,
      "Product Sales":    FAB.productSales[i],
      "Retail & Bar":     FAB.retailBarSales[i],
      "Events/Catering":  FAB.eventCatering[i],
    }));
    marginData = MONTHS.map((m, i) => ({
      month: m,
      "COGS %":      FAB.cogsPct[i],
      "HR %":        FAB.hrPct[i],
      "Net Margin %": FAB.plPct[i],
    }));
    plData = MONTHS.map((m, i) => ({
      month: m,
      "Net P&L":    FAB.profitLoss[i],
      "Revenue":    FAB.totalRevenue[i],
    }));
    costData = MONTHS.map((m, i) => ({
      month: m,
      "Raw Material": FAB.rawMaterial[i],
      "HR Cost":      FAB.hrCost[i],
      "Delivery Comm":FAB.deliveryComm[i],
      "Site Cost":    FAB.siteCost[i],
      "Marketing":    FAB.marketingCost[i],
    }));
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
            Sienna F&B - Monthly P&L · {FAB.label}
          </p>
          {fyChipRow}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
        </div>
      </div>

      {FAB.hasMonthlyDetail ? (
        <>
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
            <DashCard title={`Monthly Revenue by Stream (${FAB.label})`}>
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
            <DashCard title={`Monthly Cost & Margin % (${FAB.label})`}>
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
                <span><span className="inline-block w-3 h-0.5 bg-amber-500 mr-1 align-middle" />COGS avg: {((sum(FAB.rawMaterial)/fyTotal)*100).toFixed(1)}%</span>
                <span><span className="inline-block w-3 h-0.5 bg-red-500 mr-1 align-middle" />HR avg: {((sum(FAB.hrCost)/fyTotal)*100).toFixed(1)}%</span>
                <span><span className="inline-block w-3 h-0.5 bg-emerald-500 mr-1 align-middle" />Net avg: {((fyPL/fyTotal)*100).toFixed(1)}%</span>
              </div>
            </DashCard>
          )}

          {view === "pl" && (
            <DashCard title={`Monthly Net Profit / Loss (${FAB.label})`}>
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
            <DashCard title={`Monthly Operating Costs Breakdown (${FAB.label})`}>
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
        </>
      ) : (
        <DashCard title={`Monthly detail - ${FAB.label}`}>
          <p className="text-sm text-muted-foreground">
            Monthly revenue/margin/cost detail isn&rsquo;t available for {FAB.label} yet - F&B has no
            separate sales workbook to fall back on the way Store does, so only the two annual totals
            above (from the CEPL P&L workbook&rsquo;s Overview sheet) exist for this year. Once a full
            CEPL P&L workbook with F&B department-level monthly data is imported for this year, all
            four views here will appear automatically.
          </p>
        </DashCard>
      )}

      {fnbHistory.length > 0 && (
        <DashCard title="F&B Revenue - Full Multi-Year History">
          <div className="space-y-2">
            {[...fnbHistory].reverse().map(({ label, total, method }) => (
              <div key={label} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <span className="text-sm text-muted-foreground">{label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{L(total)}</span>
                  <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                    method === "projected"
                      ? "text-amber-600 dark:text-amber-400 bg-amber-500/10"
                      : "text-muted-foreground/70 bg-muted"
                  }`}>
                    {method === "actual" ? "actual" : "projected"}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Years are totaled from the CEPL P&L workbook&rsquo;s F&B department records (monthly detail
            where available, the Overview sheet&rsquo;s annual total otherwise). FY 26-27 uses the
            projected full-year total (see the FY 26-27 tab) since no monthly F&B data has been
            imported for it yet.
          </p>
        </DashCard>
      )}

      <DashCard title="Performance Health Check">
        {statusItems.map((s) => <StatusRow key={s.label} {...s} />)}
      </DashCard>
    </div>
  );
}
