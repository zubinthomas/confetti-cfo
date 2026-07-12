import React from "react";
import KpiCard from "./KpiCard";
import DashCard from "./DashCard";
import PLRow from "./PLRow";
import { Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from "recharts";

const kpis = [
  { label: "Current Cash", value: "₹11.4L", sub: "Today", status: "green" },
  { label: "30-Day Projection", value: "₹8.2L", sub: "Tightens — watch", status: "amber" },
  { label: "90-Day Projection", value: "₹13.7L", sub: "Recovers", status: "green" },
  { label: "WC Requirement", value: "₹6.5L", sub: "Next 30 days", status: "amber" },
];

const outflows = [
  { label: "Payroll", value: "₹8.4L", status: "red" },
  { label: "GST", value: "₹3.2L", status: "amber" },
  { label: "Vendor Payments", value: "₹9.1L", status: "red" },
  { label: "Rent", value: "₹1.8L", status: "amber" },
  { label: "Loan EMI", value: "₹2.4L", status: "amber" },
  { label: "Utilities", value: "₹0.9L" },
];

const forecastData = [
  { period: "Now", collections: 0, outflows: 0, balance: 11.4 },
  { period: "Month 1", collections: 22.6, outflows: 25.8, balance: 8.2 },
  { period: "Month 2", collections: 28.4, outflows: 24.2, balance: 12.4 },
  { period: "Month 3", collections: 32.1, outflows: 22.8, balance: 13.7 },
];

const CustomTooltip = ({ active = false, payload = [], label = "" }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
      <p className="text-xs font-medium text-foreground mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-xs text-muted-foreground">
          <span style={{ color: p.color || p.stroke }}>●</span> {p.name}: ₹{p.value}L
        </p>
      ))}
    </div>
  );
};

export default function CashFlowTab() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-3">
          Cash Flow Dashboard
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
        </div>
      </div>

      <DashCard title="Next 30 Days — Outflows">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          {outflows.map((o) => {
            const color = o.status === "red"
              ? "text-red-600 dark:text-red-400"
              : o.status === "amber"
                ? "text-amber-600 dark:text-amber-400"
                : "text-foreground";
            return (
              <div key={o.label} className="bg-muted rounded-lg p-3">
                <p className="text-xs text-muted-foreground mb-1">{o.label}</p>
                <p className={`text-lg font-semibold ${color}`}>{o.value}</p>
              </div>
            );
          })}
        </div>
        <div className="space-y-0">
          <PLRow label="Total outflows" value="₹25.8L" status="red" />
          <PLRow label="Expected collections" value="₹22.6L" status="green" />
          <PLRow label="Net 30-day position" value="−₹3.2L (from current cash)" status="amber" isTotal />
        </div>
      </DashCard>

      <DashCard title="90-Day Cash Forecast">
        <div className="flex flex-wrap gap-4 mb-3">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#10b981" }} /> Collections
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: "#ef4444" }} /> Outflows
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-sm border border-blue-400" style={{ backgroundColor: "transparent" }} /> Cash Balance
          </span>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={forecastData}>
            <XAxis dataKey="period" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${v}L`} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="collections" name="Collections" stroke="#10b981" fill="#10b98115" strokeWidth={2} />
            <Area type="monotone" dataKey="outflows" name="Outflows" stroke="#ef4444" fill="#ef444410" strokeWidth={2} />
            <Line type="monotone" dataKey="balance" name="Cash Balance" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 4, fill: "#3b82f6" }} />
          </AreaChart>
        </ResponsiveContainer>
      </DashCard>
    </div>
  );
}