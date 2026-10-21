// The headcount line in the HR page header. Counts follow whatever employee
// list the viewer's own permissions and scope return, so a division-scoped
// user sees their slice, not the whole company.
export const HR_SUMMARY_KEY = ["hr-summary"] as const;

export interface HrSummary {
  employees: number;
  divisions: number;
}

// Terminated and Resigned have left. Notice Period, Probation and On Leave
// are all still on the books.
const LEFT = new Set(["Terminated", "Resigned"]);

// Employee rows come back as loosely typed records (see EntityRecord), so the
// two fields read here are checked rather than assumed.
export function summariseEmployees(employees: Record<string, unknown>[]): HrSummary {
  const current = employees.filter((e) => !LEFT.has(typeof e.status === "string" ? e.status : ""));
  const divisions = new Set(current.map((e) => e.division).filter((d) => typeof d === "string" && d !== ""));
  return { employees: current.length, divisions: divisions.size };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "Confetti Exports" alone until the counts are known (or when the viewer
 *  can't read employees), then "Confetti Exports · 3 divisions · 119 employees". */
export function hrSubtitle(summary: HrSummary | undefined): string {
  if (!summary) return "Confetti Exports";
  return `Confetti Exports · ${plural(summary.divisions, "division")} · ${plural(summary.employees, "employee")}`;
}
