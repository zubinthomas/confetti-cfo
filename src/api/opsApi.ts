// Ops dashboard data (server/routes/opsData.ts), fed by the imported
// production log / shift roster tables - read-only, no filters beyond the
// labour summary's optional week.
import { get } from "./http";

export interface DailyStageOutput { date: string; stage: "throwing" | "finishing" | "glazing" | "firing"; qty: number }
export interface ProductionKpis {
  totalPieces: number;
  daysCovered: number;
  avgPerDay: number;
  busiestStage: string | null;
}
export interface ProductionSummary { daily: DailyStageOutput[]; kpis: ProductionKpis }

export interface DailyKilnLoad { date: string; kiln: string }
export interface DailyFiringType { date: string; firingType: string }
export interface KilnSummary { kilnLoads: DailyKilnLoad[]; firingTypes: DailyFiringType[] }

export interface CoverageByArea { date: string; functionalArea: string; count: number }
export interface WeeklyOffCount { weeklyOffDay: string; count: number }
export interface LabourSummary {
  coverage: CoverageByArea[];
  weeklyOffs: WeeklyOffCount[];
  weeks: string[];
  week: string | null;
}

export const getProductionSummary = () => get<ProductionSummary>("/ops/production-summary");
export const getKilnSummary = () => get<KilnSummary>("/ops/kiln-summary");
export const getLabourSummary = (week?: string) => get<LabourSummary>(`/ops/labour-summary${week ? `?week=${encodeURIComponent(week)}` : ""}`);
