// Marking a period reconciled (closed) or un-reconciled (reopened) -
// everything else about periods (list, create, lookup) already ships
// through server/db/reference.ts's select-all, so this is just the one
// mutation. See schema.ts's periods.reconciledAt comment for why this is
// period-level, not per-financial-record.
import { eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';

export class PeriodError extends Error {}

export async function setPeriodReconciled(userId: number, periodId: number, reconciled: boolean) {
  await ready();
  const [period] = await db.select().from(schema.periods).where(eq(schema.periods.id, periodId));
  if (!period) throw new PeriodError(`No period with id ${periodId}`);

  const [updated] = await db.update(schema.periods).set({
    reconciledAt: reconciled ? new Date().toISOString() : null,
    reconciledByUserId: reconciled ? userId : null,
  }).where(eq(schema.periods.id, periodId)).returning();
  return updated;
}
