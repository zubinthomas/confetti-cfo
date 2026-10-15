import type { ImportBatch } from "@/api/importApi";

export const IMPORT_KIND_LABELS: Record<ImportBatch["kind"], string> = {
  cepl: "CEPL P&L",
  cafe: "Cafe Weekly P&L",
  sienna: "Sienna Store Sales",
  hr: "HR Mastersheet",
  target: "FY Target Plan",
  fnbMonthly: "Monthly F&B P&L",
  fnbWeekly: "Weekly F&B P&L",
  tally: "Tally sync",
  potteryProduction: "Pottery Production Log",
  shiftRoster: "Weekly Shift Roster",
  orders: "Orders & Dispatch Log",
};
