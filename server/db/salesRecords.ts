// Filtered queries over the sales_records table (Sienna channel/category
// sales, ~1.8k rows unfiltered).
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';

export interface SalesRecordFilters {
  businessUnitId?: number[];
  periodId?: number[];
  channelId?: number[];
  categoryId?: number[];
  fiscalYear?: string[];
}

export async function listSalesRecords(filters: SalesRecordFilters) {
  await ready();

  let query = db
    .select({
      id: schema.salesRecords.id,
      periodId: schema.salesRecords.periodId,
      categoryId: schema.salesRecords.categoryId,
      channelId: schema.salesRecords.channelId,
      businessUnitId: schema.salesRecords.businessUnitId,
      amount: schema.salesRecords.amount,
    })
    .from(schema.salesRecords)
    .$dynamic();

  if (filters.fiscalYear?.length) {
    query = query.innerJoin(schema.periods, eq(schema.salesRecords.periodId, schema.periods.id));
  }

  const conds = [];
  if (filters.businessUnitId?.length) conds.push(inArray(schema.salesRecords.businessUnitId, filters.businessUnitId));
  if (filters.periodId?.length) conds.push(inArray(schema.salesRecords.periodId, filters.periodId));
  if (filters.channelId?.length) conds.push(inArray(schema.salesRecords.channelId, filters.channelId));
  if (filters.categoryId?.length) conds.push(inArray(schema.salesRecords.categoryId, filters.categoryId));
  if (filters.fiscalYear?.length) conds.push(inArray(schema.periods.fiscalYear, filters.fiscalYear));
  if (conds.length) query = query.where(and(...conds));

  return query.orderBy(asc(schema.salesRecords.id));
}
