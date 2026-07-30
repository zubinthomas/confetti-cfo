// Parser for the Cafe Weekly P&L workbook.
//   - Month-name sheets (Apr-Aug 2025 style): weekly columns ("31/3-6/4") plus
//     a Total column that becomes the month record, all under the "Cafe" unit.
//     The calendar year is anchored by the dated weekly sheets.
//   - "DD-MM-YYYY to DD-MM-YYYY" sheets: one week, outlet columns (Bosar Ghor /
//     Dinning Room / Rannaghor / Total).
//   - Special sheets (e.g. "Durga Puja 2025") summarise the calendar weeks they
//     span; they import as isSpecialEvent custom periods and are reconciled
//     against the overlapped weeks so nothing double counts.
//   - The source reuses row labels ("Kombucha"/"Liquor" appear as revenue AND
//     as retail purchases): the second occurrence becomes the dedicated
//     "<label> (Retail Purchases)" line item (all cells as amounts, matching
//     the verified extraction); unknown duplicate labels get "<label> (2)"
//     plus a warning.
//   - Rows with hand-typed amounts but no label in column A raise an
//     error-level issue so the source gets fixed; unlabeled formula rows and
//     typed ratio rows (the percent-of-sales scratch lines under each
//     section) are skipped silently.
import type ExcelJS from 'exceljs';
import { literalNum, num, str } from './xlsx.ts';
import {
  type Issue, type ParsedFinancialRecord, type ParsedPeriod, type ParsedWorkbook,
  MONTH_NAMES, fiscalYearOf, looksLikeUnlabeledData, monthPeriod, pad2, valueTypeOf,
} from './types.ts';

const BUSINESS = 'Cafe';
const WEEK_SHEET_RE = /^(\d{2})-(\d{2})-(\d{4}) to (\d{2})-(\d{2})-(\d{4})$/;
const WEEK_COL_RE = /^(\d{1,2})\/(\d{1,2})-(\d{1,2})\/(\d{1,2})$/;

const DUP_RENAME = new Set(['Kombucha', 'Liquor']);
const KNOWN_SPECIAL: Record<string, { start: string; end: string }> = {
  'Durga Puja 2025': { start: '2025-09-22', end: '2025-10-05' },
};

const MONTH_NUM: Record<string, number> = Object.fromEntries(
  MONTH_NAMES.map((m, i) => [m, ((i + 3) % 12) + 1]), // April -> 4 … March -> 3
);

const RECON_ROW = 'Total Cafe Sales';

export function parseCafe(wb: ExcelJS.Workbook): ParsedWorkbook {
  const issues: Issue[] = [];
  const records: ParsedFinancialRecord[] = [];
  const periods = new Map<string, ParsedPeriod>();

  // anchor calendar year from the dated weekly sheets
  let fyStartYear: number | null = null;
  for (const ws of wb.worksheets) {
    const m = ws.name.match(WEEK_SHEET_RE);
    if (m) {
      const y = Number(m[3]), mo = Number(m[2]);
      const fy = fiscalYearOf(y, mo);
      fyStartYear = Number(fy.slice(0, 4));
      break;
    }
  }

  type ColTarget = { col: number; unitName: string; unitType: 'department' | 'outlet'; period: ParsedPeriod };

  const addRows = (ws: ExcelJS.Worksheet, targets: ColTarget[]) => {
    for (const t of targets) periods.set(`${t.period.periodType}|${t.period.startDate}`, t.period);
    const seen = new Set<string>();
    const dupCount = new Map<string, number>();
    const reconRows: { label: string; byCol: Map<number, number> }[] = [];

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
      const reconRow = rawLabel === RECON_ROW && n === 1 ? { label, byCol: new Map<number, number>() } : null;
      if (reconRow) reconRows.push(reconRow);

      for (const t of targets) {
        const v = num(row.getCell(t.col).value);
        if (v == null) continue;
        const valueType = forcedAmount ? 'amount' : valueTypeOf(v);
        const key = `${t.unitName}|${t.period.periodType}|${t.period.startDate}|${label}|${valueType}`;
        if (seen.has(key)) continue; // first row wins
        seen.add(key);
        records.push({
          businessName: BUSINESS, unitName: t.unitName, unitType: t.unitType,
          periodStart: t.period.startDate, periodEnd: t.period.endDate, periodType: t.period.periodType,
          lineItemName: label, valueType, value: v,
        });
        reconRow?.byCol.set(t.col, v);
      }
    });

    // The parts should sum to the Total column - "Total" is distinguished
    // differently depending on sheet shape: week-sheets have a dedicated
    // unitName "Total" alongside the outlet columns (all sharing one week
    // period); month-sheets instead have every column under unitName "Cafe"
    // and distinguish the Total column by it being the whole-month period
    // (monthPeriod()) rather than one of the individual week periods. This
    // caught a real source-workbook bug: the Cafe weekly workbook's "May"
    // sheet reports a Total Cafe Sales figure ₹2,28,375 short of what its
    // own week columns actually sum to.
    for (const r of reconRows) {
      const totalTarget = targets.find((t) => t.unitName === 'Total')
        ?? targets.find((t) => t.period.periodType === 'month');
      if (!totalTarget) continue;
      const parts = targets.filter((t) => t !== totalTarget && t.period.periodType !== 'month');
      if (!parts.length) continue;
      const sum = parts.reduce((a, t) => a + (r.byCol.get(t.col) ?? 0), 0);
      const total = r.byCol.get(totalTarget.col);
      if (total != null && Math.abs(sum - total) > 1) {
        issues.push({ level: 'warning', sheet: ws.name, message: `${RECON_ROW}: parts sum to ${sum.toFixed(0)} but Total says ${total.toFixed(0)}` });
      }
    }
  };

  const weekTotals = new Map<string, number>(); // week startDate -> Total Cafe Sales (all outlets)

  for (const ws of wb.worksheets) {
    const weekMatch = ws.name.match(WEEK_SHEET_RE);
    const monthNum = MONTH_NUM[ws.name];

    if (weekMatch) {
      // one calendar week, outlet columns in header row 2
      const [, d1, m1, y1, d2, m2, y2] = weekMatch;
      const period: ParsedPeriod = {
        periodType: 'week',
        startDate: `${y1}-${m1}-${d1}`, endDate: `${y2}-${m2}-${d2}`,
        label: ws.name, fiscalYear: fiscalYearOf(Number(y1), Number(m1)), isSpecialEvent: false,
      };
      const targets: ColTarget[] = [];
      ws.getRow(2).eachCell((cell, col) => {
        const h = str(cell.value);
        if (h) targets.push({ col, unitName: h, unitType: h === 'Total' ? 'department' : 'outlet', period });
      });
      if (!targets.length) { issues.push({ level: 'error', sheet: ws.name, message: 'no outlet columns found in header row 2' }); continue; }
      addRows(ws, targets);
      const total = records.find((r) => r.unitName === 'Total' && r.periodStart === period.startDate && r.lineItemName === RECON_ROW);
      if (total) weekTotals.set(period.startDate, total.value);
      continue;
    }

    if (monthNum !== undefined) {
      // whole-cafe month sheet: weekly columns + Total column
      if (fyStartYear == null) {
        issues.push({ level: 'error', sheet: ws.name, message: 'cannot infer the calendar year - the workbook has no dated weekly sheets' });
        continue;
      }
      const year = monthNum >= 4 ? fyStartYear : fyStartYear + 1;
      const targets: ColTarget[] = [];
      ws.getRow(2).eachCell((cell, col) => {
        const h = str(cell.value);
        if (!h) return;
        const wm = h.match(WEEK_COL_RE);
        if (wm) {
          const [, sd, sm, ed, em] = wm.map(Number) as unknown as number[];
          const startYear = sm > monthNum ? year - 1 : year;
          const endYear = em < sm ? startYear + 1 : startYear;
          targets.push({
            col, unitName: 'Cafe', unitType: 'department',
            period: {
              periodType: 'week',
              startDate: `${startYear}-${pad2(sm)}-${pad2(sd)}`,
              endDate: `${endYear}-${pad2(em)}-${pad2(ed)}`,
              label: `${h} (${ws.name} ${year})`,
              fiscalYear: fiscalYearOf(startYear, sm), isSpecialEvent: false,
            },
          });
        } else if (h === 'Total') {
          targets.push({ col, unitName: 'Cafe', unitType: 'department', period: monthPeriod(year, monthNum) });
        }
      });
      if (!targets.length) { issues.push({ level: 'error', sheet: ws.name, message: 'no week/Total columns found in header row 2' }); continue; }
      addRows(ws, targets);
      continue;
    }

    // special-event summary sheet
    const special = KNOWN_SPECIAL[ws.name];
    if (!special) {
      issues.push({ level: 'error', sheet: ws.name, message: `unrecognised sheet - if it is a special-event summary, add its date range to KNOWN_SPECIAL in parseCafe.ts` });
      continue;
    }
    const period: ParsedPeriod = {
      periodType: 'custom', startDate: special.start, endDate: special.end,
      label: ws.name, fiscalYear: fiscalYearOf(Number(special.start.slice(0, 4)), Number(special.start.slice(5, 7))),
      isSpecialEvent: true,
    };
    const targets: ColTarget[] = [];
    ws.getRow(2).eachCell((cell, col) => {
      const h = str(cell.value);
      if (h) targets.push({ col, unitName: h, unitType: h === 'Total' ? 'department' : 'outlet', period });
    });
    addRows(ws, targets);

    // special events summarise regular weeks - check they don't add new money
    const covered = [...weekTotals.entries()]
      .filter(([start]) => start >= special.start && start <= special.end)
      .reduce((a, [, v]) => a + v, 0);
    const own = records.find((r) => r.unitName === 'Total' && r.periodType === 'custom' && r.periodStart === special.start && r.lineItemName === RECON_ROW)?.value;
    if (own != null && covered > 0 && Math.abs(own - covered) > 1) {
      issues.push({ level: 'warning', sheet: ws.name, message: `special-event total ${own.toFixed(0)} ≠ sum of the overlapped weeks ${covered.toFixed(0)} - check for double counting` });
    }
  }

  return {
    kind: 'cafe', businessName: BUSINESS,
    periods: [...periods.values()],
    financialRecords: records,
    salesRecords: [], consignmentRecords: [], employeeRecords: [],
    issues,
  };
}
