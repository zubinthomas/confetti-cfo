// Resolve parsed HR Mastersheet rows against the `employees` table. Separate
// from merge.ts: employees use text/UUID ids (not merge.ts's integer
// alloc() counters) and this is one flat table, not a web of dimensions to
// resolve through - so it gets its own small, self-contained matcher rather
// than being threaded into the existing multi-table machinery.
//
// Natural key: Aadhaar number when the sheet row has one, else a normalized
// full-name match against existing employees who *also* have no Aadhaar on
// file (never against an Aadhaar-identified row - a name coincidence
// shouldn't silently merge into someone else's solid identity). Matched
// rows update only the fields the sheet supplies; every manual-only field
// (salary, documents, notes, employeeId, ...) is never read or written
// here, so a re-import can never clobber anything entered through the HR
// UI. Unmatched rows insert as new. Nothing is ever deleted - an employee
// who drops out of a re-imported sheet is simply not touched, matching the
// rest of the import system's strictly additive behavior.
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client.ts';
import type { ParsedEmployeeRecord, RecordChange } from './types.ts';

export interface TableStats { creates: number; updates: number; unchanged: number }
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export interface EmployeeMergePlan {
  stats: { employees: TableStats };
  details: { employees: RecordChange[] };
  ops: ((tx: Tx) => Promise<void>)[];
}

const normalizeName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const blankToNull = (s: string) => (s ? s : null);

// The sheet-owned columns, in both directions: read off a parsed record to
// build an insert/update payload, and diffed against an existing row.
function sheetFields(r: ParsedEmployeeRecord) {
  return {
    fullName: r.fullName,
    division: r.division,
    role: blankToNull(r.role),
    employmentType: blankToNull(r.employmentType),
    status: blankToNull(r.status),
    joiningDate: blankToNull(r.joiningDate),
    phone: r.phone,
    email: r.email,
    aadharNumber: r.aadharNumber,
    panNumber: r.panNumber,
    address: r.address,
    emergencyContactName: r.emergencyContactName,
    emergencyContactPhone: r.emergencyContactPhone,
    emergencyContactRelation: r.emergencyContactRelation,
    gender: r.gender,
    dateOfBirth: r.dateOfBirth,
    reportingManager: r.reportingManager,
    location: r.location,
    potteryGrade: r.potteryGrade,
    bankAccountNumber: r.bankAccountNumber,
    ifscCode: r.ifscCode,
  };
}

export async function buildEmployeeMergePlan(records: ParsedEmployeeRecord[]): Promise<EmployeeMergePlan> {
  const stats: TableStats = { creates: 0, updates: 0, unchanged: 0 };
  const details: RecordChange[] = [];
  const ops: ((tx: Tx) => Promise<void>)[] = [];

  const existing = await db.select().from(schema.employees);
  const byAadhar = new Map(existing.filter((e) => e.aadharNumber).map((e) => [e.aadharNumber as string, e]));
  const byName = new Map(existing.filter((e) => !e.aadharNumber && e.fullName).map((e) => [normalizeName(e.fullName as string), e]));

  for (const r of records) {
    const match = r.aadharNumber ? byAadhar.get(r.aadharNumber) : byName.get(normalizeName(r.fullName));
    const payload = sheetFields(r);

    if (!match) {
      const id = randomUUID();
      ops.push(async (tx) => {
        await tx.insert(schema.employees).values({
          id, createdDate: new Date().toISOString(), ...payload,
        });
      });
      stats.creates++;
      details.push({
        action: 'create', description: `${r.fullName} (${r.division})`,
        fields: Object.entries(payload).filter(([, v]) => v != null).map(([field, to]) => ({ field, from: null as unknown, to })),
      });
      continue;
    }

    const changed: { field: string; from: unknown; to: unknown }[] = [];
    const set: Record<string, unknown> = {};
    for (const [field, to] of Object.entries(payload)) {
      const from = (match as Record<string, unknown>)[field];
      if (!Object.is(from, to)) {
        changed.push({ field, from, to });
        set[field] = to;
      }
    }
    if (changed.length === 0) {
      stats.unchanged++;
      continue;
    }
    const matchId = match.id;
    ops.push(async (tx) => {
      await tx.update(schema.employees).set(set).where(eq(schema.employees.id, matchId));
    });
    stats.updates++;
    details.push({ action: 'update', description: `${r.fullName} (${r.division})`, fields: changed });
  }

  return { stats: { employees: stats }, details: { employees: details }, ops };
}
