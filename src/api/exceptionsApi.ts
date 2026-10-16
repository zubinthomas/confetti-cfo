// Owner/deadline/note assignment for a named recurring exception
// (server/routes/exceptions.ts) - see ExceptionAssignmentPanel.tsx.
import { get, patch } from "./http";
import type { ExceptionAssignment } from "@/data/types";

export const listExceptionAssignments = () =>
  get<ExceptionAssignment[]>("/exceptions");

export const assignException = (
  exceptionKey: string,
  input: { ownerUserId?: number | null; deadline?: string | null; note?: string | null }
) => patch<ExceptionAssignment>(`/exceptions/${exceptionKey}/assign`, input);
