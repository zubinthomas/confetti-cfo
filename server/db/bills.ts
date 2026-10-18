// Read layer for outstanding Tally bills (server/import/mergeBills.ts
// writes them). Company-wide, not division-scoped - same reasoning as
// bankBalanceLedger.ts's accounts: a receivable/payable doesn't belong to
// any business unit.
import { and, asc, eq, ilike, or } from 'drizzle-orm';
import { escapeLikeTerm } from '../db.ts';
import { db, ready, schema } from './client.ts';

export async function listOutstandingBills() {
  await ready();
  return db
    .select()
    .from(schema.tallyBills)
    .where(eq(schema.tallyBills.status, 'outstanding'))
    .orderBy(asc(schema.tallyBills.dueDate));
}

/** Spotlight search over outstanding bills, by party ledger name or bill
 *  reference - same "outstanding only" scope as listOutstandingBills. */
export async function searchOutstandingBills(q: string, limit: number) {
  await ready();
  const term = `%${escapeLikeTerm(q)}%`;
  return db
    .select()
    .from(schema.tallyBills)
    .where(and(eq(schema.tallyBills.status, 'outstanding'), or(ilike(schema.tallyBills.ledgerName, term), ilike(schema.tallyBills.billRef, term))))
    .orderBy(asc(schema.tallyBills.dueDate))
    .limit(limit);
}
