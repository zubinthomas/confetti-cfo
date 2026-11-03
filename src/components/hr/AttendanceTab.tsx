import React, { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import { getAttendance, type AttendanceRow, type EmployeeMonthSummary } from "@/api/attendanceApi";

function monthLabel(ym: string): string {
  const d = new Date(`${ym}-01T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

interface EmployeeDays {
  employeeName: string;
  rows: AttendanceRow[];
}

export default function AttendanceTab() {
  const [selectedMonth, setSelectedMonth] = useState<string | undefined>(undefined);
  const [months, setMonths] = useState<string[]>([]);
  const [rows, setRows] = useState<AttendanceRow[] | null>(null);
  const [summary, setSummary] = useState<EmployeeMonthSummary[]>([]);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    getAttendance(selectedMonth)
      .then((r) => {
        setRows(r.rows);
        setMonths(r.months);
        setSummary(r.summary);
        if (!selectedMonth && r.month) setSelectedMonth(r.month);
      })
      .catch((err: Error) => setError(err.message || "Failed to load attendance"));
  }, [selectedMonth]);

  const daysByEmployee = useMemo(() => {
    if (!rows) return new Map<string, EmployeeDays>();
    const m = new Map<string, EmployeeDays>();
    for (const r of rows) {
      let e = m.get(r.employeeName);
      if (!e) { e = { employeeName: r.employeeName, rows: [] }; m.set(r.employeeName, e); }
      e.rows.push(r);
    }
    for (const e of m.values()) e.rows.sort((a, b) => a.date.localeCompare(b.date));
    return m;
  }, [rows]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!rows) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading attendance…
      </div>
    );
  }

  return (
    <DashCard>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No attendance data imported yet. Run the eSSL biometric import
          (server/db/importEsslAttendance.ts) to populate this tab.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div className="flex gap-1.5 flex-wrap">
              {months.map((m) => (
                <button
                  key={m}
                  onClick={() => { setSelectedMonth(m); setExpanded(null); }}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    m === selectedMonth
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {monthLabel(m)}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-4 font-medium">Employee</th>
                  <th className="text-right py-2 pr-4 font-medium">Present</th>
                  <th className="text-right py-2 pr-4 font-medium">Half day</th>
                  <th className="text-right py-2 pr-4 font-medium">Absent</th>
                  <th className="text-right py-2 pr-4 font-medium">Weekly off</th>
                  <th className="text-right py-2 pr-4 font-medium">Worked on off</th>
                  <th className="text-right py-2 pr-4 font-medium">Late (days / total)</th>
                  <th className="text-right py-2 pr-4 font-medium">Overtime</th>
                  <th className="text-right py-2 font-medium">Missed punches</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => {
                  const days = daysByEmployee.get(s.employeeName);
                  const isOpen = expanded === s.employeeName;
                  return (
                    <React.Fragment key={s.employeeName}>
                      <tr
                        className="border-b border-border last:border-b-0 hover:bg-muted/30 cursor-pointer"
                        onClick={() => setExpanded(isOpen ? null : s.employeeName)}
                      >
                        <td className="py-2.5 pr-4">
                          <p className="font-medium text-foreground">{s.employeeName}</p>
                          {!s.employeeId && (
                            <p className="text-xs text-amber-600">Not linked to an HR employee record</p>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-foreground">{s.present}</td>
                        <td className="py-2.5 pr-4 text-right text-muted-foreground">{s.halfDay || "-"}</td>
                        <td className="py-2.5 pr-4 text-right text-destructive">{s.absent || "-"}</td>
                        <td className="py-2.5 pr-4 text-right text-muted-foreground">{s.weeklyOff || "-"}</td>
                        <td className="py-2.5 pr-4 text-right text-muted-foreground">{s.weeklyOffWorked || "-"}</td>
                        <td className="py-2.5 pr-4 text-right text-muted-foreground">
                          {s.lateCount ? `${s.lateCount} / ${s.totalLateMinutes}m` : "-"}
                        </td>
                        <td className="py-2.5 pr-4 text-right text-muted-foreground">
                          {s.totalOvertimeMinutes ? `${s.totalOvertimeMinutes}m` : "-"}
                        </td>
                        <td className="py-2.5 text-right text-muted-foreground">{s.missedPunches || "-"}</td>
                      </tr>
                      {isOpen && days && (
                        <tr>
                          <td colSpan={9} className="pb-3">
                            <div className="rounded-lg border border-border overflow-hidden">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-muted/40 text-muted-foreground">
                                    <th className="text-left py-1.5 px-3 font-medium">Date</th>
                                    <th className="text-left py-1.5 px-3 font-medium">Status</th>
                                    <th className="text-left py-1.5 px-3 font-medium">In</th>
                                    <th className="text-left py-1.5 px-3 font-medium">Out</th>
                                    <th className="text-left py-1.5 px-3 font-medium">Punches</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {days.rows.map((d) => (
                                    <tr key={d.id} className="border-t border-border">
                                      <td className="py-1.5 px-3">{d.date}</td>
                                      <td className="py-1.5 px-3">{d.statusLabel.trim()}</td>
                                      <td className="py-1.5 px-3">{d.inTime ?? "-"}</td>
                                      <td className="py-1.5 px-3">{d.outTime ?? "-"}</td>
                                      <td className="py-1.5 px-3 text-muted-foreground">{d.punchRecords || "-"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground mt-4">
            Actual attendance from the biometric terminal, imported from eTimeTrackLite - not the
            planned roster. Click a row to see day-by-day punches. "Not linked to an HR employee
            record" means the name from the biometric system didn't match anyone in Headcount.
          </p>
        </>
      )}
    </DashCard>
  );
}
