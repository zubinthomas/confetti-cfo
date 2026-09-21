// April-March fiscal year shared by the ops dashboard pages. The production
// log has no fiscal-year field of its own (unlike the financial-records
// tables), so this is derived from the raw date rather than looked up.
export function fyOf(iso: string): string {
  const [yearStr, monthStr] = iso.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  return month >= 4 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

export function fyLabel(fy: string): string {
  return `FY ${fy.slice(2, 4)}-${fy.slice(7)}`;
}
