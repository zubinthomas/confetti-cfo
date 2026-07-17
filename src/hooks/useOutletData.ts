// Per-outlet Cafe weekly data (business 2, business units 8-11) - shared by
// OutletPage and its outlet-specific pages (Restaurant/Rannaghor/Cafe). Only
// fetches the selected outlet's business unit plus the "total" rollup unit,
// not every outlet - React Query dedupes identical calls across components
// (e.g. an outlet page and its own <OutletPage> both asking for the same
// outletKey), so this stays a single network request per page visit.
import { useMemo } from 'react';
import { useReferenceData } from './useReferenceData';
import { useFinancialRecords } from './useFinancialRecords';
import { buildFrIndex } from '@/data/seriesKernel';
import {
  OUTLET_UNITS, outletWeeks, buildLi2Lookup, computeOutletSeries, computeMenuMix,
  type OutletKey, type OutletStreams, type OutletWeek,
} from '@/data/outletData';

export interface OutletData {
  weeks: OutletWeek[];
  outlet: OutletStreams;
  total: OutletStreams;
  menuMix: ReturnType<typeof computeMenuMix>;
}

export function useOutletData(outletKey: OutletKey): OutletData | undefined {
  const { data: ref } = useReferenceData();
  const { data: records } = useFinancialRecords({
    businessUnitId: [OUTLET_UNITS[outletKey], OUTLET_UNITS.total],
  });

  return useMemo(() => {
    if (!ref || !records) return undefined;
    const weeks = outletWeeks(ref.periods);
    const idx = buildFrIndex(records);
    const li2 = buildLi2Lookup(ref.lineItems);
    return {
      weeks,
      outlet: computeOutletSeries(idx, li2, OUTLET_UNITS[outletKey], weeks),
      total: computeOutletSeries(idx, li2, OUTLET_UNITS.total, weeks),
      menuMix: computeMenuMix(idx, li2, outletKey, weeks),
    };
  }, [ref, records, outletKey]);
}
