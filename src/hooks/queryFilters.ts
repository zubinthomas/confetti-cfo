// Shared helpers for the fact-table hooks (useFinancialRecords/
// useSalesRecords/useConsignmentRecords): array filter values are sorted
// before use so equivalent filters (e.g. businessUnitId [1,2] vs [2,1])
// produce the same React Query cache key and query string.
type FilterValues = Record<string, (string | number)[] | undefined>;

export function sortedFilters<T extends FilterValues>(filters: T): T {
  const out = { ...filters };
  for (const key of Object.keys(filters) as (keyof T)[]) {
    const v = out[key];
    if (Array.isArray(v)) out[key] = [...v].sort() as T[keyof T];
  }
  return out;
}

export function toQueryString(filters: FilterValues): string {
  const parts: string[] = [];
  for (const [key, values] of Object.entries(filters)) {
    if (values?.length) parts.push(`${key}=${values.join(',')}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

export function hasAnyFilter(filters: FilterValues): boolean {
  return Object.values(filters).some((v) => v?.length);
}
