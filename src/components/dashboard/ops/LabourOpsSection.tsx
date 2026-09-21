import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Loader2 } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import { getLabourSummary, type LabourSummary } from "@/api/opsApi";

function weekdayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

export default function LabourOpsSection() {
  const [selectedWeek, setSelectedWeek] = useState<string | undefined>(undefined);
  const [data, setData] = useState<LabourSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getLabourSummary(selectedWeek)
      .then((d) => {
        setData(d);
        if (!selectedWeek && d.week) setSelectedWeek(d.week);
      })
      .catch((err: Error) => setError(err.message || "Failed to load roster data"));
  }, [selectedWeek]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading roster data…
      </div>
    );
  }

  if (data.coverage.length === 0) {
    return (
      <DashCard>
        <p className="text-sm text-muted-foreground">
          No roster data imported yet. Upload a weekly roster workbook from Data → Import.
        </p>
      </DashCard>
    );
  }

  const byDate = new Map<string, number>();
  for (const c of data.coverage) byDate.set(c.date, (byDate.get(c.date) ?? 0) + c.count);
  const dailyTotals = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, total]) => ({ date, label: weekdayLabel(date), total }));

  const byArea = new Map<string, number>();
  for (const c of data.coverage) byArea.set(c.functionalArea, (byArea.get(c.functionalArea) ?? 0) + c.count);
  const areaTotals = [...byArea.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      {data.weeks.length > 1 && (
        <div className="flex gap-1.5 flex-wrap">
          {data.weeks.map((w) => (
            <button
              key={w}
              onClick={() => setSelectedWeek(w)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                w === data.week
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              Week of {w}
            </button>
          ))}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Planned staffing by functional area and day, from the weekly roster - not actual attendance
        or output-per-person efficiency.
      </p>

      <DashCard title="Scheduled headcount by day">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={dailyTotals}>
            <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </DashCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashCard title="Scheduled person-days by functional area">
          <div className="space-y-2">
            {areaTotals.map(([area, count]) => (
              <div key={area} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{area}</span>
                <span className="font-medium text-foreground">{count}</span>
              </div>
            ))}
          </div>
        </DashCard>

        <DashCard title="Weekly off by day">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.weeklyOffs}>
              <XAxis dataKey="weeklyOffDay" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </DashCard>
      </div>

      <DashCard title="What this view shows">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-1.5">
              Available now
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>Planned staffing/coverage by functional area and day</li>
              <li>Weekly-off distribution across the team</li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-1.5">
              Not yet available
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>Output per person per day - needs an actual attendance/check-in source; the roster is a plan, not a log</li>
              <li>Absenteeism rate - same reason</li>
              <li>Training needs flagged by supervisors</li>
            </ul>
          </div>
        </div>
      </DashCard>
    </div>
  );
}
