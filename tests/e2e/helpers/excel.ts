// Read the source Excel workbooks in data-sources/ and compute the same
// aggregates the dashboard presents, WITHOUT going through
// extracted_data.json or the src/data adapters - so the tests compare what
// the UI shows against the spreadsheets themselves.
import ExcelJS from "exceljs";
import path from "node:path";
import fs from "node:fs";

export const DATA_DIR = path.resolve("data-sources");
export const CEPL_XLSX = path.join(DATA_DIR, "P&L", "CEPL P & L_2025-26.xlsx");
export const CAFE_XLSX = path.join(DATA_DIR, "P&L", "Cafe Weekly P&L - 2025 -2026.xlsx");
export const SIENNA_XLSX = path.join(DATA_DIR, "Store sales", "Sienna Store Sales Analysis FINAL.xlsx");

export const hasSources = () =>
  [CEPL_XLSX, CAFE_XLSX, SIENNA_XLSX].every((f) => fs.existsSync(f));

// Same compact-₹ formatter the dashboard uses (duplicated on purpose: the
// tests must not import app code, or a data bug could cancel itself out).
export const L = (n: number | null | undefined): string => {
  if (n == null) return "-";
  const abs = Math.abs(n);
  if (abs >= 10000000) return `${(n / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(Math.round(n));
};

// exceljs returns formula cells as { formula, result } - unwrap to a number.
const num = (v: unknown): number | null => {
  if (v && typeof v === "object" && "result" in v) v = (v as { result: unknown }).result;
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

const wbCache = new Map<string, ExcelJS.Workbook>();
async function workbook(file: string): Promise<ExcelJS.Workbook> {
  if (!wbCache.has(file)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    wbCache.set(file, wb);
  }
  return wbCache.get(file)!;
}

// ── CEPL P&L workbook ───────────────────────────────────────────────────────
// Department sheets: row label in col A, the 12 fiscal months in cols B..M.
export async function ceplRowTotal(sheetName: string, label: string): Promise<number> {
  const ws = (await workbook(CEPL_XLSX)).getWorksheet(sheetName)!;
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (String(row.getCell(1).value ?? "").trim() !== label) continue;
    let total = 0;
    for (let c = 2; c <= 13; c++) total += num(row.getCell(c).value) ?? 0;
    return total;
  }
  throw new Error(`row ${JSON.stringify(label)} not found in CEPL sheet ${sheetName}`);
}

// ── Cafe weekly workbook ────────────────────────────────────────────────────
// Outlet-split weekly sheets are named "DD-MM-YYYY to DD-MM-YYYY"; header row 2
// holds the outlet column names. "Durga Puja 2025" is a summary of the two
// calendar weeks it spans, so it is excluded (as the dashboard does).
const WEEK_SHEET_RE = /^\d{2}-\d{2}-\d{4} to \d{2}-\d{2}-\d{4}$/;

export async function cafeOutletWeeklyTotal(outletHeader: string, rowLabel: string): Promise<number> {
  const wb = await workbook(CAFE_XLSX);
  let total = 0;
  for (const ws of wb.worksheets) {
    if (!WEEK_SHEET_RE.test(ws.name)) continue;
    const header = ws.getRow(2);
    let col: number | null = null;
    header.eachCell((cell, c) => {
      if (String(cell.value ?? "").trim() === outletHeader) col = c;
    });
    if (!col) throw new Error(`outlet ${outletHeader} not in sheet ${ws.name}`);
    for (let r = 3; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      if (String(row.getCell(1).value ?? "").trim() === rowLabel) {
        total += num(row.getCell(col).value) ?? 0;
        break; // first occurrence only (matches how the app reads it)
      }
    }
  }
  return total;
}

// ── Sienna store sales workbook ─────────────────────────────────────────────
// "Overall sales": stacked fiscal-year blocks; each block header row contains
// "April ' YY" and is followed by one row per sales channel (12 months in
// cols B..M).
export async function siennaChannelYearTotals(aprilHeaderYY: string): Promise<Record<string, number>> {
  const ws = (await workbook(SIENNA_XLSX)).getWorksheet("Overall sales")!;
  const headerRe = new RegExp(`April\\s*'\\s*${aprilHeaderYY}\\b`);
  const channels: Record<string, number> = {};
  let inBlock = false;
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const a = String(row.getCell(1).value ?? "").trim();
    const b = String(row.getCell(2).value ?? "");
    if (headerRe.test(b)) { inBlock = true; continue; }
    if (!inBlock) continue;
    if (!a || a === "TOTAL") break; // block ends at its TOTAL row
    let total = 0;
    for (let c = 2; c <= 13; c++) total += num(row.getCell(c).value) ?? 0;
    channels[a] = total;
  }
  if (!inBlock) throw new Error(`no Overall sales block for April '${aprilHeaderYY}`);
  return channels;
}

// "Consigment": stacked fiscal-year blocks ("Consignment" + "Sienna x Other
// Brands" per year), header rows contain "April ' YY"; vendor rows have the
// commission rate in col B and 12 months in cols C..N.
export async function consignmentYearTotal(aprilHeaderYY: string): Promise<number> {
  const ws = (await workbook(SIENNA_XLSX)).getWorksheet("Consigment")!;
  const headerRe = new RegExp(`April\\s*'\\s*${aprilHeaderYY}\\b`);
  let total = 0;
  let inBlock = false;
  let found = false;
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const a = String(row.getCell(1).value ?? "").trim();
    const rowText = Array.isArray(row.values) ? row.values.map((v) => String(v ?? "")).join("|") : "";
    if (headerRe.test(rowText)) { inBlock = true; found = true; continue; }
    if (/April\s*'/.test(rowText)) { inBlock = false; continue; } // another year's block
    if (!inBlock || !a || a === "TOTAL") { if (a === "TOTAL") inBlock = false; continue; }
    for (let c = 3; c <= 14; c++) total += num(row.getCell(c).value) ?? 0;
  }
  if (!found) throw new Error(`no Consigment block for April '${aprilHeaderYY}`);
  return total;
}
