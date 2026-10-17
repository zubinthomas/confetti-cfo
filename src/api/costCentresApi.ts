// Cost-centre master review/assignment (server/routes/costCentres.ts).
import { get, put, del } from "./http";

export type CostCentreMemberKind = "businessUnit" | "channel" | "vendor";

export interface CostCentreTarget {
  kind: CostCentreMemberKind;
  targetId: number;
  /** "Business / name", e.g. "CEPL / Bar". */
  name: string;
}

export interface CostCentreView {
  id: number;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  members: (CostCentreTarget & { memberId: number })[];
}

export interface CostCentreOverview {
  centres: CostCentreView[];
  excluded: (CostCentreTarget & { memberId: number; reason: string })[];
  /** Targets with no decision yet. */
  unassigned: CostCentreTarget[];
}

export const getCostCentres = () => get<CostCentreOverview>("/cost-centres");

export const assignToCostCentre = (target: Pick<CostCentreTarget, "kind" | "targetId">, costCentreId: number) =>
  put("/cost-centres/members", { ...target, costCentreId });

export const excludeFromCostCentres = (target: Pick<CostCentreTarget, "kind" | "targetId">, exclusionReason: string) =>
  put("/cost-centres/members", { ...target, exclusionReason });

export const returnToUndecided = (memberId: number) =>
  del<{ message: string }>(`/cost-centres/members/${memberId}`);
