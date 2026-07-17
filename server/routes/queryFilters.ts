// Shared comma-separated query-param parsing for the filtered fact-table
// routes (financialRecords/salesRecords/consignmentRecords).
export const csvInts = (v: unknown): number[] | undefined =>
  typeof v === 'string' && v ? v.split(',').map(Number) : undefined;

export const csvStrs = (v: unknown): string[] | undefined =>
  typeof v === 'string' && v ? v.split(',') : undefined;
