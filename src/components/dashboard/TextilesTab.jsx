import React from "react";
import KpiCard from "./KpiCard";
import DashCard from "./DashCard";
import ProgressBar from "./ProgressBar";
import StatusRow from "./StatusRow";

const kpis = [
  { label: "Revenue (MTD)", value: "₹14.2L" },
  { label: "Gross Margin", value: "52%", sub: "Healthy", status: "green" },
  { label: "Inventory Turnover", value: "4.2x", sub: "Good", status: "green" },
  { label: "Dead Stock", value: "₹2.8L", sub: "Action needed", status: "red" },
  { label: "Returns Rate", value: "3.1%", sub: "Watch", status: "amber" },
  { label: "Best Margin SKU", value: "Table linen", sub: "64% margin", status: "green" },
];

const marginBars = [
  { label: "Table linen", value: "64%", percent: 64, color: "#10b981" },
  { label: "Cushion covers", value: "55%", percent: 55, color: "#10b981" },
  { label: "Apparel", value: "48%", percent: 48, color: "#f59e0b" },
  { label: "Bed linen", value: "41%", percent: 41, color: "#f59e0b" },
  { label: "Export blends", value: "29%", percent: 29, color: "#ef4444" },
];

const inventoryHealth = [
  { label: "Fresh stock (<60 days)", status: "green", value: "₹8.4L" },
  { label: "Ageing stock (60–120 days)", status: "amber", value: "₹3.0L" },
  { label: "Dead stock (>120 days)", status: "red", value: "₹2.8L" },
  { label: "Seasonal stock (upcoming)", status: "amber", value: "₹1.6L — plan now" },
];

export default function TextilesTab() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase mb-3">
          Textiles & Lifestyle Division
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
        </div>
      </div>

      <DashCard title="Margin by Product Category">
        {marginBars.map((b) => <ProgressBar key={b.label} {...b} />)}
      </DashCard>

      <DashCard title="Inventory Health">
        {inventoryHealth.map((i) => <StatusRow key={i.label} {...i} />)}
      </DashCard>
    </div>
  );
}