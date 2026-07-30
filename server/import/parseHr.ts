// Parser for the HR Mastersheet (data-sources/HR Mastersheet for IT.xlsx) -
// one flat sheet, one row per employee, header-name-driven (not fixed
// column positions, unlike the financial parsers) since this is a form
// export rather than a hand-built ledger.
//
// Data-quality normalization applied here, all found by a prior standalone
// analysis of the real file:
//   - "-" is the sheet's own placeholder for "no value" (heaviest in
//     Official Email, ~98/119 rows) - treated as blank everywhere.
//   - Department has case-duplicates ("Pottery"/"pottery") - matched
//     case-insensitively against the canonical department list and
//     normalized to the canonical casing.
//   - Aadhaar is stored with mixed Excel cell types (Number in ~76 rows,
//     String in ~43) - both unwrap to a plain digit string here.
//   - Employment Type casing differs from the app's exact dropdown values
//     ("Full-Time" vs "Full-time") - normalized to match.
// Only Full Name and Department are hard requirements (error-level,
// blocking) - every other gap is a warning: the row still imports, but
// flagged for a human to fill in later. Blocking the whole 119-row import
// over one row's incomplete designation would lose far more than it
// protects.
import type ExcelJS from 'exceljs';
import { str, num, dateVal, iso } from './xlsx.ts';
import type { Issue, ParsedEmployeeRecord, ParsedWorkbook } from './types.ts';

// Duplicated from src/lib/hrDivisions.ts, not imported - server/ has no
// existing precedent or tsconfig path back into src/ (confirmed before
// writing this). Keep in sync by hand if the department list changes.
const DEPARTMENTS = [
  'Accounts', 'Admin', 'Batik Unit', 'Culinary', 'Driver', 'F&B Services',
  'Jewellery', 'Legal', 'Marketing', 'Partner', 'Pottery',
  'Quality Control', 'Retail', 'Tailor', 'Utility',
];
const DEPARTMENTS_BY_LOWER = new Map(DEPARTMENTS.map((d) => [d.toLowerCase(), d]));

const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract', 'Intern'];
const EMPLOYMENT_TYPES_BY_LOWER = new Map(EMPLOYMENT_TYPES.map((t) => [t.toLowerCase(), t]));

const STATUSES = ['Active', 'On Leave', 'Terminated', 'Probation'];

const HEADERS = [
  'Full Name*', 'Gender', 'Date of Birth', 'Personal Email', 'Official Email',
  'Joining Date*', 'Phone', 'Department*', 'Designation*', 'Emergency Contact',
  'Emerg. Relation', 'Emerg. Phone', 'Address', 'Employment Type*',
  'Reporting Manager*', 'Location', 'Pottery Grade', 'Status*', 'Aadhaar',
  'Pan', 'Bank Details', 'IFSC',
] as const;
type Header = typeof HEADERS[number];

/** "-" is the sheet's own placeholder for "no value" - same handling as a
 *  true blank everywhere it appears. */
function cell(s: string | null): string | null {
  return s === null || s === '-' ? null : s;
}

/** Aadhaar/Phone are stored as either a Number or String cell in the real
 *  file - unwrap either to a plain digit string, never scientific notation
 *  or a decimal point. */
function idStr(v: ExcelJS.CellValue): string | null {
  const n = num(v);
  if (n != null) return String(Math.trunc(n));
  return cell(str(v));
}

/** Joining Date is sometimes just a bare year (a plain Number cell, e.g.
 *  2024 - not a "-" placeholder, not blank, just less precise than a full
 *  date) for ~30 rows in the real file. Defaults to January 1st of that
 *  year rather than discarding the year entirely. */
function yearOnlyDate(v: ExcelJS.CellValue): string | null {
  const n = num(v);
  return n != null && Number.isInteger(n) && n >= 1950 && n <= new Date().getUTCFullYear() + 1
    ? `${n}-01-01`
    : null;
}

function findHeaderRow(ws: ExcelJS.Worksheet): Map<Header, number> | null {
  const cols = new Map<Header, number>();
  const row = ws.getRow(1);
  row.eachCell({ includeEmpty: false }, (c, colNumber) => {
    const v = str(c.value);
    if (v && (HEADERS as readonly string[]).includes(v)) cols.set(v as Header, colNumber);
  });
  return cols.has('Full Name*') && cols.has('Department*') && cols.has('Aadhaar') ? cols : null;
}

function normalizeDepartment(raw: string, sheet: string, rowNum: number, issues: Issue[]): string {
  const canonical = DEPARTMENTS_BY_LOWER.get(raw.toLowerCase());
  if (canonical) return canonical;
  issues.push({ level: 'warning', sheet, message: `row ${rowNum}: unrecognised department "${raw}" - imported as-is` });
  return raw;
}

function normalizeEmploymentType(raw: string, sheet: string, rowNum: number, issues: Issue[]): string {
  const canonical = EMPLOYMENT_TYPES_BY_LOWER.get(raw.toLowerCase());
  if (canonical) return canonical;
  issues.push({ level: 'warning', sheet, message: `row ${rowNum}: unrecognised employment type "${raw}" - imported as-is` });
  return raw;
}

function normalizeStatus(raw: string, sheet: string, rowNum: number, issues: Issue[]): string {
  if (STATUSES.includes(raw)) return raw;
  issues.push({ level: 'warning', sheet, message: `row ${rowNum}: unrecognised status "${raw}" - imported as-is` });
  return raw;
}

export function parseHr(wb: ExcelJS.Workbook): ParsedWorkbook {
  const issues: Issue[] = [];
  const records: ParsedEmployeeRecord[] = [];

  const ws = wb.worksheets.find((w) => findHeaderRow(w) !== null);
  if (!ws) {
    issues.push({ level: 'error', sheet: wb.worksheets[0]?.name ?? '(none)', message: 'no HR Mastersheet header row found' });
    return { kind: 'hr', businessName: '', periods: [], financialRecords: [], salesRecords: [], consignmentRecords: [], employeeRecords: [], issues };
  }
  const cols = findHeaderRow(ws)!;
  const at = (row: ExcelJS.Row, h: Header) => (cols.has(h) ? row.getCell(cols.get(h)!).value : null);

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const fullName = cell(str(at(row, 'Full Name*')));
    // A fully blank row (trailing sheet padding) is skipped silently, not
    // flagged - it's not a data-quality problem, just empty space.
    const rowIsBlank = HEADERS.every((h) => cell(str(at(row, h))) === null && idStr(at(row, h)) === null && dateVal(at(row, h)) === null);
    if (rowIsBlank) continue;

    if (!fullName) {
      issues.push({ level: 'error', sheet: ws.name, message: `row ${r}: missing Full Name` });
      continue;
    }
    const departmentRaw = cell(str(at(row, 'Department*')));
    if (!departmentRaw) {
      issues.push({ level: 'error', sheet: ws.name, message: `row ${r} (${fullName}): missing Department` });
      continue;
    }
    const division = normalizeDepartment(departmentRaw, ws.name, r, issues);

    const designation = cell(str(at(row, 'Designation*')));
    if (!designation) issues.push({ level: 'warning', sheet: ws.name, message: `row ${r} (${fullName}): missing Designation` });

    const employmentTypeRaw = cell(str(at(row, 'Employment Type*')));
    if (!employmentTypeRaw) issues.push({ level: 'warning', sheet: ws.name, message: `row ${r} (${fullName}): missing Employment Type` });
    const employmentType = employmentTypeRaw ? normalizeEmploymentType(employmentTypeRaw, ws.name, r, issues) : '';

    const statusRaw = cell(str(at(row, 'Status*')));
    if (!statusRaw) issues.push({ level: 'warning', sheet: ws.name, message: `row ${r} (${fullName}): missing Status` });
    const status = statusRaw ? normalizeStatus(statusRaw, ws.name, r, issues) : '';

    const joiningDateExact = dateVal(at(row, 'Joining Date*'));
    const joiningDateYearOnly = joiningDateExact ? null : yearOnlyDate(at(row, 'Joining Date*'));
    const joiningDate = joiningDateExact ? iso(joiningDateExact) : joiningDateYearOnly;
    if (joiningDateYearOnly) {
      issues.push({ level: 'warning', sheet: ws.name, message: `row ${r} (${fullName}): Joining Date is year-only - defaulted to Jan 1` });
    } else if (!joiningDate) {
      issues.push({ level: 'warning', sheet: ws.name, message: `row ${r} (${fullName}): missing Joining Date` });
    }

    const aadharNumber = idStr(at(row, 'Aadhaar'));
    if (!aadharNumber) {
      issues.push({
        level: 'warning', sheet: ws.name,
        message: `row ${r} (${fullName}): no Aadhaar - will be matched by name on re-import, which is less reliable`,
      });
    }

    const personalEmail = cell(str(at(row, 'Personal Email')));
    const officialEmail = cell(str(at(row, 'Official Email')));
    const potteryGradeRaw = num(at(row, 'Pottery Grade'));

    records.push({
      fullName,
      division,
      role: designation ?? '',
      employmentType,
      status,
      joiningDate: joiningDate ?? '',
      phone: idStr(at(row, 'Phone')),
      // Official Email is blank ("-") for most rows in the real sheet -
      // Personal Email is the more usable fallback for actually reaching
      // someone (e.g. a self-service invite).
      email: officialEmail ?? personalEmail,
      aadharNumber,
      panNumber: cell(str(at(row, 'Pan'))),
      address: cell(str(at(row, 'Address'))),
      emergencyContactName: cell(str(at(row, 'Emergency Contact'))),
      emergencyContactPhone: idStr(at(row, 'Emerg. Phone')),
      emergencyContactRelation: cell(str(at(row, 'Emerg. Relation'))),
      gender: cell(str(at(row, 'Gender'))),
      dateOfBirth: (() => { const d = dateVal(at(row, 'Date of Birth')); return d ? iso(d) : null; })(),
      reportingManager: cell(str(at(row, 'Reporting Manager*'))),
      location: cell(str(at(row, 'Location'))),
      potteryGrade: potteryGradeRaw != null ? Math.trunc(potteryGradeRaw) : null,
      bankAccountNumber: idStr(at(row, 'Bank Details')),
      ifscCode: cell(str(at(row, 'IFSC'))),
    });
  }

  return {
    kind: 'hr',
    businessName: '',
    periods: [],
    financialRecords: [],
    salesRecords: [],
    consignmentRecords: [],
    employeeRecords: records,
    issues,
  };
}
