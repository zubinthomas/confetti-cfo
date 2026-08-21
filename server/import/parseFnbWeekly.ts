// Parser for the "F&B Weekly P&L (<FY>).xlsx" workbook - CEPL's F&B
// department, one sheet per calendar week ("01-04-2026 TO 05-04-2026", ...),
// broken out by venue (Bosar Ghor, Dining Room, Rannaghor, Bar, Event, Bar
// Find, Catering) plus a Total column, down to individual menu items and
// cost sub-lines.
//
// Modeled directly on parseCafe.ts's week-sheet branch (same shape: a header
// row of venue names, row labels in column A, one column per venue plus a
// Total). Unlike parseFnbMonthly.ts, this data is net-new at a finer grain
// than anything already in the dataset, so row labels are imported verbatim
// as line-item names (no ROW/LI remap table) - exactly parseCafe.ts's
// approach, not parseFnbMonthly.ts's.
//
// The Total column is written to the SAME 'F&B' department unit
// parseFnbMonthly.ts already writes to (not a new unit) - it can't collide
// with the monthly-canonical records because this parser uses the sheet's
// own verbatim labels (e.g. "Total F&B Sales") at periodType 'week', both
// distinct from the monthly parser's remapped names and periodType 'month'.
//
// Two pieces of real-world drift confirmed against the live workbook:
//   - the second venue is spelled "Dinning Room" through the week of
//     29-06-2026, then "Dining Room" from 06-07-2026 onward - aliased here
//     to one canonical unit so it doesn't fork a duplicate business_unit.
//   - the "Bar Find" venue column is dropped entirely from 13-07-2026
//     onward - handled naturally, since venue columns are discovered from
//     the header row per sheet rather than assumed fixed.
import type ExcelJS from 'exceljs';
import { literalNum, num, str } from './xlsx.ts';
import {
  type Issue, type ParsedFinancialRecord, type ParsedPeriod, type ParsedWorkbook,
  fiscalYearOf, looksLikeUnlabeledData, valueTypeOf,
} from './types.ts';

const BUSINESS = 'CEPL';
const FNB_UNIT = 'F&B'; // same unit parseFnbMonthly.ts writes to
// spacing around "P & L" drifts between sheets ("P & L" vs "P&L") - matched
// loosely rather than as a literal substring
const SHEET_TITLE_SIGNATURE = /F&B\s*Weekly\s*P\s*&\s*L\s*for\s*the\s*period\s*of/i;
const WEEK_SHEET_RE = /^(\d{2})-(\d{2})-(\d{4}) TO (\d{2})-(\d{2})-(\d{4})$/;

const VENUE_ALIASES: Record<string, string> = { 'Dinning Room': 'Dining Room' };
const DUP_RENAME = new Set(['Kombucha']);
const RECON_ROW = 'Total F&B Sales';

export function findFnbWeeklySheets(wb: ExcelJS.Workbook): ExcelJS.Worksheet[] {
  return wb.worksheets.filter((ws) => {
    if (!WEEK_SHEET_RE.test(ws.name)) return false;
    return SHEET_TITLE_SIGNATURE.test(str(ws.getRow(1).getCell(1).value) ?? '');
  });
}

export function parseFnbWeekly(wb: ExcelJS.Workbook): ParsedWorkbook {
  const issues: Issue[] = [];
  const records: ParsedFinancialRecord[] = [];
  const periods = new Map<string, ParsedPeriod>();

  const sheets = findFnbWeeklySheets(wb);
  if (!sheets.length) {
    issues.push({ level: 'error', sheet: '(workbook)', message: 'no weekly sheets found (expected sheet names like "01-04-2026 TO 05-04-2026")' });
  }

  interface ColTarget { col: number; unitName: string; unitType: 'department' | 'outlet' }

  for (const ws of sheets) {
    const m = ws.name.match(WEEK_SHEET_RE)!;
    const [, d1, mo1, y1, d2, mo2, y2] = m;
    const period: ParsedPeriod = {
      periodType: 'week',
      startDate: `${y1}-${mo1}-${d1}`, endDate: `${y2}-${mo2}-${d2}`,
      label: ws.name, fiscalYear: fiscalYearOf(Number(y1), Number(mo1)), isSpecialEvent: false,
    };
    periods.set(`week|${period.startDate}`, period);

    const targets: ColTarget[] = [];
    ws.getRow(2).eachCell((cell, col) => {
      const h = str(cell.value);
      if (!h) return;
      if (h === 'Total') targets.push({ col, unitName: FNB_UNIT, unitType: 'department' });
      else targets.push({ col, unitName: VENUE_ALIASES[h] ?? h, unitType: 'outlet' });
    });
    if (!targets.length) {
      issues.push({ level: 'error', sheet: ws.name, message: 'no venue columns found in header row 2' });
      continue;
    }

    const seen = new Set<string>();
    const dupCount = new Map<string, number>();
    const reconByCol = new Map<number, number>();

    ws.eachRow((row) => {
      if (row.number <= 2) return; // title + header
      const rawLabel = str(row.getCell(1).value);
      if (!rawLabel) {
        const typed = targets
          .map((t) => literalNum(row.getCell(t.col).value))
          .filter((v): v is number => v != null);
        if (looksLikeUnlabeledData(typed)) {
          issues.push({
            level: 'error', sheet: ws.name,
            message: `row ${row.number} holds ${typed.length} typed value(s) but its label cell (column A) is blank - add the missing label in the source sheet (or clear the cells), then re-import`,
          });
        }
        return;
      }

      const n = (dupCount.get(rawLabel) ?? 0) + 1;
      dupCount.set(rawLabel, n);
      let label = rawLabel;
      let forcedAmount = false;
      if (n === 2) {
        if (DUP_RENAME.has(rawLabel)) {
          label = `${rawLabel} (Retail Purchases)`;
          forcedAmount = true;
        } else {
          label = `${rawLabel} (2)`;
          issues.push({ level: 'warning', sheet: ws.name, message: `duplicate row label "${rawLabel}" - second occurrence imported as "${label}"` });
        }
      } else if (n > 2) {
        issues.push({ level: 'error', sheet: ws.name, message: `row label "${rawLabel}" appears ${n} times - only two occurrences are supported` });
        return;
      }

      const isRecon = rawLabel === RECON_ROW && n === 1;

      for (const t of targets) {
        const v = num(row.getCell(t.col).value);
        if (v == null) continue;
        const valueType = forcedAmount ? 'amount' : valueTypeOf(v);
        const key = `${t.unitName}|week|${period.startDate}|${label}|${valueType}`;
        if (seen.has(key)) continue; // first row wins (venue-alias collisions land on the same key)
        seen.add(key);
        records.push({
          businessName: BUSINESS, unitName: t.unitName, unitType: t.unitType,
          periodStart: period.startDate, periodEnd: period.endDate, periodType: 'week',
          lineItemName: label, valueType, value: v,
        });
        if (isRecon) reconByCol.set(t.col, (reconByCol.get(t.col) ?? 0) + v);
      }
    });

    const totalTarget = targets.find((t) => t.unitType === 'department');
    if (totalTarget) {
      const parts = targets.filter((t) => t !== totalTarget);
      const sum = parts.reduce((a, t) => a + (reconByCol.get(t.col) ?? 0), 0);
      const total = reconByCol.get(totalTarget.col);
      if (total != null && Math.abs(sum - total) > 1) {
        issues.push({ level: 'warning', sheet: ws.name, message: `${RECON_ROW}: venues sum to ${sum.toFixed(0)} but Total says ${total.toFixed(0)}` });
      }
    }
  }

  return {
    kind: 'fnbWeekly', businessName: BUSINESS,
    periods: [...periods.values()],
    financialRecords: records,
    salesRecords: [], consignmentRecords: [], employeeRecords: [], targetRecords: [],
    issues,
  };
}
