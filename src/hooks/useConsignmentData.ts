// Consignment / partner-brand sales, all four selectable fiscal years
// fetched together so the page's FY selector switches instantly with no
// per-click refetch.
import { useMemo } from 'react';
import { useReferenceData } from './useReferenceData';
import { useConsignmentRecords } from './useConsignmentRecords';
import { monthPeriodIds } from '@/data/seriesKernel';
import { computeConsignmentYear, type ConsignmentYearData } from '@/data/consignmentData';

const CONSIGNMENT_FYS = ['2023-2024', '2024-2025', '2025-2026', '2026-2027'];

export function useConsignmentData(): ConsignmentYearData[] | undefined {
  const { data: ref } = useReferenceData();
  const { data: records } = useConsignmentRecords({ fiscalYear: CONSIGNMENT_FYS });

  return useMemo(() => {
    if (!ref || !records) return undefined;
    return CONSIGNMENT_FYS.map((fy) =>
      computeConsignmentYear(records, ref.vendors, fy, monthPeriodIds(ref.periods, fy))
    );
  }, [ref, records]);
}
