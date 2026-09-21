import React, { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import { getRoster, type RosterRow } from "@/api/rosterApi";

function weekdayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "2-digit", day: "2-digit", timeZone: "UTC" });
}

interface EmployeeWeek {
  employeeName: string;
  division: string | null;
  functionalArea: string | null;
  designation: string | null;
  breakSlot: string | null;
  weeklyOffDay: string | null;
  byDate: Map<string, RosterRow>;
}

export default function RosterTab() {
  const [selectedWeek, setSelectedWeek] = useState<string | undefined>(undefined);
  const [weeks, setWeeks] = useState<string[]>([]);
  const [rows, setRows] = useState<RosterRow[] | null>(null);
  const [error, setError] = useState("");
  const [divisionFilter, setDivisionFilter] = useState<string>("All");

  useEffect(() => {
    getRoster(selectedWeek)
      .then((r) => {
        setRows(r.rows);
        setWeeks(r.weeks);
        if (!selectedWeek && r.week) setSelectedWeek(r.week);
      })
      .catch((err: Error) => setError(err.message || "Failed to load roster"));
  }, [selectedWeek]);

  const { employees, dates, divisions } = useMemo(() => {
    if (!rows) return { employees: [] as EmployeeWeek[], dates: [] as string[], divisions: [] as string[] };
    const byEmployee = new Map<string, EmployeeWeek>();
    const dateSet = new Set<string>();
    const divisionSet = new Set<string>();
    for (const r of rows) {
      dateSet.add(r.date);
      if (r.division) divisionSet.add(r.division);
      let emp = byEmployee.get(r.employeeName);
      if (!emp) {
        emp = {
          employeeName: r.employeeName, division: r.division, functionalArea: r.functionalArea,
          designation: r.designation, breakSlot: r.breakSlot, weeklyOffDay: r.weeklyOffDay,
          byDate: new Map(),
        };
        byEmployee.set(r.employeeName, emp);
      }
      emp.byDate.set(r.date, r);
    }
    return {
      employees: [...byEmployee.values()].sort((a, b) => a.employeeName.localeCompare(b.employeeName)),
      dates: [...dateSet].sort(),
      divisions: [...divisionSet].sort(),
    };
  }, [rows]);

  const visibleEmployees = divisionFilter === "All" ? employees : employees.filter((e) => e.division === divisionFilter);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!rows) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading roster…
      </div>
    );
  }

  return (
    <DashCard>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No roster data imported yet. Upload a weekly roster workbook from Data → Import.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div className="flex gap-1.5 flex-wrap">
              {weeks.map((w) => (
                <button
                  key={w}
                  onClick={() => setSelectedWeek(w)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    w === selectedWeek
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  Week of {w}
                </button>
              ))}
            </div>
            <select
              value={divisionFilter}
              onChange={(e) => setDivisionFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs"
            >
              <option value="All">All departments</option>
              {divisions.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-4 font-medium">Employee</th>
                  <th className="text-left py-2 pr-4 font-medium">Department</th>
                  <th className="text-left py-2 pr-4 font-medium">Functional Area</th>
                  {dates.map((d) => (
                    <th key={d} className="text-left py-2 pr-4 font-medium whitespace-nowrap">{weekdayLabel(d)}</th>
                  ))}
                  <th className="text-left py-2 font-medium">Weekly Off</th>
                </tr>
              </thead>
              <tbody>
                {visibleEmployees.map((emp) => (
                  <tr key={emp.employeeName} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                    <td className="py-2.5 pr-4">
                      <p className="font-medium text-foreground">{emp.employeeName}</p>
                      {emp.designation && <p className="text-xs text-muted-foreground">{emp.designation}</p>}
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{emp.division ?? "-"}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{emp.functionalArea ?? "-"}</td>
                    {dates.map((d) => {
                      const cell = emp.byDate.get(d);
                      return (
                        <td key={d} className="py-2.5 pr-4 whitespace-nowrap">
                          {cell?.isOff ? (
                            <span className="text-muted-foreground italic">OFF</span>
                          ) : cell?.shiftStart ? (
                            <span className="text-foreground">{cell.shiftStart}–{cell.shiftEnd}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2.5 text-muted-foreground">{emp.weeklyOffDay ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground mt-4">
            This is the planned schedule from the imported weekly roster workbook - not an attendance
            record. Break slots and net hours are shown in the source workbook but not repeated here.
          </p>
        </>
      )}
    </DashCard>
  );
}
