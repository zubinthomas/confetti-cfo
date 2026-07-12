import React from "react";
import { useParams, Navigate } from "react-router-dom";
import DashCard from "./DashCard";
import { ClipboardList, ShieldAlert, Flame, HardHat, Truck, Database } from "lucide-react";

// The five manager views from the "Manager Dashboard Format" brief. No data
// source is connected for these yet (the current extracts cover P&L and store
// sales only), so each page documents what it will show once production /
// QC / dispatch data is captured.
const SECTIONS = {
  production: {
    icon: ClipboardList,
    title: "Daily Production",
    shows: "Target vs actual output by department",
    metrics: [
      "Daily production target per department (Pottery, Batik, Stitching)",
      "Actual pieces produced vs target",
      "Variance trend by week and department",
    ],
  },
  quality: {
    icon: ShieldAlert,
    title: "Rejection & QC",
    shows: "Rejection %, defect reasons, department-wise defects",
    metrics: [
      "Rejection percentage by department and batch",
      "Defect reasons (top Pareto)",
      "Department-wise defect counts over time",
    ],
  },
  "kiln-energy": {
    icon: Flame,
    title: "Kiln & Energy",
    shows: "Kiln loads, firing success, electricity/gas per piece",
    metrics: [
      "Kiln loads per day and utilisation",
      "Firing success rate",
      "Electricity & gas consumption per piece",
    ],
  },
  labour: {
    icon: HardHat,
    title: "Labour Efficiency",
    shows: "Output per person per day, absenteeism, training needs",
    metrics: [
      "Output per person per day by department",
      "Absenteeism rate (ties into the HR module)",
      "Training needs flagged by supervisors",
    ],
  },
  orders: {
    icon: Truck,
    title: "Orders & Dispatch",
    shows: "Client order status, delayed SKUs, ready stock",
    metrics: [
      "Open client orders and their status",
      "Delayed SKUs and days overdue",
      "Ready stock available for dispatch",
    ],
  },
};

export default function OpsPage() {
  const { section } = useParams();
  const cfg = SECTIONS[section];
  if (!cfg) return <Navigate to="/" replace />;
  const Icon = cfg.icon;

  return (
    <div className="space-y-6">
      <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
        Operations — Manager Dashboard
      </p>

      <DashCard>
        <div className="flex flex-col items-center text-center py-10">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <Icon className="w-7 h-7 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold font-heading text-foreground">{cfg.title}</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">{cfg.shows}</p>
          <div className="flex items-center gap-1.5 mt-4 text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-3 py-1.5 rounded-full">
            <Database className="w-3.5 h-3.5" />
            No data source connected yet
          </div>
        </div>
      </DashCard>

      <DashCard title="This view will show">
        <ul className="space-y-2">
          {cfg.metrics.map((m) => (
            <li key={m} className="flex items-start gap-2 text-sm text-muted-foreground">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
              {m}
            </li>
          ))}
        </ul>
      </DashCard>

      <p className="text-xs text-muted-foreground">
        The current data extracts cover the P&L workbooks and store sales analysis. Once daily
        production, QC, kiln and dispatch logs are captured (spreadsheet or direct entry), this page
        can be wired up the same way as the finance views.
      </p>
    </div>
  );
}
