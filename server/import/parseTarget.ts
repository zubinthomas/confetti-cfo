// Parser for the FY26-27 Target Plan workbook (data-sources/HP_FY26_27_Target_Plan.xlsx) -
// a 16-sheet workbook, but only the "FY<yy>-<yy> Target Plan" sheet's monthly
// Store/F&B target columns are parsed here. Everything else - the 12-sheet
// historical HP/JP/Park Street archive, Target Dashboard, Assumptions,
// HP <year> - is out of scope per the client: Park Street and JP aren't
// tracked, and only main-category (Store/F&B total) targets are wanted, not
// sub-category detail (that's pending separate feedback and isn't parsed).
//
// The sheet name and both target-column headers embed the fiscal year
// ("FY26-27 Target Plan", "FY26-27 Store Target", "FY26-27 F&B Target") and
// this workbook gets re-exported every fiscal year with that year updated -
// so both the sheet lookup and the column lookup match a `FY\d{2}-\d{2}`
// pattern rather than a literal year, and the fiscal year itself is read out
// of the matched sheet name. This lets next year's file import with no code
// change.
import type ExcelJS from 'exceljs';
import { str, num } from './xlsx.ts';
import { monthPeriod } from './types.ts';
import type { Issue, ParsedTargetRecord, ParsedWorkbook } from './types.ts';

export const TARGET_SHEET_RE = /^FY(\d{2})-(\d{2}) Target Plan$/i;

export function findTargetSheet(wb: ExcelJS.Workbook): ExcelJS.Worksheet | null {
  for (const ws of wb.worksheets) {
    if (TARGET_SHEET_RE.test(ws.name)) return ws;
  }
  return null;
}

const MONTH_ABBR: Record<string, number> = {
  apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9,
  oct: 10, nov: 11, dec: 12, jan: 1, feb: 2, mar: 3,
};

const HEADER_ROW = 4;
const FIRST_DATA_ROW = 5;

export function parseTarget(wb: ExcelJS.Workbook): ParsedWorkbook {
  const issues: Issue[] = [];
  const records: ParsedTargetRecord[] = [];

  const ws = findTargetSheet(wb);
  if (!ws) {
    issues.push({ level: 'error', sheet: '(workbook)', message: 'No "FY<yy>-<yy> Target Plan" sheet found.' });
    return {
      kind: 'target', businessName: '', periods: [], financialRecords: [],
      salesRecords: [], consignmentRecords: [], employeeRecords: [], targetRecords: [], issues,
    };
  }

  const m = ws.name.match(TARGET_SHEET_RE)!;
  const startYear = 2000 + Number(m[1]);
  const fiscalYear = `${startYear}-${startYear + 1}`;
  const storeColRe = new RegExp(`^FY${m[1]}-${m[2]} Store Target$`, 'i');
  const fnbColRe = new RegExp(`^FY${m[1]}-${m[2]} F&B Target$`, 'i');

  let monthCol = -1, storeCol = -1, fnbCol = -1;
  ws.getRow(HEADER_ROW).eachCell({ includeEmpty: false }, (cell, col) => {
    const v = str(cell.value);
    if (!v) return;
    if (v.toLowerCase() === 'month') monthCol = col;
    else if (storeColRe.test(v)) storeCol = col;
    else if (fnbColRe.test(v)) fnbCol = col;
  });
  if (monthCol < 0 || storeCol < 0 || fnbCol < 0) {
    issues.push({
      level: 'error', sheet: ws.name,
      message: `Couldn't find Month/Store Target/F&B Target columns in row ${HEADER_ROW}.`,
    });
    return {
      kind: 'target', businessName: '', periods: [], financialRecords: [],
      salesRecords: [], consignmentRecords: [], employeeRecords: [], targetRecords: [], issues,
    };
  }

  const seenMonths = new Set<number>();
  for (let r = FIRST_DATA_ROW; ; r++) {
    const row = ws.getRow(r);
    const monthText = str(row.getCell(monthCol).value);
    if (!monthText) break;
    const monthNum = MONTH_ABBR[monthText.trim().toLowerCase().slice(0, 3)];
    if (!monthNum) break; // hit the sheet's trailing/total row, not a month row

    const year = monthNum >= 4 ? startYear : startYear + 1;
    const storeAmount = num(row.getCell(storeCol).value);
    const fnbAmount = num(row.getCell(fnbCol).value);

    if (storeAmount == null) {
      issues.push({ level: 'error', sheet: ws.name, message: `${monthText} ${year}: missing/invalid Store Target.` });
    } else {
      const p = monthPeriod(year, monthNum);
      records.push({ periodStart: p.startDate, periodEnd: p.endDate, periodType: 'month', category: 'store', amount: storeAmount });
    }
    if (fnbAmount == null) {
      issues.push({ level: 'error', sheet: ws.name, message: `${monthText} ${year}: missing/invalid F&B Target.` });
    } else {
      const p = monthPeriod(year, monthNum);
      records.push({ periodStart: p.startDate, periodEnd: p.endDate, periodType: 'month', category: 'fnb', amount: fnbAmount });
    }
    seenMonths.add(monthNum);
  }

  if (seenMonths.size !== 12) {
    issues.push({
      level: 'warning', sheet: ws.name,
      message: `Expected 12 months of targets, found ${seenMonths.size}.`,
    });
  }

  return {
    kind: 'target',
    businessName: '',
    periods: [],
    financialRecords: [],
    salesRecords: [],
    consignmentRecords: [],
    employeeRecords: [],
    targetRecords: records,
    issues,
  };
}
