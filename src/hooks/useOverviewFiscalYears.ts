// Fiscal years for which CEPL's F&B or Store department has any revenue -
// drives the FY selector chips on pages whose own data may not exist for a
// given year (craft departments, cross-business pages) but which still need
// a year list keyed off where the underlying CEPL P&L workbook actually has
// data. F&B total revenue / Store total sales / the Overview sheet's annual
// sales row are resolved by name (see src/data/fabData.ts and
// src/data/overviewData.ts) rather than hardcoded ids.
import { useMemo } from 'react';
import { useReferenceData } from './useReferenceData';
import { useFinancialRecords } from './useFinancialRecords';
import { resolveFnbBu, resolveFabLi } from '@/data/fabData';
import { resolveStoreBu, resolveStoreLi } from '@/data/storeFinancials';
import { resolveOverviewOvLi } from '@/data/overviewData';

export function useOverviewFiscalYears(): string[] | undefined {
  const { data: ref } = useReferenceData();
  const fnbBu = ref ? resolveFnbBu(ref.businessUnits) : null;
  const storeBu = ref ? resolveStoreBu(ref.businessUnits) : null;
  const { data: records } = useFinancialRecords({
    businessUnitId: fnbBu != null && storeBu != null ? [fnbBu, storeBu] : undefined,
  });

  return useMemo(() => {
    if (!ref || !records || fnbBu == null || storeBu == null) return undefined;

    const fnbLi = resolveFabLi(ref.lineItems);
    const storeLi = resolveStoreLi(ref.lineItems);
    const ovLi = resolveOverviewOvLi(ref.lineItems);

    const periodById = new Map(ref.periods.map((p) => [p.id, p]));
    const candidateFys = [...new Set(
      ref.periods.filter((p) => p.periodType === 'month').map((p) => p.fiscalYear)
    )].sort();

    const totals = new Map<string, number>(); // `${fy}|${businessUnitId}|${lineItemId}` -> sum
    const monthlyDetailFys = new Set<string>(); // fys with any F&B totalRevenue record

    for (const r of records) {
      const period = periodById.get(r.periodId);
      if (!period || period.periodType !== 'month') continue;
      const key = `${period.fiscalYear}|${r.businessUnitId}|${r.lineItemId}`;
      totals.set(key, (totals.get(key) ?? 0) + r.value);
      if (r.businessUnitId === fnbBu && r.lineItemId === fnbLi.totalRevenue) {
        monthlyDetailFys.add(period.fiscalYear);
      }
    }

    return candidateFys.filter((fy) => {
      const hasMonthlyDetail = monthlyDetailFys.has(fy);
      const fbSales = totals.get(`${fy}|${fnbBu}|${hasMonthlyDetail ? fnbLi.totalRevenue : ovLi.sales}`) ?? 0;
      const storeSales = totals.get(`${fy}|${storeBu}|${hasMonthlyDetail ? storeLi.storeTotalSales : ovLi.sales}`) ?? 0;
      return fbSales !== 0 || storeSales !== 0;
    });
  }, [ref, records, fnbBu, storeBu]);
}
