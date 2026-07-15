// Parser for the CEPL P&L workbook (six department sheets + Overview).
// Ports the verified extraction rules:
//   - month columns come from the header row's date cells (the Store sheet's
//     "2025-04-04" quirk normalises to the month);
//   - rows with a blank label in column A are skipped (counted per sheet);
//   - a whole row is classified amount/percentage by the |v| <= 1.5 fraction
//     heuristic (percentage only when every numeric cell is a fraction);
//     first row wins on a (unit, period, line-item) clash;
//   - the Overview sheet's historical fiscal-year blocks import as
//     "... (Overview)" line items; the year already covered by the department
//     sheets is skipped (it exists at full granularity);
//   - per month, Sales − Expenses is reconciled against the sheet's own Net
//     P&L row (warning when off - the source is known to disagree with
//     itself for Store June FY25-26).
import type ExcelJS from 'exceljs';
import { num, str, dateVal } from './xlsx.ts';
import {
  type Issue, type ParsedFinancialRecord, type ParsedPeriod, type ParsedWorkbook,
  monthPeriod,
} from './types.ts';

const BUSINESS = 'CEPL';
const DEPT_SHEETS = ['F&B', 'Store', 'Trading Items', 'Pottery', 'Batik', 'Stitching'];

const TOTAL_SALES_LABELS = ['Total F&B Sales Monthwise', 'Retails Sales Report', 'Total Sales'];
const TOTAL_EXPENSE_LABELS = ['Total F&B Expenses', 'Total Expenses'];
const NET_PL_LABELS = ['P+L = Gross Revenue - Operating Costs', 'Net Profit & Loss'];

const OVERVIEW_LI = new Map([
  ['Sales', { name: 'Sales (Overview)', valueType: 'amount' as const }],
  ['Expense', { name: 'Expense (Overview)', valueType: 'amount' as const }],
  ['Profit & Loss', { name: 'Profit & Loss (Overview)', valueType: 'amount' as const }],
  ['%', { name: 'Profit & Loss % (Overview)', valueType: 'percentage' as const }],
]);

interface MonthCol { col: number; period: ParsedPeriod }

function headerMonths(ws: ExcelJS.Worksheet, issues: Issue[]): MonthCol[] {
  for (let r = 1; r <= 3; r++) {
    const row = ws.getRow(r);
    const cols: MonthCol[] = [];
    for (let c = 2; c <= 14; c++) {
      const d = dateVal(row.getCell(c).value);
      if (d) cols.push({ col: c, period: monthPeriod(d.getUTCFullYear(), d.getUTCMonth() + 1) });
    }
    if (cols.length >= 10) {
      const dup = new Set<string>();
      for (const m of cols) {
        if (dup.has(m.period.startDate)) {
          issues.push({ level: 'error', sheet: ws.name, message: `duplicate month ${m.period.label} in header` });
        }
        dup.add(m.period.startDate);
      }
      return cols;
    }
  }
  issues.push({ level: 'error', sheet: ws.name, message: 'no month header row found (expected date cells in row 1-3)' });
  return [];
}

export function parseCepl(wb: ExcelJS.Workbook): ParsedWorkbook {
  const issues: Issue[] = [];
  const records: ParsedFinancialRecord[] = [];
  const periods = new Map<string, ParsedPeriod>();
  const deptFYs = new Set<string>();

  for (const sheetName of DEPT_SHEETS) {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) {
      issues.push({ level: 'error', sheet: sheetName, message: 'sheet missing from workbook' });
      continue;
    }
    const months = headerMonths(ws, issues);
    if (!months.length) continue;
    for (const m of months) {
      periods.set(m.period.startDate, m.period);
      deptFYs.add(m.period.fiscalYear);
    }

    const seen = new Set<string>();
    let blankLabelCells = 0;
    // per-month reconciliation inputs
    const recon: Record<string, Record<string, number>> = {};

    ws.eachRow((row) => {
      if (row.number <= 3 && !str(row.getCell(1).value)) return; // header region
      const label = str(row.getCell(1).value);
      // The extraction this must reproduce classified amount vs percentage per
      // ROW: a row is a percentage row only if every numeric cell is a
      // fraction (an all-zero row also lands on the percentage side).
      const rowValues = months.map((m) => num(row.getCell(m.col).value));
      const rowType = rowValues.every((v) => v == null || Math.abs(v) <= 1.5) ? 'percentage' : 'amount';
      for (const m of months) {
        const v = num(row.getCell(m.col).value);
        if (v == null) continue;
        if (!label) { blankLabelCells++; continue; }
        const valueType = rowType;
        const key = `${m.period.startDate}|${label}|${valueType}`;
        if (seen.has(key)) continue; // first row wins
        seen.add(key);
        records.push({
          businessName: BUSINESS, unitName: sheetName, unitType: 'department',
          periodStart: m.period.startDate, periodEnd: m.period.endDate, periodType: 'month',
          lineItemName: label, valueType, value: v,
        });
        if (valueType === 'amount') {
          const bucket = TOTAL_SALES_LABELS.includes(label) ? 'sales'
            : TOTAL_EXPENSE_LABELS.includes(label) ? 'expense'
            : NET_PL_LABELS.includes(label) ? 'net' : null;
          if (bucket) (recon[m.period.startDate] ??= {})[bucket] = v;
        }
      }
    });

    if (blankLabelCells) {
      issues.push({
        level: 'info', sheet: sheetName,
        message: `${blankLabelCells} numeric cell(s) in rows without a label were skipped (derivable ratio rows / orphaned cells)`,
      });
    }
    for (const [start, r] of Object.entries(recon)) {
      if (r.sales != null && r.expense != null && r.net != null && Math.abs(r.sales - r.expense - r.net) > 1) {
        issues.push({
          level: 'warning', sheet: sheetName,
          message: `${periods.get(start)?.label}: Sales − Expenses = ${(r.sales - r.expense).toFixed(0)} but the sheet's Net P&L row says ${r.net.toFixed(0)}`,
        });
      }
    }
  }

  // ── Overview sheet: historical fiscal years ────────────────────────────────
  const ov = wb.getWorksheet('Overview');
  if (!ov) {
    issues.push({ level: 'warning', sheet: 'Overview', message: 'sheet missing - historical years not imported' });
  } else {
    let fy: string | null = null;
    let unit: string | null = null;
    ov.eachRow((row) => {
      const a = str(row.getCell(1).value);
      if (a) {
        const m = a.match(/Overview for the financial year (\d{4})-(\d{4})/);
        if (m) { fy = `${m[1]}-${m[2]}`; unit = null; return; }
        if (DEPT_SHEETS.includes(a)) unit = a;
      }
      if (!fy || !unit || deptFYs.has(fy)) return; // dept-sheet year is already granular
      const desc = str(row.getCell(2).value);
      const li = desc ? OVERVIEW_LI.get(desc) : undefined;
      if (!li) return;
      const startYear = Number(fy.slice(0, 4));
      for (let i = 0; i < 12; i++) {
        const month = ((i + 3) % 12) + 1; // Apr..Mar
        const year = month >= 4 ? startYear : startYear + 1;
        const v = num(row.getCell(3 + i).value);
        if (v == null) continue;
        const p = monthPeriod(year, month);
        periods.set(p.startDate, p);
        records.push({
          businessName: BUSINESS, unitName: unit, unitType: 'department',
          periodStart: p.startDate, periodEnd: p.endDate, periodType: 'month',
          lineItemName: li.name, valueType: li.valueType, value: v,
        });
      }
    });
  }

  return {
    kind: 'cepl', businessName: BUSINESS,
    periods: [...periods.values()],
    financialRecords: records,
    salesRecords: [], consignmentRecords: [],
    issues,
  };
}
