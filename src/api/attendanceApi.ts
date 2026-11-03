// Biometric attendance (server/routes/attendance.ts). Read-only, backed by
// the imported attendance_records table - no manual create/edit UI, same
// shape as rosterApi.ts.
import { get } from "./http";

export interface AttendanceRow {
  id: string;
  employeeName: string;
  employeeId: string | null;
  date: string;
  statusCode: string;
  statusLabel: string;
  inTime: string | null;
  outTime: string | null;
  durationMinutes: number | null;
  lateByMinutes: number | null;
  earlyByMinutes: number | null;
  overtimeMinutes: number | null;
  missedInPunch: boolean;
  missedOutPunch: boolean;
  punchRecords: string | null;
  source: string;
}

export interface EmployeeMonthSummary {
  employeeName: string;
  employeeId: string | null;
  present: number;
  halfDay: number;
  absent: number;
  weeklyOff: number;
  weeklyOffWorked: number;
  lateCount: number;
  totalLateMinutes: number;
  totalOvertimeMinutes: number;
  missedPunches: number;
}

export interface AttendanceMonth {
  month: string | null;
  months: string[];
  rows: AttendanceRow[];
  summary: EmployeeMonthSummary[];
}

export const getAttendance = (month?: string) =>
  get<AttendanceMonth>(`/attendance${month ? `?month=${encodeURIComponent(month)}` : ""}`);
