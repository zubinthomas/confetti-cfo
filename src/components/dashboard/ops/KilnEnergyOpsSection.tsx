import React, { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Brush, ResponsiveContainer } from "recharts";
import { Loader2 } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import { getKilnSummary, type KilnSummary, type DailyKilnLoad, type DailyFiringType } from "@/api/opsApi";
import { fyOf, fyLabel } from "@/components/dashboard/ops/fiscalYear";

function shortDateTick(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });
}

function fullDateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" });
}

const KILN_ORDER = ["EK1", "EK2", "EK3", "GK1", "GK2"] as const;
// Fixed order, distinct hues per kiln - not cycled - so a kiln keeps the same
// color across the chart regardless of which others fired that day.
const KILN_COLORS: Record<string, string> = {
  EK1: "#0072B2",
  EK2: "#D55E00",
  EK3: "#009E73",
  GK1: "#E69F00",
  GK2: "#CC79A7",
};

const FIRING_TYPE_ORDER = ["Bisque", "Glaze", "Decal"] as const;
const FIRING_TYPE_COLORS: Record<string, string> = {
  Bisque: "#f59e0b",
  Glaze: "#3b82f6",
  Decal: "#8b5cf6",
};

function pivotDaily(kilnLoads: DailyKilnLoad[], firingTypes: DailyFiringType[]) {
  const byDate = new Map<string, Record<string, number | string>>();
  for (const r of kilnLoads) {
    const row = byDate.get(r.date) ?? { date: r.date };
    row[r.kiln] = (Number(row[r.kiln]) || 0) + 1;
    byDate.set(r.date, row);
  }
  for (const r of firingTypes) {
    const row = byDate.get(r.date) ?? { date: r.date };
    row[r.firingType] = (Number(row[r.firingType]) || 0) + 1;
    byDate.set(r.date, row);
  }
  return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export default function KilnEnergyOpsSection() {
  const [data, setData] = useState<KilnSummary | null>(null);
  const [error, setError] = useState("");
  const [selectedFy, setSelectedFy] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    getKilnSummary()
      .then(setData)
      .catch((err: Error) => setError(err.message || "Failed to load kiln data"));
  }, []);

  // Same FY-scoping rationale as the Daily Production chart: the visible
  // range grows unbounded as more days get imported, so this pivots to one
  // row per day (like pivotDaily in ProductionOpsSection) and scopes to a
  // fiscal year at a time via the same chiclets.
  const allPivoted = useMemo(
    () => (data ? pivotDaily(data.kilnLoads, data.firingTypes) : []),
    [data],
  );
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

  useEffect(() => {
    if (chartData.length === 0) return;
    setFromDate(String(chartData[0].date));
    setToDate(String(chartData[chartData.length - 1].date));
    // Only re-run when the selected fiscal year itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fy]);

  // See the matching comment in ProductionOpsSection.tsx: the Brush must
  // slice the same array the chart itself renders (chartData, not the
  // date-filtered rangedData), with startIndex/endIndex controlled from
  // fromDate/toDate, or the handles jump mid-drag.
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
        <Loader2 className="w-4 h-4 animate-spin" /> Loading kiln data…
      </div>
    );
  }

  if (data.kilnLoads.length === 0) {
    return (
      <DashCard>
        <p className="text-sm text-muted-foreground">
          No firing data imported yet. Upload the daily production workbook from Data → Import.
        </p>
      </DashCard>
    );
  }

  const dateRangePicker = (
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
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Kiln &amp; energy
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

      {rangedData.length === 0 ? (
        <DashCard>
          <p className="text-sm text-muted-foreground text-center py-8">No firing data in the selected date range.</p>
        </DashCard>
      ) : (
        // One card, one date-range control, two charts inside it - both
        // charts are driven by the same fromDate/toDate state and the one
        // Brush below the first chart, so they're grouped visually rather
        // than left as two separate cards with a caption explaining the link.
        <DashCard title="Daily kiln activity" action={dateRangePicker}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Kiln loads by kiln
          </p>
          {/* Same fixed-width-scroll-container + Brush setup as the Daily
              Production chart - see the comments there for why the width
              and Brush data are pinned to chartData rather than rangedData. */}
          <div className="overflow-x-auto -mx-1 px-1">
            <div style={{ minWidth: Math.max(chartData.length * 16, 280) }}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData}>
                  <XAxis dataKey="date" tickFormatter={shortDateTick} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip labelFormatter={(v) => fullDateLabel(String(v))} />
                  {KILN_ORDER.map((kiln) => (
                    <Bar key={kiln} dataKey={kiln} name={kiln} stackId="kiln" fill={KILN_COLORS[kiln]} maxBarSize={40} isAnimationActive={false} />
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
            {KILN_ORDER.map((kiln) => (
              <span key={kiln} className="flex items-center gap-1.5 text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: KILN_COLORS[kiln] }} />
                {kiln}
              </span>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            A "load" here is an approximation - one distinct kiln used on one day, since the source
            log doesn't mark discrete firing batches beyond that. Drag the handles below the chart
            above to zoom both charts on this card into a narrower window.
          </p>

          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 mt-6 pt-6 border-t border-border">
            Firing type mix
          </p>
          <div className="overflow-x-auto -mx-1 px-1">
            <div style={{ minWidth: Math.max(chartData.length * 16, 280) }}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={rangedData}>
                  <XAxis dataKey="date" tickFormatter={shortDateTick} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip labelFormatter={(v) => fullDateLabel(String(v))} />
                  {FIRING_TYPE_ORDER.map((ft) => (
                    <Bar key={ft} dataKey={ft} name={ft} stackId="firingType" fill={FIRING_TYPE_COLORS[ft]} maxBarSize={40} isAnimationActive={false} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-3 text-xs">
            {FIRING_TYPE_ORDER.map((ft) => (
              <span key={ft} className="flex items-center gap-1.5 text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: FIRING_TYPE_COLORS[ft] }} />
                {ft}
              </span>
            ))}
          </div>
        </DashCard>
      )}

      <DashCard title="What this view shows">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-1.5">
              Available now
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>Daily kiln loads and utilisation by kiln (approximate, see note above)</li>
              <li>Daily firing type mix (Bisque / Glaze / Decal)</li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-1.5">
              Not yet available
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>Firing success rate - no pass/fail field exists in the source</li>
              <li>Electricity/gas consumption per piece - no energy data is captured</li>
            </ul>
          </div>
        </div>
      </DashCard>
    </div>
  );
}
