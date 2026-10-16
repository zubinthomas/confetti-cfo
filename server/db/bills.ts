// Read layer for outstanding Tally bills (server/import/mergeBills.ts
// writes them). Company-wide, not division-scoped - same reasoning as
// bankBalanceLedger.ts's accounts: a receivable/payable doesn't belong to
// any business unit.
import { asc, eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';

export async function listOutstandingBills() {
  await ready();
  return db
    .select()
    .from(schema.tallyBills)
    .where(eq(schema.tallyBills.status, 'outstanding'))
    .orderBy(asc(schema.tallyBills.dueDate));
}
