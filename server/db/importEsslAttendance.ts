// One-off/manually-rerun import of actual attendance from the client's eSSL
// eTimeTrackLite biometric terminal into attendance_records (db/schema.ts).
// Source is a "full DB backup" .mdb (Access/Jet) file eTimeTrackLite can
// export from its own menu - there's no live sync yet (see the schema
// comment for why). Reads via the `mdbtools` CLI (mdb-export), which must
// be installed on whatever machine runs this.
//
//   node db/importEsslAttendance.ts /path/to/eTimeTrackLite1.mdb
//
// Idempotent: upserts attendance_records by (employeeName, date), so
// re-running against a fresher backup just updates changed days.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { db, ready, close, schema } from './client.ts';
import { normalizeName } from '../import/nameMatch.ts';

const mdbPath = process.argv[2];
if (!mdbPath) {
  console.error('usage: node db/importEsslAttendance.ts /path/to/backup.mdb');
  process.exit(1);
}

// eTimeTrackLite ships three literal "Test Employee N" rows (EmployeeCode
// T1/T2/T3) in every install - not real staff, never attended anything.
const isTestEmployee = (code: string, name: string) => /^T\d*$/.test(code) || /^Test Employee/i.test(name);

// A handful of real people whose name spelling differs slightly between
// eTimeTrackLite and confetti-cfo's HR Mastersheet import (confirmed by
// hand against both tables on 2026-11-02) - normalizeName alone won't
// bridge these, so they're corrected here rather than left unmatched.
const NAME_ALIASES: Record<string, string> = {
  'buddhadeb tapadar': 'buddhadev tapadar',
  'dona ghosal': 'dona ghoshal',
  'rekha roychowdhury': 'rekha roy chowdhury',
};

function mdbExport(table: string): Record<string, string>[] {
  const csv = execFileSync('mdb-export', [mdbPath, table], { maxBuffer: 1024 * 1024 * 200 }).toString('utf-8');
  return parseCsv(csv);
}

// Minimal RFC4180 parser: mdb-export quotes every field and doubles internal
// quotes, which is all this needs to handle correctly.
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') continue;
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const [header, ...dataRows] = rows;
  return dataRows.filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

// '04/30/26 00:00:00' -> '2026-04-30'. eTimeTrackLite's dates are always
// 2-digit years in the current century - fine for a system installed in 2026.
function toIsoDate(mmddyy: string): string {
  const [mm, dd, yy] = mmddyy.split(' ')[0].split('/');
  return `20${yy}-${mm}-${dd}`;
}

// '2026-08-19 14:21:23' -> '14:21'; '1900-01-01 00:00:00' (eTimeTrackLite's
// placeholder for "no punch") -> null.
function toHHMM(raw: string): string | null {
  if (!raw || raw.startsWith('1900-01-01')) return null;
  const m = raw.match(/(\d{2}:\d{2}):\d{2}$/);
  return m ? m[1] : null;
}

const toInt = (raw: string): number => {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
};

await ready();

const essl = {
  employees: mdbExport('Employees'),
  attendance: mdbExport('AttendanceLogs'),
};

const esslEmployeeById = new Map(
  essl.employees
    .filter((e) => !isTestEmployee(e.EmployeeCode, e.EmployeeName))
    .map((e) => [e.EmployeeId, e.EmployeeName]),
);

const realEmployees = await db.select({ id: schema.employees.id, fullName: schema.employees.fullName }).from(schema.employees);
const employeeIdByNormalizedName = new Map(
  realEmployees.filter((e) => e.fullName).map((e) => [normalizeName(e.fullName as string), e.id]),
);

function resolveEmployeeId(esslName: string): string | null {
  const normalized = normalizeName(esslName);
  return employeeIdByNormalizedName.get(normalized)
    ?? employeeIdByNormalizedName.get(NAME_ALIASES[normalized] ?? '')
    ?? null;
}

let touched = 0, skippedTestOrUnknownEmployee = 0;
const unmatchedNames = new Set<string>();

for (const row of essl.attendance) {
  const employeeName = esslEmployeeById.get(row.EmployeeId);
  if (!employeeName) { skippedTestOrUnknownEmployee++; continue; }

  const employeeId = resolveEmployeeId(employeeName);
  if (!employeeId) unmatchedNames.add(employeeName);

  const date = toIsoDate(row.AttendanceDate);
  const values = {
    createdDate: new Date().toISOString(),
    employeeName,
    employeeId,
    date,
    statusCode: row.StatusCode.trim(),
    statusLabel: row.Status.replace(/\s+/g, ' ').trim(),
    inTime: toHHMM(row.InTime),
    outTime: toHHMM(row.OutTime),
    durationMinutes: toInt(row.Duration),
    lateByMinutes: toInt(row.LateBy),
    earlyByMinutes: toInt(row.EarlyBy),
    overtimeMinutes: toInt(row.OverTime),
    missedInPunch: row.MissedInPunch === '1',
    missedOutPunch: row.MissedOutPunch === '1',
    punchRecords: row.PunchRecords || null,
    source: 'essl',
  };

  const result = await db.insert(schema.attendanceRecords)
    .values({ id: randomUUID(), ...values })
    .onConflictDoUpdate({
      target: [schema.attendanceRecords.employeeName, schema.attendanceRecords.date],
      set: values,
    })
    .returning({ id: schema.attendanceRecords.id });
  if (result.length) touched++;
}

console.log(`eSSL attendance import done.`);
console.log(`  rows touched: ${touched}`);
console.log(`  skipped (test employee or unknown EmployeeId): ${skippedTestOrUnknownEmployee}`);
if (unmatchedNames.size) {
  console.log(`  names with no HR employee match (${unmatchedNames.size}):`);
  for (const n of unmatchedNames) console.log(`    - ${n}`);
}

await close();
process.exit(0);
