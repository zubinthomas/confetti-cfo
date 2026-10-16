// The one manual write path onto revenue_targets (server/routes/revenueTargets.ts) -
// current-value reads go through useRevenueTargets instead (React Query,
// cached for the session).
import { get, post } from "./http";
import type { RevenueTargetRevision } from "@/data/types";

export const listRevenueTargetRevisions = (periodId: number, category: "store" | "fnb") =>
  get<RevenueTargetRevision[]>(`/revenue-targets/${periodId}/${category}/revisions`);

export const reviseRevenueTarget = (
  periodId: number,
  category: "store" | "fnb",
  input: { targetAmount: number; note?: string }
) => post<RevenueTargetRevision>(`/revenue-targets/${periodId}/${category}/revise`, input);
