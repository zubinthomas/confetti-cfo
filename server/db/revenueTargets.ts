// Filtered queries over the revenue_targets fact table (24 rows/year - Store
// + F&B main-category monthly targets only, see server/routes/revenueTargets.ts
// for the HTTP layer).
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';

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
