import React, { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Brush, ResponsiveContainer } from "recharts";
import { Loader2 } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import KpiCard from "@/components/dashboard/KpiCard";
import { getProductionSummary, type ProductionSummary } from "@/api/opsApi";
import { fyOf, fyLabel } from "@/components/dashboard/ops/fiscalYear";

function shortDateTick(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });
}

function fullDateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" });
}

const STAGE_ORDER = ["throwing", "finishing", "glazing", "firing"] as const;
const STAGE_LABELS: Record<string, string> = {
  throwing: "Throwing/Turning",
  finishing: "Finishing",
  glazing: "Glazing",
  firing: "Firing",
};
// Fixed order, distinct from the app's status hues (emerald/amber/red) so
// this reads as identity, not state.
const STAGE_COLORS: Record<string, string> = {
  throwing: "#3b82f6",
  finishing: "#8b5cf6",
  glazing: "#f59e0b",
  firing: "#14b8a6",
};

function pivotDaily(daily: ProductionSummary["daily"]) {
  const byDate = new Map<string, Record<string, number | string>>();
  for (const d of daily) {
    const row = byDate.get(d.date) ?? { date: d.date };
    row[d.stage] = d.qty;
    byDate.set(d.date, row);
  }
  return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export default function ProductionOpsSection() {
  const [data, setData] = useState<ProductionSummary | null>(null);
  const [error, setError] = useState("");
  const [selectedFy, setSelectedFy] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    getProductionSummary()
      .then(setData)
      .catch((err: Error) => setError(err.message || "Failed to load production data"));
  }, []);

  // The visible range grows without bound as more days get imported over time,
  // which is what made the chart/brush unwieldy - scoping everything below to
  // one fiscal year at a time (like the financial-dashboard pages' FY chiclets)
  // keeps it bounded to at most ~365 days.
  const allPivoted = useMemo(() => (data ? pivotDaily(data.daily) : []), [data]);
  const availableFys = useMemo(
    () => [...new Set(allPivoted.map((d) => fyOf(String(d.date))))].sort(),
    [allPivoted],
  );
  const fy = selectedFy ?? availableFys.at(-1);

  const chartData = useMemo(
    () => (fy ? allPivoted.filter((d) => fyOf(String(d.date)) === fy) : []),
    [allPivoted, fy],
  );
  const minDate = chartData[0]?.date as string | undefined;
  const maxDate = chartData[chartData.length - 1]?.date as string | undefined;
  const rangedData = useMemo(
    () => chartData.filter((d) => (!fromDate || String(d.date) >= fromDate) && (!toDate || String(d.date) <= toDate)),
    [chartData, fromDate, toDate],
  );

  // Reset the date-range/brush zoom to the newly-selected FY's own bounds
  // whenever the FY chip changes, instead of carrying over dates from a
  // different year (which could land outside the new FY's data entirely).
  useEffect(() => {
    if (chartData.length === 0) return;
    setFromDate(String(chartData[0].date));
    setToDate(String(chartData[chartData.length - 1].date));
    // Only re-run when the selected fiscal year itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fy]);

  const fyKpis = useMemo(() => {
    const rows = fy ? data?.daily.filter((d) => fyOf(d.date) === fy) ?? [] : [];
    const totalPieces = rows.reduce((sum, r) => sum + r.qty, 0);
    const days = new Set(rows.map((r) => r.date));
    const byStage = new Map<string, number>();
    for (const r of rows) byStage.set(r.stage, (byStage.get(r.stage) ?? 0) + r.qty);
    let busiestStage: string | null = null;
    let max = -1;
    for (const [stage, qty] of byStage) {
      if (qty > max) { max = qty; busiestStage = stage; }
    }
    return {
      totalPieces,
      daysCovered: days.size,
      avgPerDay: days.size ? Math.round(totalPieces / days.size) : 0,
      busiestStage,
    };
  }, [data, fy]);

  // The chart itself renders the full, unfiltered chartData, with Brush's startIndex/endIndex
  // doing the zooming: recharts' Brush drives the parent chart's own internal data slicing
  // (it slices whatever `data` the chart was given by dataStartIndex/dataEndIndex), so the
  // indices here and the chart's `data` prop must live in the same index space - passing a
  // separately pre-filtered array as the chart's data while indexing the brush against
  // chartData causes recharts to slice out of bounds. This also keeps the brush's own
  // underlying data, and the container width below (sized off chartData.length), constant
  // while dragging - otherwise each onChange narrows fromDate/toDate, which would shrink the
  // very container the handle is being dragged in, and the handle jumps as recharts recomputes
  // its position against a moving target.
  const brushStartIndex = useMemo(() => {
    if (chartData.length === 0) return 0;
    if (!fromDate) return 0;
    const idx = chartData.findIndex((d) => String(d.date) >= fromDate);
    return idx === -1 ? 0 : idx;
  }, [chartData, fromDate]);

  const brushEndIndex = useMemo(() => {
    if (chartData.length === 0) return 0;
    if (!toDate) return chartData.length - 1;
    for (let i = chartData.length - 1; i >= 0; i--) {
      if (String(chartData[i].date) <= toDate) return i;
    }
    return chartData.length - 1;
  }, [chartData, toDate]);

  const handleBrushChange = (range: { startIndex?: number; endIndex?: number }) => {
    if (range.startIndex == null || range.endIndex == null) return;
    const start = chartData[range.startIndex];
    const end = chartData[range.endIndex];
    if (start && String(start.date) !== fromDate) setFromDate(String(start.date));
    if (end && String(end.date) !== toDate) setToDate(String(end.date));
  };

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading production data…
      </div>
    );
  }

  if (data.daily.length === 0) {
    return (
      <DashCard>
        <p className="text-sm text-muted-foreground">
          No production log data imported yet. Upload the daily production workbook from Data → Import.
        </p>
      </DashCard>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Daily production
        </p>
        <div className="flex gap-1.5">
          {availableFys.map((y) => (
            <button
              key={y}
              onClick={() => setSelectedFy(y)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                y === fy
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {fyLabel(y)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total Pieces" value={fyKpis.totalPieces.toLocaleString()} />
        <KpiCard label="Days Covered" value={fyKpis.daysCovered} />
        <KpiCard label="Avg / Day" value={fyKpis.avgPerDay.toLocaleString()} />
        <KpiCard label="Busiest Stage" value={fyKpis.busiestStage ? STAGE_LABELS[fyKpis.busiestStage] : "-"} />
      </div>

      <DashCard
        title="Daily pieces produced by stage"
        action={
          <div className="flex items-center flex-wrap gap-1.5 text-xs">
            <input
              type="date" value={fromDate} min={minDate} max={toDate || maxDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="border border-border rounded-lg px-2 py-1 bg-background text-foreground"
            />
            <span className="text-muted-foreground">to</span>
            <input
              type="date" value={toDate} min={fromDate || minDate} max={maxDate}
              onChange={(e) => setToDate(e.target.value)}
              className="border border-border rounded-lg px-2 py-1 bg-background text-foreground"
            />
          </div>
        }
      >
        {rangedData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No production data in the selected date range.</p>
        ) : (
          <>
            {/* Bars need ~16px each to stay legible - on a narrow screen that can exceed the
                viewport, so this scrolls horizontally within the card rather than squeezing
                every bar into the visible width. The date pickers and brush above/below let
                you narrow the range instead, so scrolling is rarely necessary. Width is sized
                off the full chartData, not the currently zoomed-to slice, so it stays constant
                while zooming - see the brush index comment above. */}
            <div className="overflow-x-auto -mx-1 px-1">
              <div style={{ minWidth: Math.max(chartData.length * 16, 280) }}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartData}>
                    <XAxis dataKey="date" tickFormatter={shortDateTick} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip labelFormatter={(v) => fullDateLabel(String(v))} />
                    {STAGE_ORDER.map((stage) => (
                      <Bar key={stage} dataKey={stage} name={stage} stackId="stage" fill={STAGE_COLORS[stage]} maxBarSize={40} isAnimationActive={false} />
                    ))}
                    <Brush
                      data={chartData} startIndex={brushStartIndex} endIndex={brushEndIndex}
                      dataKey="date" height={28} travellerWidth={14} tickFormatter={shortDateTick}
                      stroke="#3b82f6" fill="rgba(148,163,184,0.15)" onChange={handleBrushChange}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-3 text-xs">
              {STAGE_ORDER.map((stage) => (
                <span key={stage} className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: STAGE_COLORS[stage] }} />
                  {STAGE_LABELS[stage]}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Drag the handles below the chart to zoom into a narrower window.
            </p>
          </>
        )}
      </DashCard>

      <DashCard title="What this view shows">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-1.5">
              Available now
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>Daily pieces produced by stage and department, from the imported production log</li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-1.5">
              Not yet available
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>Target vs. actual variance - no production-target source exists yet</li>
            </ul>
          </div>
        </div>
      </DashCard>
    </div>
  );
}
