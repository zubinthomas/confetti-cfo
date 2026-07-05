import React from "react";
import KpiCard from "./KpiCard";
import DashCard from "./DashCard";
import PLRow from "./PLRow";
import ProgressBar from "./ProgressBar";
import StatusRow from "./StatusRow";

const kpis = [
  { label: "Revenue (MTD)", value: "₹18.4L" },
  { label: "Gross Margin", value: "47%", sub: "Target 40–60%", status: "green" },
  { label: "EBITDA", value: "18.2%", sub: "Above 15% target", status: "green" },
  { label: "Inventory Days", value: "72d", sub: "Within 90-day target", status: "green" },
  { label: "Receivable Days", value: "42d", sub: "Watch", status: "amber" },
  { label: "Cash Conv. Cycle", value: "56d", sub: "Target <60d", status: "amber" },
];

const plRows = [
  { label: "Revenue", value: "₹18.4L" },
  { label: "Raw material", value: "−₹5.2L", status: "red" },
  { label: "Fuel / energy", value: "−₹1.8L", status: "red" },
  { label: "Labour", value: "−₹2.4L", status: "red" },
  { label: "Packaging", value: "−₹0.4L", status: "red" },
  { label: "Freight", value: "−₹0.9L", status: "red" },
  { label: "Gross profit", value: "₹7.7L (47%)", status: "green", isTotal: true },
];

const costBars = [
  { label: "Raw material", value: "52%", percent: 52, color: "#3b82f6" },
  { label: "Fuel / energy", value: "18%", percent: 18, color: "#ef4444" },
  { label: "Labour", value: "24%", percent: 24, color: "#10b981" },
  { label: "Packaging", value: "4%", percent: 4, color: "#f59e0b" },
  { label: "Freight", value: "9%", percent: 9, color: "#8b5cf6" },
];

const alerts = [
  { label: "Low-margin SKUs", status: "amber", value: "3 items" },
  { label: "Dead stock", status: "red", value: "₹1.2L" },
  { label: "Low-profit customers", status: "amber", value: "2 accounts" },
];

export default function CeramicsTab() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-3">
          Ceramics Manufacturing Division
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashCard title="P&L Breakdown">
          {plRows.map((r) => <PLRow key={r.label} {...r} />)}
        </DashCard>

        <div className="space-y-4">
          <DashCard title="Cost Composition">
            {costBars.map((b) => (
              <ProgressBar key={b.label} {...b} />
            ))}
          </DashCard>

          <DashCard title="Margin Alerts">
            {alerts.map((a) => <StatusRow key={a.label} {...a} />)}
          </DashCard>
        </div>
      </div>
    </div>
  );
}