// Read-only query helpers over `attendance_records`, feeding the HR
// Attendance tab (src/components/hr/AttendanceTab.tsx). Data only ever
// arrives via server/db/importEsslAttendance.ts - there is no write surface
// here. This is ACTUAL attendance, not the planned schedule - see
// server/db/schema.ts's shiftRoster comment for that distinction. Modeled
// directly on shiftRoster.ts.
import { db, ready, schema } from './client.ts';

export type AttendanceRow = typeof schema.attendanceRecords.$inferSelect;

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

export async function availableMonths(): Promise<string[]> {
  await ready();
  const rows = await db.select({ date: schema.attendanceRecords.date }).from(schema.attendanceRecords);
  return [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort();
}

/** Every row for one month ('YYYY-MM', defaults to the most recent with data). */
export async function monthAttendance(month?: string): Promise<AttendanceRow[]> {
  await ready();
  const target = month ?? (await availableMonths()).at(-1);
  if (!target) return [];
  const rows = await db.select().from(schema.attendanceRecords);
  return rows.filter((r) => r.date.startsWith(target));
}

/** Per-employee rollup for the same month, computed from monthAttendance
 *  rather than stored - a pure aggregate, same reasoning as
 *  shiftRoster.ts's coverageByFunctionalArea. */
export function monthlySummary(rows: AttendanceRow[]): EmployeeMonthSummary[] {
  const byEmployee = new Map<string, EmployeeMonthSummary>();
  for (const r of rows) {
    let s = byEmployee.get(r.employeeName);
    if (!s) {
      s = {
        employeeName: r.employeeName, employeeId: r.employeeId,
        present: 0, halfDay: 0, absent: 0, weeklyOff: 0, weeklyOffWorked: 0,
        lateCount: 0, totalLateMinutes: 0, totalOvertimeMinutes: 0, missedPunches: 0,
      };
      byEmployee.set(r.employeeName, s);
    }
    switch (r.statusCode.trim()) {
      case 'P': s.present++; break;
      case '½P': s.halfDay++; break;
      case 'A': s.absent++; break;
      case 'WO': s.weeklyOff++; break;
      case 'WOP': case 'WO½P': s.weeklyOffWorked++; break;
    }
    if ((r.lateByMinutes ?? 0) > 0) { s.lateCount++; s.totalLateMinutes += r.lateByMinutes!; }
    s.totalOvertimeMinutes += r.overtimeMinutes ?? 0;
    if (r.missedInPunch || r.missedOutPunch) s.missedPunches++;
  }
  return [...byEmployee.values()].sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}
