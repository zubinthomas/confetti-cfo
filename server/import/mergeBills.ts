// Resolve parsed bill-wise rows against the `tally_bills` table. Modeled on
// mergeOrders.ts: its own small self-contained matcher, not threaded into
// merge.ts's business/unit/period/financial-entity graph - a bill doesn't
// belong to any business unit any more than a bank account does (same
// precedent as bankAccounts/bankBalanceEntries, server/db/schema.ts).
//
// Natural key: (tallySourceId, ledgerName, billRef), normalized the same
// case/whitespace-insensitive way as orderMatchKey (parseOrders.ts) - stored
// as its own `matchKey` column (server/db/schema.ts's
// tally_bills_source_match_key unique index) rather than a composite index
// over the raw columns.
//
// One departure from mergeOrders.ts's "never delete, keep last-known state"
// precedent: an order's last-known state stays correct forever even once
// it's no longer in the source sheet (it's just filtered client-side by
// dispatch status), but a bill's last-known state becomes actively wrong
// once it's paid off and genuinely drops out of Tally's own report - so
// after processing every incoming bill for one sync, any previously
// `outstanding` bill for this tallySourceId that wasn't in the latest fetch
// gets its status flipped to `resolved` (still an update, never a delete -
// same audit-trail shape, one more kind of field change). Tally's bill-wise
// reports are a full snapshot every cycle, not an incremental diff, so
// "missing from this sync" reliably means "cleared," not "the agent forgot
// to mention it."
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client.ts';
import type { ParsedBillRecord, RecordChange } from './types.ts';

export interface TableStats { creates: number; updates: number; unchanged: number; resolves: number }
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export interface BillsMergePlan {
  stats: { tallyBills: TableStats };
  details: { tallyBills: RecordChange[] };
  ops: ((tx: Tx) => Promise<void>)[];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function billMatchKey(r: Pick<ParsedBillRecord, 'ledgerName' | 'billRef'>): string {
  return `${norm(r.ledgerName)}|${norm(r.billRef)}`;
}

function sheetFields(r: ParsedBillRecord, key: string, now: string) {
  return {
    ledgerName: r.ledgerName,
    billRef: r.billRef,
    billDate: r.billDate,
    nature: r.nature,
    outstandingAmount: r.outstandingAmount,
    dueDate: r.dueDate,
    voucherDate: r.voucherDate,
    voucherType: r.voucherType,
    voucherNumber: r.voucherNumber,
    voucherAmount: r.voucherAmount,
    status: 'outstanding' as const,
    lastSeenAt: now,
    resolvedAt: null as string | null,
    matchKey: key,
  };
}

/** `records` must all belong to the same `tallySourceId` - callers group by
 *  source before calling this, same as `buildOrdersMergePlan`'s caller
 *  groups by business. Empty input is a no-op, not an error: a cycle with
 *  sync_bills on but nothing currently outstanding is a legitimate state. */
export async function buildBillsMergePlan(records: ParsedBillRecord[]): Promise<BillsMergePlan> {
  const stats: TableStats = { creates: 0, updates: 0, unchanged: 0, resolves: 0 };
  const details: RecordChange[] = [];
  const ops: ((tx: Tx) => Promise<void>)[] = [];

  if (records.length === 0) {
    return { stats: { tallyBills: stats }, details: { tallyBills: details }, ops };
  }

  const now = new Date().toISOString();
  const tallySourceId = records[0].tallySourceId;
  const existing = await db.select().from(schema.tallyBills).where(eq(schema.tallyBills.tallySourceId, tallySourceId));
  const byKey = new Map(existing.map((e) => [e.matchKey, e]));
  const seenKeys = new Set<string>();

  for (const r of records) {
    const key = billMatchKey(r);
    seenKeys.add(key);
    const match = byKey.get(key);
    const payload = sheetFields(r, key, now);

    if (!match) {
      const id = randomUUID();
      ops.push(async (tx) => {
        await tx.insert(schema.tallyBills).values({ id, createdDate: now, tallySourceId, ...payload });
      });
      stats.creates++;
      details.push({
        action: 'create',
        description: `${r.ledgerName} - ${r.billRef}`,
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
      await tx.update(schema.tallyBills).set(set).where(eq(schema.tallyBills.id, matchId));
    });
    stats.updates++;
    details.push({ action: 'update', description: `${r.ledgerName} - ${r.billRef}`, fields: changed });
  }

  for (const e of existing) {
    if (e.status !== 'outstanding' || seenKeys.has(e.matchKey)) continue;
    const id = e.id;
    ops.push(async (tx) => {
      await tx.update(schema.tallyBills).set({ status: 'resolved', resolvedAt: now }).where(eq(schema.tallyBills.id, id));
    });
    stats.resolves++;
    details.push({
      action: 'update',
      description: `${e.ledgerName} - ${e.billRef} (resolved)`,
      fields: [{ field: 'status', from: 'outstanding', to: 'resolved' }],
    });
  }

  return { stats: { tallyBills: stats }, details: { tallyBills: details }, ops };
}
