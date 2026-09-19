// Atomic HR operations that aren't plain entity CRUD - hiring an applicant
// (server/routes/recruitmentHire.ts) and offboarding an employee
// (server/routes/offboarding.ts). Both create/update two entities in one
// transaction server-side.
import { get, post, patch } from "./http";
import type { EntityRecord } from "./entities";

export const hireApplicant = (recruitmentId: string, employee: Record<string, unknown>) =>
  post<{ employee: EntityRecord; recruitment: EntityRecord }>(`/recruitment/${recruitmentId}/hire`, employee);

export interface OffboardInput {
  exit_type: "resignation" | "termination" | "end_of_contract";
  notice_date?: string;
  last_working_date?: string;
  reason?: string;
  exit_interview_notes?: string;
  assets_returned?: boolean;
  full_settlement_done?: boolean;
  rehire_eligible?: boolean;
  settlement_amount?: number | null;
}

// Submitting moves the employee to "Notice Period" and creates a pending
// employee_exits row; approve/reject is gated server-side to the
// employee's manager chain; finalize (only once approved) sets the
// terminal status and deactivates the linked login, if any.
export const offboardEmployee = (employeeId: string, input: OffboardInput) =>
  post<{ exit: EntityRecord; employee: EntityRecord }>(`/employees/${employeeId}/offboard`, input);

export const approveOffboarding = (exitId: string) =>
  post<{ exit: EntityRecord; employee: EntityRecord }>(`/employees/exits/${exitId}/approve`, {});

export const rejectOffboarding = (exitId: string) =>
  post<{ exit: EntityRecord; employee: EntityRecord }>(`/employees/exits/${exitId}/reject`, {});

export const finalizeOffboarding = (exitId: string) =>
  post<{ exit: EntityRecord; employee: EntityRecord }>(`/employees/exits/${exitId}/finalize`, {});

// Onboarding stage tracking (server/routes/onboarding.ts) - camelCase, like
// the inventory ledger endpoints, since these are plain drizzle rows rather
// than routed through the generic entity CRUD's snake_case mapping.
export interface OnboardingRecord {
  id: string;
  createdDate: string;
  employeeId: string;
  division: string | null;
  stage: string | null;
  offerAcceptedAt: string | null;
  documentsCollectedAt: string | null;
  accountCreatedAt: string | null;
  idCardIssuedAt: string | null;
  orientationCompleteAt: string | null;
}

export const listOnboarding = () => get<OnboardingRecord[]>(`/employees/onboarding`);

export const getOnboarding = (employeeId: string) => get<OnboardingRecord>(`/employees/${employeeId}/onboarding`);

export const setOnboardingStage = (employeeId: string, field: string, completed: boolean) =>
  patch<OnboardingRecord>(`/employees/${employeeId}/onboarding`, { field, completed });
