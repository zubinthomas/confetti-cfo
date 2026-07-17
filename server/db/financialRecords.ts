// Filtered queries over the financial_records fact table (~15k rows
// unfiltered - see server/routes/financialRecords.ts for the HTTP layer).
// Callers filter by whatever combination of business unit / period / fiscal
// year / period type / line item they need instead of always loading
// everything (compare to loadDataset() in dataset.ts, which still exists for
// the CLI verify scripts).
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';

export interface FinancialRecordFilters {
  businessUnitId?: number[];
  periodId?: number[];
  lineItemId?: number[];
  fiscalYear?: string[];
  periodType?: ('month' | 'week' | 'custom')[];
}

export async function listFinancialRecords(filters: FinancialRecordFilters) {
  await ready();

  let query = db
    .select({
      id: schema.financialRecords.id,
      businessUnitId: schema.financialRecords.businessUnitId,
      periodId: schema.financialRecords.periodId,
      lineItemId: schema.financialRecords.lineItemId,
      value: schema.financialRecords.value,
      notes: schema.financialRecords.notes,
    })
    .from(schema.financialRecords)
    .$dynamic();

  const needsPeriodJoin = !!(filters.fiscalYear?.length || filters.periodType?.length);
  if (needsPeriodJoin) {
    query = query.innerJoin(schema.periods, eq(schema.financialRecords.periodId, schema.periods.id));
  }

  const conds = [];
  if (filters.businessUnitId?.length) conds.push(inArray(schema.financialRecords.businessUnitId, filters.businessUnitId));
  if (filters.periodId?.length) conds.push(inArray(schema.financialRecords.periodId, filters.periodId));
  if (filters.lineItemId?.length) conds.push(inArray(schema.financialRecords.lineItemId, filters.lineItemId));
  if (filters.fiscalYear?.length) conds.push(inArray(schema.periods.fiscalYear, filters.fiscalYear));
  if (filters.periodType?.length) conds.push(inArray(schema.periods.periodType, filters.periodType));
  if (conds.length) query = query.where(and(...conds));

  return query.orderBy(asc(schema.financialRecords.id));
}
