import React, { useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Loader2 } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import { getKilnSummary, type KilnSummary } from "@/api/opsApi";
import { fyOf, fyLabel } from "@/components/dashboard/ops/fiscalYear";

export default function KilnEnergyOpsSection() {
  const [data, setData] = useState<KilnSummary | null>(null);
  const [error, setError] = useState("");
  const [selectedFy, setSelectedFy] = useState<string | null>(null);

  useEffect(() => {
    getKilnSummary()
      .then(setData)
      .catch((err: Error) => setError(err.message || "Failed to load kiln data"));
  }, []);

  const availableFys = useMemo(() => {
    if (!data) return [];
    const years = new Set<string>();
    for (const r of data.kilnLoads) years.add(fyOf(r.date));
    for (const r of data.firingTypes) years.add(fyOf(r.date));
    return [...years].sort();
  }, [data]);
  const fy = selectedFy ?? availableFys.at(-1);

  const loadsByKiln = useMemo(() => {
    if (!data || !fy) return [];
    const counts = new Map<string, number>();
    for (const r of data.kilnLoads) {
      if (fyOf(r.date) !== fy) continue;
      counts.set(r.kiln, (counts.get(r.kiln) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([kiln, loads]) => ({ kiln, loads }))
      .sort((a, b) => a.kiln.localeCompare(b.kiln));
  }, [data, fy]);

  const firingTypeCounts = useMemo(() => {
    if (!data || !fy) return [];
    const counts = new Map<string, number>();
    for (const r of data.firingTypes) {
      if (fyOf(r.date) !== fy) continue;
      counts.set(r.firingType, (counts.get(r.firingType) ?? 0) + 1);
    }
    return [...counts.entries()].map(([firingType, count]) => ({ firingType, count }));
  }, [data, fy]);

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashCard title="Kiln loads by kiln">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={loadsByKiln}>
              <XAxis dataKey="kiln" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="loads" fill="#3b82f6" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-2">
            A "load" here is an approximation - one distinct kiln used on one day, since the source
            log doesn't mark discrete firing batches beyond that.
          </p>
        </DashCard>

        <DashCard title="Firing type mix">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={firingTypeCounts} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="firingType" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={70} />
              <Tooltip />
              <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} isAnimationActive={false} />
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
              <li>Kiln loads and utilisation by kiln (approximate, see note above)</li>
              <li>Firing type mix (Bisque / Glaze / Decal)</li>
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
