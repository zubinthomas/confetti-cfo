// Fiscal years for which CEPL's F&B or Store department has any revenue -
// drives the FY selector chips on pages whose own data may not exist for a
// given year (craft departments, cross-business pages) but which still need
// a year list keyed off where the underlying CEPL P&L workbook actually has
// data. Line item ids 4/36/191 are F&B total revenue, Store total sales, and
// the Overview sheet's annual sales row respectively (see src/data/fabData.ts
// and src/data/overviewData.ts).
import { useMemo } from 'react';
import { useReferenceData } from './useReferenceData';
import { useFinancialRecords } from './useFinancialRecords';

const FNB_BU = 1;
const STORE_BU = 2;
const LI = { totalRevenue: 4, storeTotalSales: 36, overviewSales: 191 };

export function useOverviewFiscalYears(): string[] | undefined {
  const { data: ref } = useReferenceData();
  const { data: records } = useFinancialRecords({
    businessUnitId: [FNB_BU, STORE_BU],
    lineItemId: [LI.totalRevenue, LI.storeTotalSales, LI.overviewSales],
  });

  return useMemo(() => {
    if (!ref || !records) return undefined;

    const periodById = new Map(ref.periods.map((p) => [p.id, p]));
    const candidateFys = [...new Set(
      ref.periods.filter((p) => p.periodType === 'month').map((p) => p.fiscalYear)
    )].sort();

    const totals = new Map<string, number>(); // `${fy}|${businessUnitId}|${lineItemId}` -> sum
    const monthlyDetailFys = new Set<string>(); // fys with any F&B (BU1) totalRevenue record

    for (const r of records) {
      const period = periodById.get(r.periodId);
      if (!period || period.periodType !== 'month') continue;
      const key = `${period.fiscalYear}|${r.businessUnitId}|${r.lineItemId}`;
      totals.set(key, (totals.get(key) ?? 0) + r.value);
      if (r.businessUnitId === FNB_BU && r.lineItemId === LI.totalRevenue) {
        monthlyDetailFys.add(period.fiscalYear);
      }
    }

    return candidateFys.filter((fy) => {
      const hasMonthlyDetail = monthlyDetailFys.has(fy);
      const fbSales = totals.get(`${fy}|${FNB_BU}|${hasMonthlyDetail ? LI.totalRevenue : LI.overviewSales}`) ?? 0;
      const storeSales = totals.get(`${fy}|${STORE_BU}|${hasMonthlyDetail ? LI.storeTotalSales : LI.overviewSales}`) ?? 0;
      return fbSales !== 0 || storeSales !== 0;
    });
  }, [ref, records]);
}
