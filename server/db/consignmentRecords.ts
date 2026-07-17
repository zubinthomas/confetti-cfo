// Filtered queries over the consignment_records table (~0.8k rows unfiltered).
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';

export interface ConsignmentRecordFilters {
  periodId?: number[];
  vendorId?: number[];
  fiscalYear?: string[];
}

export async function listConsignmentRecords(filters: ConsignmentRecordFilters) {
  await ready();

  let query = db
    .select({
      id: schema.consignmentRecords.id,
      periodId: schema.consignmentRecords.periodId,
      vendorId: schema.consignmentRecords.vendorId,
      amount: schema.consignmentRecords.amount,
      commissionRate: schema.consignmentRecords.commissionRate,
    })
    .from(schema.consignmentRecords)
    .$dynamic();

  if (filters.fiscalYear?.length) {
    query = query.innerJoin(schema.periods, eq(schema.consignmentRecords.periodId, schema.periods.id));
  }

  const conds = [];
  if (filters.periodId?.length) conds.push(inArray(schema.consignmentRecords.periodId, filters.periodId));
  if (filters.vendorId?.length) conds.push(inArray(schema.consignmentRecords.vendorId, filters.vendorId));
  if (filters.fiscalYear?.length) conds.push(inArray(schema.periods.fiscalYear, filters.fiscalYear));
  if (conds.length) query = query.where(and(...conds));

  return query.orderBy(asc(schema.consignmentRecords.id));
}
