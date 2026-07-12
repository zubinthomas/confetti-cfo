import React from "react";
import KpiCard from "@/components/dashboard/KpiCard";
import DashCard from "@/components/dashboard/DashCard";
import ChartTooltip from "@/components/dashboard/ChartTooltip";
import {
  FAB, MONTHS, OUTLETS, OUTLET_WEEKS, EVENTS_BREAKDOWN, DURGA_PUJA, L,
} from "@/data/financialData";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

const sum = (arr) => arr.reduce((a, b) => a + (b || 0), 0);

const fyEvents = sum(FAB.eventCatering);
const weeklyEvents = sum(OUTLETS.total.events);
const bestMonthIdx = FAB.eventCatering.indexOf(Math.max(...FAB.eventCatering));

const monthly = MONTHS.map((m, i) => ({ month: m, "Event & Catering Revenue": FAB.eventCatering[i] }));
const weekly = OUTLET_WEEKS.map((w, i) => ({ week: w.short, "Event Sales": OUTLETS.total.events[i] }));

const kpis = [
  { label: "Event & Catering (FY)", value: `₹${L(fyEvents)}`, sub: `${((fyEvents / sum(FAB.totalRevenue)) * 100).toFixed(1)}% of F&B revenue`, status: "green" },
  { label: "Event Sales (Sep–Jan)", value: `₹${L(weeklyEvents)}`, sub: "Weekly cafe workbook detail" },
  { label: "Best Month", value: MONTHS[bestMonthIdx], sub: `₹${L(FAB.eventCatering[bestMonthIdx])}`, status: "green" },
  { label: "Durga Puja 2025", value: `₹${L(DURGA_PUJA.totalSales)}`, sub: `₹${L(DURGA_PUJA.pl)} P&L over the two festival weeks`, status: "green" },
];

export default function EventsPage() {
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

      <p className="text-xs text-muted-foreground">
        The monthly series is the F&B department&rsquo;s &ldquo;Event &amp; Catering Receipt&rdquo; P&L line.
        The weekly view and the by-source breakdown come from the cafe workbook&rsquo;s &ldquo;Sales from
        Events&rdquo; section (September 2025 onwards) — most event revenue flows through the Rannaghor
        events kitchen and named one-off events.
      </p>
    </div>
  );
}
