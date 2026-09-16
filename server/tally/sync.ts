// Turn one agent push into ParsedWorkbook-shaped batches and run them
// through the normal import pipeline - same contract as sheets/sync.ts's
// syncSource (never throws; outcome is always recorded on the source row).
//
// A pushed record only carries a ledger name; the ledger -> business unit +
// line item mapping (tally_ledger_mappings) resolves it to something
// buildMergePlan already understands. Because a ParsedWorkbook belongs to
// exactly one business (merge.ts computes a single businessId per workbook),
// records are grouped by the mapped unit's business and one batch is built
// per business - the same way a CEPL upload and a Sienna upload are always
// two separate batches today, never one.
import { eq, inArray } from 'drizzle-orm';
import { db, ready, schema } from '../db/client.ts';
import { buildMergePlan, commitMergePlan } from '../import/merge.ts';
import { canAutoCommit } from '../sheets/sync.ts';
import { fiscalYearOf, monthPeriod } from '../import/types.ts';
import type { Issue, ParsedFinancialRecord, ParsedPeriod, ParsedWorkbook } from '../import/types.ts';

export interface TallyRecordInput {
  ledgerName: string;
  periodType: 'month' | 'week' | 'custom';
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;   // YYYY-MM-DD; same as periodStart for a point-in-time balance
  value: number;
}

type TallySource = typeof schema.tallySources.$inferSelect;
type ImportBatch = typeof schema.importBatches.$inferSelect;
export type TallySyncStatus = 'preview_created' | 'auto_committed' | 'no_changes' | 'error';

export interface TallySyncResult {
  status: TallySyncStatus;
  source: TallySource;
  batches: ImportBatch[];
  error?: string;
  unmappedLedgers: string[];
}

async function recordOutcome(
  sourceId: number, status: TallySyncStatus, error: string | null, issues: Issue[] | null,
): Promise<TallySource> {
  const [updated] = await db.update(schema.tallySources).set({
    lastSyncAt: new Date().toISOString(),
    lastSyncStatus: status,
    lastSyncError: error ? error.slice(0, 500) : null,
    lastSyncIssues: issues,
  }).where(eq(schema.tallySources.id, sourceId)).returning();
  return updated;
}

/** Reuses monthPeriod's label/fiscal-year logic for month periods; a
 *  week/custom (e.g. a daily "as of" balance) period gets a plainer label -
 *  matches the fallback merge.ts already applies to a parser that "forgot"
 *  to declare a period, just done properly here since it's easy to. */
function periodFor(input: TallyRecordInput): ParsedPeriod {
  const [year, month] = input.periodStart.split('-').map(Number);
  if (input.periodType === 'month') return monthPeriod(year, month);
  return {
    periodType: input.periodType,
    startDate: input.periodStart,
    endDate: input.periodEnd,
    label: input.periodStart === input.periodEnd ? `As of ${input.periodStart}` : `${input.periodStart} – ${input.periodEnd}`,
    fiscalYear: fiscalYearOf(year, month),
    isSpecialEvent: false,
  };
}

interface BusinessBucket {
  businessName: string;
  records: ParsedFinancialRecord[];
  periods: Map<string, ParsedPeriod>;
}

/** Never throws: failures are recorded on the source row, same contract as
 *  sheets/sync.ts's syncSource. */
export async function syncTallyPush(source: TallySource, records: TallyRecordInput[]): Promise<TallySyncResult> {
  await ready();
  try {
    if (records.length === 0) {
      return {
        status: 'no_changes', batches: [], unmappedLedgers: [],
        source: await recordOutcome(source.id, 'no_changes', null, null),
      };
    }

    const mappings = await db.select().from(schema.tallyLedgerMappings)
      .where(eq(schema.tallyLedgerMappings.tallySourceId, source.id));
    const mappingByLedger = new Map(mappings.map((m) => [m.ledgerName, m]));

    const unitIds = [...new Set(mappings.map((m) => m.businessUnitId).filter((v): v is number => v != null))];
    const lineItemIds = [...new Set(mappings.map((m) => m.lineItemId).filter((v): v is number => v != null))];
    const [units, lineItems, businesses] = await Promise.all([
      unitIds.length ? db.select().from(schema.businessUnits).where(inArray(schema.businessUnits.id, unitIds)) : Promise.resolve([]),
      lineItemIds.length ? db.select().from(schema.lineItems).where(inArray(schema.lineItems.id, lineItemIds)) : Promise.resolve([]),
      db.select().from(schema.businesses),
    ]);
    const unitById = new Map(units.map((u) => [u.id, u]));
    const lineItemById = new Map(lineItems.map((l) => [l.id, l]));
    const businessById = new Map(businesses.map((b) => [b.id, b]));

    const unmapped = new Set<string>();
    const byBusiness = new Map<number, BusinessBucket>();

    for (const r of records) {
      const mapping = mappingByLedger.get(r.ledgerName);
      const unit = mapping?.businessUnitId != null ? unitById.get(mapping.businessUnitId) : undefined;
      const lineItem = mapping?.lineItemId != null ? lineItemById.get(mapping.lineItemId) : undefined;
      if (!unit || !lineItem) { unmapped.add(r.ledgerName); continue; }
      const business = businessById.get(unit.businessId);
      if (!business) { unmapped.add(r.ledgerName); continue; }

      const bucket: BusinessBucket = byBusiness.get(business.id) ?? { businessName: business.name, records: [], periods: new Map() };
      const period = periodFor(r);
      bucket.periods.set(`${period.periodType}|${period.startDate}|${period.endDate}`, period);
      bucket.records.push({
        businessName: business.name,
        unitName: unit.name, unitType: unit.unitType,
        periodStart: period.startDate, periodEnd: period.endDate, periodType: period.periodType,
        lineItemName: lineItem.name, valueType: lineItem.valueType, value: r.value,
      });
      byBusiness.set(business.id, bucket);
    }

    const issues: Issue[] = [...unmapped].sort().map((ledgerName) => ({
      level: 'warning', sheet: 'tally',
      message: `No mapping for Tally ledger "${ledgerName}" - assign it under this source's ledger mappings; this record was skipped`,
    }));

    if (byBusiness.size === 0) {
      const status: TallySyncStatus = unmapped.size > 0 ? 'error' : 'no_changes';
      const error = unmapped.size > 0 ? 'None of the pushed ledgers are mapped yet' : null;
      return {
        status, error: error ?? undefined, batches: [], unmappedLedgers: [...unmapped],
        source: await recordOutcome(source.id, status, error, issues.length ? issues : null),
      };
    }

    const batches: ImportBatch[] = [];
    let anyChange = false;
    let allAutoCommitted = true;

    for (const { businessName, records: financialRecords, periods } of byBusiness.values()) {
      // 'tally' isn't in ParsedWorkbook['kind'] - that union is upload/sheet
      // parser kinds keyed 1:1 against detect.ts's PARSERS map, and a Tally
      // batch is never produced by detectKind/PARSERS. merge.ts only branches
      // on kind === 'hr', so any other string is fine at runtime.
      const parsed = {
        kind: 'tally',
        businessName,
        periods: [...periods.values()],
        financialRecords,
        salesRecords: [],
        consignmentRecords: [],
        employeeRecords: [],
        targetRecords: [],
        issues,
      } as unknown as ParsedWorkbook;

      const plan = await buildMergePlan(parsed);
      const noChanges = Object.values(plan.stats).every((s) => s.creates + s.updates === 0);
      if (noChanges) continue;
      anyChange = true;

      const [batch] = await db.insert(schema.importBatches).values({
        filename: `${source.label} (${businessName})`,
        kind: 'tally',
        status: 'preview',
        uploadedAt: new Date().toISOString(),
        committedAt: null,
        issues,
        stats: plan.stats,
        details: plan.details,
        payload: parsed,
        sourceType: 'tally',
        tallySourceId: source.id,
      }).returning();

      if (source.syncMode === 'auto' && canAutoCommit(issues)) {
        await commitMergePlan(plan);
        const [committed] = await db.update(schema.importBatches).set({
          status: 'committed', committedAt: new Date().toISOString(),
        }).where(eq(schema.importBatches.id, batch.id)).returning();
        batches.push(committed);
      } else {
        allAutoCommitted = false;
        batches.push(batch);
      }
    }

    const status: TallySyncStatus = !anyChange ? 'no_changes' : allAutoCommitted ? 'auto_committed' : 'preview_created';
    return {
      status, batches, unmappedLedgers: [...unmapped],
      source: await recordOutcome(source.id, status, null, issues.length ? issues : null),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`tally: sync failed for source ${source.id} (${source.label}):`, msg);
    return {
      status: 'error', error: msg, batches: [], unmappedLedgers: [],
      source: await recordOutcome(source.id, 'error', msg, null),
    };
  }
}
