// Client-side CSV/Excel export for dashboard data. No server involvement -
// same convention as employeeDocs.ts's PDF generation: build the file in the
// browser and trigger a download directly.
//
// exceljs is imported dynamically inside exportExcel, not at module scope -
// a static import here would pull its full weight into every page that
// renders an <ExportButtons /> control, even for a user who never clicks
// "Excel." Same reasoning as employeeDocs.ts's dynamic `import("jspdf")`.

export interface ExportSheet {
  name: string;
  columns: string[];
  rows: (string | number | null)[][];
}

function safeFilenamePart(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "export";
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvField(value: string | number | null): string {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csvRow(fields: (string | number | null)[]): string {
  return fields.map(csvField).join(",");
}

/** Multiple sheets land in one file, one after another, each preceded by a
 *  blank line and a bare name line - CSV has no native multi-sheet concept,
 *  and this keeps "download CSV" a single click producing a single file. */
export function exportCsv(filenameBase: string, sheets: ExportSheet[]): void {
  const parts: string[] = [];
  sheets.forEach((sheet, i) => {
    if (i > 0) parts.push("");
    if (sheets.length > 1) parts.push(csvRow([sheet.name]));
    parts.push(csvRow(sheet.columns));
    for (const row of sheet.rows) parts.push(csvRow(row));
  });
  const blob = new Blob([parts.join("\n")], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, `${safeFilenamePart(filenameBase)}.csv`);
}

export async function exportExcel(filenameBase: string, sheets: ExportSheet[]): Promise<void> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    // Worksheet names are capped at 31 chars and can't contain []*?:/\ - the
    // sheet names used in this codebase are short plain labels, so this is
    // just a defensive clamp, not expected to actually trigger.
    const ws = workbook.addWorksheet(sheet.name.replace(/[[\]*?:/\\]/g, "").slice(0, 31));
    ws.addRow(sheet.columns).font = { bold: true };
    for (const row of sheet.rows) ws.addRow(row);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  triggerDownload(blob, `${safeFilenamePart(filenameBase)}.xlsx`);
}
