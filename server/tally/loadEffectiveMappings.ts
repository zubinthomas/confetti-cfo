// Database side of effectiveMappings.ts: loads one source's ledger and group
// rows and resolves every ledger in one pass.
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/client.ts';
import { resolveEffectiveMapping, type EffectiveMapping } from './effectiveMappings.ts';

/** Effective mapping for every ledger row of one source, keyed by ledger name. */
export async function loadEffectiveMappings(tallySourceId: number): Promise<Map<string, EffectiveMapping>> {
  const [ledgers, groups] = await Promise.all([
    db.select().from(schema.tallyLedgerMappings)
      .where(eq(schema.tallyLedgerMappings.tallySourceId, tallySourceId)),
    db.select().from(schema.tallyGroupMappings)
      .where(eq(schema.tallyGroupMappings.tallySourceId, tallySourceId)),
  ]);
  const groupByName = new Map(groups.map((g) => [g.groupName, g]));
  const result = new Map<string, EffectiveMapping>();
  for (const ledger of ledgers) {
    const group = ledger.groupName != null ? groupByName.get(ledger.groupName) : undefined;
    result.set(ledger.ledgerName, resolveEffectiveMapping(ledger, group));
  }
  return result;
}
