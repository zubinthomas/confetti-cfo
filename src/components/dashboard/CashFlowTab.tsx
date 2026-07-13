import React from "react";
import KpiCard from "./KpiCard";
import DashCard from "./DashCard";
import PLRow from "./PLRow";
import ChartTooltip from "./ChartTooltip";
import { CASHFLOW, OUTFLOW_CATEGORIES, GST_MEMO, CASH_GAPS } from "@/data/cashFlowData";
import { MONTHS, L, sum } from "@/data/core";
import type { KpiData } from "./KpiCard";
import type { PLRowData } from "./PLRow";
import { Database } from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";

const fyIn = sum(CASHFLOW.inflows);
const fyOut = sum(CASHFLOW.outflows);
const fyNet = fyIn - fyOut;
const bestIdx = CASHFLOW.net.indexOf(Math.max(...CASHFLOW.net));
const worstIdx = CASHFLOW.net.indexOf(Math.min(...CASHFLOW.net));
const negativeMonths = CASHFLOW.net.filter((v) => v < 0).length;

const kpis: KpiData[] = [
  { label: "Money In (FY 25-26)", value: `₹${L(fyIn)}`, sub: "All six departments' sales", status: "green" },
  { label: "Money Out (FY 25-26)", value: `₹${L(fyOut)}`, sub: "All reported expenses", status: "amber" },
  { label: "Net (FY 25-26)", value: `₹${L(fyNet)}`, sub: `${((fyNet / fyIn) * 100).toFixed(1)}% of inflows`, status: fyNet >= 0 ? "green" : "red" },
  { label: "Cash-negative Months", value: `${negativeMonths}/12`, sub: negativeMonths ? `Worst: ${MONTHS[worstIdx]} (₹${L(CASHFLOW.net[worstIdx])})` : "None", status: negativeMonths > 3 ? "red" : negativeMonths ? "amber" : "green" },
  { label: "Best Month", value: MONTHS[bestIdx], sub: `₹${L(CASHFLOW.net[bestIdx])} net`, status: "green" },
];

const monthly = MONTHS.map((m, i) => ({
  month: m,
  "Money In": CASHFLOW.inflows[i],
  "Money Out": CASHFLOW.outflows[i],
  "Cumulative Net": CASHFLOW.cumulative[i],
}));

const outflowRows: PLRowData[] = [...OUTFLOW_CATEGORIES]
  .sort((a, b) => b.total - a.total)
  .map((c) => ({
    label: c.label,
    value: `₹${L(c.total)} (${((c.total / fyOut) * 100).toFixed(1)}%)`,
    status: c.label === "Payroll & staff" || c.label === "Materials & purchases" ? "red" : undefined,
  }));

const outflowMonthly = MONTHS.map((m, i) => {
  const row: Record<string, string | number> = { month: m };
  for (const c of OUTFLOW_CATEGORIES) row[c.label] = c.monthly[i];
  return row;
});
const CAT_COLORS = ["#ef4444", "#f59e0b", "#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#ec4899", "#84cc16", "#94a3b8"];

export default function CashFlowTab() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-3">
          Group Money In / Money Out · FY 2025-26 (P&L basis)
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
        </div>
      </div>

      <DashCard title="Monthly Money In vs Out, with Cumulative Net">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={monthly}>
            <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="#e2e8f0" />
            <Bar dataKey="Money In" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Money Out" fill="#ef4444" radius={[4, 4, 0, 0]} />
            <Line type="monotone" dataKey="Cumulative Net" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </DashCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashCard title="Where the Money Goes (FY 2025-26)">
          {outflowRows.map((r) => <PLRow key={r.label} {...r} />)}
          <PLRow label="GST paid (memo)" value={`₹${L(GST_MEMO.total)}`} status="amber" />
          <p className="text-xs text-muted-foreground mt-3">
            Categories are the workbooks&rsquo; own cost lines summed across all six departments;
            &ldquo;Other operating costs&rdquo; is the remainder of reported total expenses. GST is a
            real cash outflow but the sheets report it outside their expense totals, so it&rsquo;s
            shown as a memo item rather than a slice of the 100%.
          </p>
        </DashCard>

        <DashCard title="Not Derivable From the Source Data">
          <div className="flex items-center gap-1.5 mb-3 text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-3 py-1.5 rounded-full w-fit">
            <Database className="w-3.5 h-3.5" />
            The workbooks are P&L statements — no balance-sheet data
          </div>
          <ul className="space-y-2">
            {CASH_GAPS.map((g) => (
              <li key={g} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                {g}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground mt-3">
            Until a bank/receivables source is connected, this page shows P&L-basis money movement
            rather than a true cash position or forecast.
          </p>
        </DashCard>
      </div>

      <DashCard title="Monthly Outflows by Category">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={outflowMonthly}>
            <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={L} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {OUTFLOW_CATEGORIES.map((c, i) => (
              <Bar key={c.label} dataKey={c.label} stackId="a" fill={CAT_COLORS[i % CAT_COLORS.length]}
                   radius={i === OUTFLOW_CATEGORIES.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </DashCard>
    </div>
  );
}
