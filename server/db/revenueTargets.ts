// Filtered queries over the revenue_targets fact table (24 rows/year - Store
// + F&B main-category monthly targets only, see server/routes/revenueTargets.ts
// for the HTTP layer), plus the revenue_target_revisions version history and
// the one manual write path onto it.
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';

export class RevenueTargetError extends Error {}

export interface RevenueTargetFilters {
  periodId?: number[];
  category?: ('store' | 'fnb')[];
  fiscalYear?: string[];
}

export async function listRevenueTargets(filters: RevenueTargetFilters) {
  await ready();

  let query = db
    .select({
      id: schema.revenueTargets.id,
      periodId: schema.revenueTargets.periodId,
      category: schema.revenueTargets.category,
      targetAmount: schema.revenueTargets.targetAmount,
    })
    .from(schema.revenueTargets)
    .$dynamic();

  if (filters.fiscalYear?.length) {
    query = query.innerJoin(schema.periods, eq(schema.revenueTargets.periodId, schema.periods.id));
  }

  const conds = [];
  if (filters.periodId?.length) conds.push(inArray(schema.revenueTargets.periodId, filters.periodId));
  if (filters.category?.length) conds.push(inArray(schema.revenueTargets.category, filters.category));
  if (filters.fiscalYear?.length) conds.push(inArray(schema.periods.fiscalYear, filters.fiscalYear));
  if (conds.length) query = query.where(and(...conds));

  return query.orderBy(asc(schema.revenueTargets.id));
}

/** Version history for one (period, category) target, newest first - every
 *  row either an automatic import-driven change (createdByUserId null, see
 *  server/import/merge.ts) or a manual revision (see reviseTarget below). */
export async function listRevisions(periodId: number, category: 'store' | 'fnb') {
  await ready();
  return db
    .select({
      id: schema.revenueTargetRevisions.id,
      periodId: schema.revenueTargetRevisions.periodId,
      category: schema.revenueTargetRevisions.category,
      targetAmount: schema.revenueTargetRevisions.targetAmount,
      note: schema.revenueTargetRevisions.note,
      createdDate: schema.revenueTargetRevisions.createdDate,
      createdByName: schema.users.fullName,
      createdByEmail: schema.users.email,
    })
    .from(schema.revenueTargetRevisions)
    .leftJoin(schema.users, eq(schema.users.id, schema.revenueTargetRevisions.createdByUserId))
    .where(and(
      eq(schema.revenueTargetRevisions.periodId, periodId),
      eq(schema.revenueTargetRevisions.category, category),
    ))
    .orderBy(desc(schema.revenueTargetRevisions.createdDate));
}

/** The one deliberate exception to "writes only via Import" (see
 *  server/routes/revenueTargets.ts) - upserts the current revenue_targets
 *  row and appends a revision in the same transaction, gated by
 *  RevenueTarget:write rather than the import-only FinancialRecord family. */
export async function reviseTarget(
  userId: number,
  periodId: number,
  category: 'store' | 'fnb',
  input: { targetAmount: number; note?: string | null },
) {
  await ready();
  const { targetAmount, note } = input;
  if (!Number.isFinite(targetAmount)) throw new RevenueTargetError('targetAmount must be a number');

  const [period] = await db.select().from(schema.periods).where(eq(schema.periods.id, periodId));
  if (!period) throw new RevenueTargetError(`No period with id ${periodId}`);

  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(schema.revenueTargets)
      .where(and(eq(schema.revenueTargets.periodId, periodId), eq(schema.revenueTargets.category, category)));

    if (existing) {
      await tx.update(schema.revenueTargets).set({ targetAmount }).where(eq(schema.revenueTargets.id, existing.id));
    } else {
      const allTargets = await tx.select({ id: schema.revenueTargets.id }).from(schema.revenueTargets);
      const newId = allTargets.reduce((m, r) => Math.max(m, r.id), 0) + 1;
      await tx.insert(schema.revenueTargets).values({ id: newId, periodId, category, targetAmount });
    }

    const [revision] = await tx.insert(schema.revenueTargetRevisions).values({
      id: randomUUID(),
      periodId,
      category,
      targetAmount,
      note: note || null,
      createdDate: new Date().toISOString(),
      createdByUserId: userId,
    }).returning();
    return revision;
  });
}
