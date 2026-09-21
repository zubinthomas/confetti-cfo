// Parser for the pottery workshop's weekly shift roster (data-sources/
// Daronda_7day_Roster.xlsx). This is a RECURRING weekly upload - a new
// workbook every week - so every record carries a natural key (employeeName,
// date) that server/import/mergeShiftRoster.ts upserts on.
//
// Confirmed against the real file before writing this:
//   - The one sample file holds FOUR stacked week-blocks in a single sheet,
//     each with its own title row (date range), header row ~3 rows below it,
//     ~37 employee rows, and a 'DAILY STAFF PRESENT' row before the next
//     block. A parser assuming "one week per file" would silently drop 3 of
//     4 weeks in this exact sample - so this loops over week-blocks by
//     scanning for title rows, rather than assuming a fixed single block.
//   - Every employee row is fully populated (no forward-fill needed here,
//     unlike parseProduction.ts's sheets).
//   - Shift cells are only ever 'OFF' or an 'HH:MM-HH:MM' range (one typo
//     observed: '09:00-17:01', tolerated by the regex below).
//   - Department values include 'Security', which is not in
//     src/lib/hrDivisions.ts's DIVISIONS list - warned, imported as-is
//     (a product decision on whether to add it is out of scope here).
//   - Coverage Summary/Operating Notes sheets are seen but not parsed -
//     Coverage Summary is a pure aggregate of this sheet (recomputed live in
//     server/db/shiftRoster.ts instead of double-storing it), and Operating
//     Notes is free-text policy, not tabular data.
import type ExcelJS from 'exceljs';
import { str, dmy } from './xlsx.ts';
import { DEPARTMENTS_BY_LOWER } from './departments.ts';
import type { Issue, ParsedShiftRosterRecord, ParsedWorkbook } from './types.ts';

const ROSTER_SHEET = 'Proposed 7-Day Roster';
const TITLE_DATES_RE = /(\d{2}\.\d{2}\.\d{4})\s*to\s*(\d{2}\.\d{2}\.\d{4})/i;
const STAFF_PRESENT_RE = /STAFF PRESENT/i;
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export function findRosterSheet(wb: ExcelJS.Workbook): ExcelJS.Worksheet | null {
  return wb.worksheets.find((w) => w.name === ROSTER_SHEET) ?? null;
}

function findHeaderRow(ws: ExcelJS.Worksheet, fromRow: number): number | null {
  for (let r = fromRow; r <= Math.min(fromRow + 10, ws.rowCount); r++) {
    const nameCol = str(ws.getRow(r).getCell(1).value);
    const mondayCol = str(ws.getRow(r).getCell(7).value);
    if (nameCol === 'Name' && mondayCol === 'Monday') return r;
  }
  return null;
}

function parseShiftCell(raw: string | null): { isOff: boolean; shiftStart: string | null; shiftEnd: string | null } {
  if (raw === null) return { isOff: false, shiftStart: null, shiftEnd: null };
  if (raw.trim().toUpperCase() === 'OFF') return { isOff: true, shiftStart: null, shiftEnd: null };
  const m = raw.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})/);
  return m ? { isOff: false, shiftStart: m[1], shiftEnd: m[2] } : { isOff: false, shiftStart: null, shiftEnd: null };
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function parseRoster(wb: ExcelJS.Workbook): ParsedWorkbook {
  const issues: Issue[] = [];
  const records: ParsedShiftRosterRecord[] = [];
  const result = (): ParsedWorkbook => ({
    kind: 'shiftRoster', businessName: '', periods: [], financialRecords: [], salesRecords: [],
    consignmentRecords: [], employeeRecords: [], targetRecords: [], productionLogRecords: [], shiftRosterRecords: records, issues,
  });

  const ws = findRosterSheet(wb);
  if (!ws) {
    issues.push({ level: 'error', sheet: wb.worksheets[0]?.name ?? '(none)', message: `sheet "${ROSTER_SHEET}" not found` });
    return result();
  }

  let weeksFound = 0;
  let row = 1;
  while (row <= ws.rowCount) {
    const titleCell = str(ws.getRow(row).getCell(1).value);
    const titleMatch = titleCell ? titleCell.match(TITLE_DATES_RE) : null;
    if (!titleMatch) { row++; continue; }
    weeksFound++;

    const weekStart = dmy(titleMatch[1]);
    if (!weekStart) {
      issues.push({ level: 'error', sheet: ws.name, message: `row ${row}: could not parse week start date from title "${titleCell}"` });
      row++;
      continue;
    }

    const headerRow = findHeaderRow(ws, row + 1);
    if (!headerRow) {
      issues.push({ level: 'error', sheet: ws.name, message: `row ${row}: no header row found for week starting ${weekStart}` });
      row++;
      continue;
    }

    let employeeCount = 0;
    let r = headerRow + 1;
    for (; r <= ws.rowCount; r++) {
      const rowObj = ws.getRow(r);
      const name = str(rowObj.getCell(1).value);
      if (name && (TITLE_DATES_RE.test(name) || STAFF_PRESENT_RE.test(name))) break;
      if (!name) continue; // blank padding row before the next block marker

      employeeCount++;
      const gender = str(rowObj.getCell(2).value);
      const division = str(rowObj.getCell(3).value);
      if (division && !DEPARTMENTS_BY_LOWER.has(division.toLowerCase())) {
        issues.push({ level: 'warning', sheet: ws.name, message: `row ${r} (${name}): unrecognised department "${division}" - imported as-is` });
      }
      const functionalArea = str(rowObj.getCell(4).value);
      const designation = str(rowObj.getCell(5).value);
      const breakSlot = str(rowObj.getCell(6).value);
      const weeklyOffDay = str(rowObj.getCell(14).value);

      for (let d = 0; d < DAYS.length; d++) {
        const raw = str(rowObj.getCell(7 + d).value);
        const shift = parseShiftCell(raw);
        if (raw !== null && !shift.isOff && !shift.shiftStart) {
          issues.push({ level: 'warning', sheet: ws.name, message: `row ${r} (${name}), ${DAYS[d]}: unrecognised shift value "${raw}" - imported as shiftRaw only` });
        }
        records.push({
          employeeName: name,
          division,
          functionalArea,
          designation,
          gender,
          date: addDays(weekStart, d),
          weekStart,
          shiftRaw: raw,
          isOff: shift.isOff,
          shiftStart: shift.shiftStart,
          shiftEnd: shift.shiftEnd,
          breakSlot,
          weeklyOffDay,
        });
      }
    }

    if (employeeCount === 0) {
      issues.push({ level: 'warning', sheet: ws.name, message: `week starting ${weekStart}: no employee rows found` });
    }
    row = r;
  }

  if (weeksFound === 0) {
    issues.push({ level: 'error', sheet: ws.name, message: 'no week-block title rows found (expected e.g. "... ROSTER (DD.MM.YYYY to DD.MM.YYYY)")' });
  }

  for (const skipName of ['Coverage Summary', 'Operating Notes']) {
    const skipped = wb.worksheets.find((w) => w.name === skipName);
    if (skipped) {
      issues.push({
        level: 'info', sheet: skipped.name,
        message: skipName === 'Coverage Summary'
          ? 'seen but not imported - the same headcount aggregates are computed live from shift_roster instead'
          : 'seen but not imported - free-text policy notes, not tabular data',
      });
    }
  }

  return result();
}
