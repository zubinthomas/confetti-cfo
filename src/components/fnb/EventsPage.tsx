import React, { useMemo } from "react";
import KpiCard from "@/components/dashboard/KpiCard";
import DashCard from "@/components/dashboard/DashCard";
import ChartTooltip from "@/components/dashboard/ChartTooltip";
import PageSpinner from "@/components/dashboard/PageSpinner";
import { useFabMonthly } from "@/hooks/useFabMonthly";
import { useAllOutlets } from "@/hooks/useAllOutlets";
import { useCafeEarlyWeekly } from "@/hooks/useCafeEarlyWeekly";
import { MONTHS, L, sum } from "@/data/seriesKernel";
import type { KpiData } from "@/components/dashboard/KpiCard";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

export default function EventsPage() {
  const fab = useFabMonthly();
  const outlets = useAllOutlets();
  const early = useCafeEarlyWeekly();

  const view = useMemo(() => {
    if (!fab || !outlets || !early) return null;
    const fyEvents = sum(fab.eventCatering);
    const bestMonthIdx = fab.eventCatering.indexOf(Math.max(...fab.eventCatering));
    return {
      kpis: [
        { label: "Event & Catering (FY)", value: `₹${L(fyEvents)}`, sub: `${((fyEvents / sum(fab.totalRevenue)) * 100).toFixed(1)}% of F&B revenue`, status: "green" },
        { label: "Event Sales (Sep–Jan)", value: `₹${L(sum(outlets.outlets.total.events))}`, sub: "Weekly cafe workbook detail" },
        { label: "Event Sales (Apr–Aug)", value: `₹${L(sum(early.weekly.eventSales))}`, sub: "Whole-cafe weekly detail" },
        { label: "Best Month", value: MONTHS[bestMonthIdx], sub: `₹${L(fab.eventCatering[bestMonthIdx])}`, status: "green" },
        { label: "Durga Puja 2025", value: `₹${L(outlets.durgaPuja.totalSales)}`, sub: `₹${L(outlets.durgaPuja.pl)} P&L over the two festival weeks`, status: "green" },
      ] satisfies KpiData[],
      monthly: MONTHS.map((m, i) => ({ month: m, "Event & Catering Revenue": fab.eventCatering[i] })),
      weekly: outlets.weeks.map((w, i) => ({ week: w.short, "Event Sales": outlets.outlets.total.events[i] })),
      earlyWeekly: early.weeks.map((w, i) => ({ week: w.short, "Event Sales": early.weekly.eventSales[i] })),
      eventsBreakdown: outlets.eventsBreakdown,
    };
  }, [fab, outlets, early]);

  if (!view) return <PageSpinner />;
  const { kpis, monthly, weekly, earlyWeekly, eventsBreakdown: EVENTS_BREAKDOWN } = view;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-3">
          Events & Catering · FY 2025-26
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
        </div>
      </div>

      <DashCard title="Monthly Event & Catering Revenue (F&B P&L line, full FY)">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={monthly}>
            <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="Event & Catering Revenue" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </DashCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashCard title="Weekly Event Sales (Sep 2025 onwards)">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={weekly}>
              <XAxis dataKey="week" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={1} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey="Event Sales" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2.5 }} />
            </LineChart>
          </ResponsiveContainer>
        </DashCard>

        <DashCard title="Event Revenue by Source (Sep 2025 onwards)">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={EVENTS_BREAKDOWN} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={170} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="value" name="Revenue" fill="#f59e0b" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </DashCard>
      </div>

      <DashCard title="Whole-Cafe Weekly Event Sales - Apr–Aug 2025 (before the outlet split)">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={earlyWeekly}>
            <XAxis dataKey="week" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={1} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="Event Sales" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-xs text-muted-foreground mt-2">
          Event weeks are naturally sparse (events don&rsquo;t happen every week) - only 8 of these 22
          weeks report event sales. No by-source breakdown exists for this period, only the combined
          weekly total (no Cafe / Restaurant / Rannaghor split existed yet).
        </p>
      </DashCard>

      <p className="text-xs text-muted-foreground">
        The monthly series is the F&B department&rsquo;s &ldquo;Event &amp; Catering Receipt&rdquo; P&L line.
        The weekly views and the by-source breakdown come from the cafe workbook&rsquo;s &ldquo;Sales from
        Events&rdquo; section - September 2025 onwards is split by outlet, April–August 2025 is
        whole-cafe only - most event revenue flows through the Rannaghor events kitchen and named
        one-off events.
      </p>
    </div>
  );
}
