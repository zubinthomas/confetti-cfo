// Resolve parsed Compliance Payment Tracker rows against the four
// compliance_* tables. Modeled on mergeBills.ts: its own small
// self-contained matchers, not threaded into merge.ts's business/unit/
// period/financial-entity graph - none of these four tables belong to any
// business unit, same precedent as tally_bills. Four independent loops,
// one per table (not a shared generic) - Drizzle's per-table column types
// don't abstract over cleanly, and mergeBills.ts/mergeOrders.ts already
// establish writing each matcher out explicitly as the house style.
//
// Unlike mergeBills.ts, there is deliberately NO "resolve missing rows"
// pass here. Tally's bill-wise report is a full snapshot every sync
// cycle, so "missing from this fetch" reliably means "cleared." This
// client-maintained Excel file has no such guarantee - a row disappearing
// from a later upload might mean the client deleted a line by mistake,
// trimmed the sheet to "this year only," or genuinely resolved it.
// Flipping status or deleting on that signal risks silently discarding a
// still-valid compliance record; that's a call for a human reviewing the
// batch, not this importer. Rows simply aren't touched if they're absent
// from the latest upload.
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client.ts';
import type {
  ParsedCompliancePaymentRecord, ParsedComplianceDocumentRecord,
  ParsedComplianceTrademarkRecord, ParsedComplianceDirectorRecord, RecordChange,
} from './types.ts';
import { compliancePaymentMatchKey, complianceDocumentMatchKey } from './parseCompliance.ts';

export interface TableStats { creates: number; updates: number; unchanged: number }
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export interface ComplianceMergePlan {
  stats: {
    compliancePayments: TableStats; complianceDocuments: TableStats;
    complianceTrademarks: TableStats; complianceDirectors: TableStats;
  };
  details: {
    compliancePayments: RecordChange[]; complianceDocuments: RecordChange[];
    complianceTrademarks: RecordChange[]; complianceDirectors: RecordChange[];
  };
  ops: ((tx: Tx) => Promise<void>)[];
}

const stat = (): TableStats => ({ creates: 0, updates: 0, unchanged: 0 });

/** Dedup across (not within - parseCompliance.ts already handles that per
 *  sheet) sheets that could both produce the same natural key, e.g. two
 *  licence_tax sheets. Last one in the workbook wins. */
function dedupBy<T>(records: T[], keyOf: (r: T) => string): Map<string, T> {
  const out = new Map<string, T>();
  for (const r of records) out.set(keyOf(r), r);
  return out;
}

async function mergePayments(records: ParsedCompliancePaymentRecord[], now: string, stats: TableStats, details: RecordChange[], ops: ((tx: Tx) => Promise<void>)[]) {
  if (records.length === 0) return;
  const existing = await db.select().from(schema.compliancePayments);
  const byKey = new Map(existing.map((e) => [e.matchKey, e]));
  const byRecordKey = dedupBy(records, compliancePaymentMatchKey);

  for (const [key, r] of byRecordKey) {
    const payload = {
      category: r.category, location: r.location, itemName: r.itemName, detail: r.detail,
      policyNumber: r.policyNumber, dueDateRaw: r.dueDateRaw, dueDate: r.dueDate, amount: r.amount,
      paymentStatus: r.paymentStatus, paidOn: r.paidOn, scheduledFollowUpRaw: r.scheduledFollowUpRaw,
      scheduledFollowUp: r.scheduledFollowUp, remarks: r.remarks, sourceSheet: r.sourceSheet,
      sourceRow: r.sourceRow, matchKey: key,
    };
    const label = `${r.location} - ${r.itemName}`;
    const match = byKey.get(key);

    if (!match) {
      const id = randomUUID();
      ops.push(async (tx) => { await tx.insert(schema.compliancePayments).values({ id, createdDate: now, ...payload }); });
      stats.creates++;
      details.push({ action: 'create', description: label, fields: Object.entries(payload).filter(([, v]) => v != null).map(([field, to]) => ({ field, from: null as unknown, to })) });
      continue;
    }

    const changed: { field: string; from: unknown; to: unknown }[] = [];
    const set: Record<string, unknown> = {};
    for (const [field, to] of Object.entries(payload)) {
      const from = (match as Record<string, unknown>)[field];
      if (!Object.is(from, to)) { changed.push({ field, from, to }); set[field] = to; }
    }
    if (changed.length === 0) { stats.unchanged++; continue; }
    const matchId = match.id;
    ops.push(async (tx) => { await tx.update(schema.compliancePayments).set(set).where(eq(schema.compliancePayments.id, matchId)); });
    stats.updates++;
    details.push({ action: 'update', description: label, fields: changed });
  }
}

async function mergeDocuments(records: ParsedComplianceDocumentRecord[], now: string, stats: TableStats, details: RecordChange[], ops: ((tx: Tx) => Promise<void>)[]) {
  if (records.length === 0) return;
  const existing = await db.select().from(schema.complianceDocuments);
  const byKey = new Map(existing.map((e) => [e.matchKey, e]));
  const byRecordKey = dedupBy(records, complianceDocumentMatchKey);

  for (const [key, r] of byRecordKey) {
    const payload = {
      documentName: r.documentName, documentType: r.documentType, documentNumber: r.documentNumber,
      issueDateRaw: r.issueDateRaw, issueDate: r.issueDate, filingDateRaw: r.filingDateRaw, filingDate: r.filingDate,
      expiryDateRaw: r.expiryDateRaw, expiryDate: r.expiryDate, status: r.status, remarks: r.remarks, matchKey: key,
    };
    const match = byKey.get(key);

    if (!match) {
      const id = randomUUID();
      ops.push(async (tx) => { await tx.insert(schema.complianceDocuments).values({ id, createdDate: now, ...payload }); });
      stats.creates++;
      details.push({ action: 'create', description: r.documentName, fields: Object.entries(payload).filter(([, v]) => v != null).map(([field, to]) => ({ field, from: null as unknown, to })) });
      continue;
    }

    const changed: { field: string; from: unknown; to: unknown }[] = [];
    const set: Record<string, unknown> = {};
    for (const [field, to] of Object.entries(payload)) {
      const from = (match as Record<string, unknown>)[field];
      if (!Object.is(from, to)) { changed.push({ field, from, to }); set[field] = to; }
    }
    if (changed.length === 0) { stats.unchanged++; continue; }
    const matchId = match.id;
    ops.push(async (tx) => { await tx.update(schema.complianceDocuments).set(set).where(eq(schema.complianceDocuments.id, matchId)); });
    stats.updates++;
    details.push({ action: 'update', description: r.documentName, fields: changed });
  }
}

async function mergeTrademarks(records: ParsedComplianceTrademarkRecord[], now: string, stats: TableStats, details: RecordChange[], ops: ((tx: Tx) => Promise<void>)[]) {
  if (records.length === 0) return;
  const existing = await db.select().from(schema.complianceTrademarks);
  const byKey = new Map(existing.map((e) => [e.applicationNo, e]));
  const byRecordKey = dedupBy(records, (r) => r.applicationNo);

  for (const [key, r] of byRecordKey) {
    const payload = {
      applicationNo: key, niceClass: r.niceClass, dateOfApplicationRaw: r.dateOfApplicationRaw,
      dateOfApplication: r.dateOfApplication, markName: r.markName, tmType: r.tmType, status: r.status, remarks: r.remarks,
    };
    const label = r.markName ?? key;
    const match = byKey.get(key);

    if (!match) {
      const id = randomUUID();
      ops.push(async (tx) => { await tx.insert(schema.complianceTrademarks).values({ id, createdDate: now, ...payload }); });
      stats.creates++;
      details.push({ action: 'create', description: label, fields: Object.entries(payload).filter(([, v]) => v != null).map(([field, to]) => ({ field, from: null as unknown, to })) });
      continue;
    }

    const changed: { field: string; from: unknown; to: unknown }[] = [];
    const set: Record<string, unknown> = {};
    for (const [field, to] of Object.entries(payload)) {
      const from = (match as Record<string, unknown>)[field];
      if (!Object.is(from, to)) { changed.push({ field, from, to }); set[field] = to; }
    }
    if (changed.length === 0) { stats.unchanged++; continue; }
    const matchId = match.id;
    ops.push(async (tx) => { await tx.update(schema.complianceTrademarks).set(set).where(eq(schema.complianceTrademarks.id, matchId)); });
    stats.updates++;
    details.push({ action: 'update', description: label, fields: changed });
  }
}

async function mergeDirectors(records: ParsedComplianceDirectorRecord[], now: string, stats: TableStats, details: RecordChange[], ops: ((tx: Tx) => Promise<void>)[]) {
  if (records.length === 0) return;
  const existing = await db.select().from(schema.complianceDirectors);
  const byKey = new Map(existing.map((e) => [e.din, e]));
  const byRecordKey = dedupBy(records, (r) => r.din);

  for (const [key, r] of byRecordKey) {
    const payload = {
      din: key, name: r.name, designation: r.designation, dateOfAppointmentRaw: r.dateOfAppointmentRaw,
      dateOfAppointment: r.dateOfAppointment, aadhaarNumber: r.aadhaarNumber, panNumber: r.panNumber,
      email: r.email, contactNumber: r.contactNumber,
    };
    const label = r.name ?? key;
    const match = byKey.get(key);

    if (!match) {
      const id = randomUUID();
      ops.push(async (tx) => { await tx.insert(schema.complianceDirectors).values({ id, createdDate: now, ...payload }); });
      stats.creates++;
      details.push({ action: 'create', description: label, fields: Object.entries(payload).filter(([, v]) => v != null).map(([field, to]) => ({ field, from: null as unknown, to })) });
      continue;
    }

    const changed: { field: string; from: unknown; to: unknown }[] = [];
    const set: Record<string, unknown> = {};
    for (const [field, to] of Object.entries(payload)) {
      const from = (match as Record<string, unknown>)[field];
      if (!Object.is(from, to)) { changed.push({ field, from, to }); set[field] = to; }
    }
    if (changed.length === 0) { stats.unchanged++; continue; }
    const matchId = match.id;
    ops.push(async (tx) => { await tx.update(schema.complianceDirectors).set(set).where(eq(schema.complianceDirectors.id, matchId)); });
    stats.updates++;
    details.push({ action: 'update', description: label, fields: changed });
  }
}

export async function buildComplianceMergePlan(
  paymentRecords: ParsedCompliancePaymentRecord[],
  documentRecords: ParsedComplianceDocumentRecord[],
  trademarkRecords: ParsedComplianceTrademarkRecord[],
  directorRecords: ParsedComplianceDirectorRecord[],
): Promise<ComplianceMergePlan> {
  const now = new Date().toISOString();
  const stats = {
    compliancePayments: stat(), complianceDocuments: stat(), complianceTrademarks: stat(), complianceDirectors: stat(),
  };
  const details = {
    compliancePayments: [] as RecordChange[], complianceDocuments: [] as RecordChange[],
    complianceTrademarks: [] as RecordChange[], complianceDirectors: [] as RecordChange[],
  };
  const ops: ((tx: Tx) => Promise<void>)[] = [];

  await mergePayments(paymentRecords, now, stats.compliancePayments, details.compliancePayments, ops);
  await mergeDocuments(documentRecords, now, stats.complianceDocuments, details.complianceDocuments, ops);
  await mergeTrademarks(trademarkRecords, now, stats.complianceTrademarks, details.complianceTrademarks, ops);
  await mergeDirectors(directorRecords, now, stats.complianceDirectors, details.complianceDirectors, ops);

  return { stats, details, ops };
}
