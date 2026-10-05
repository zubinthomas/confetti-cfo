// Per-outlet Cafe weekly data (business "Cafe") - shared by OutletPage and
// its outlet-specific pages (Restaurant/Rannaghor/Cafe). Only fetches the
// selected outlet's business unit plus the "total" rollup unit, not every
// outlet - React Query dedupes identical calls across components (e.g. an
// outlet page and its own <OutletPage> both asking for the same outletKey),
// so this stays a single network request per page visit.
import { useMemo } from 'react';
import { useReferenceData } from './useReferenceData';
import { useFinancialRecords } from './useFinancialRecords';
import { buildFrIndex } from '@/data/seriesKernel';
import {
  buildOutletUnitLookup, outletWeeks, buildLi2Lookup, computeOutletSeries, computeMenuMix,
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
  const units = ref ? buildOutletUnitLookup(ref.businessUnits) : null;
  const { data: records } = useFinancialRecords({
    businessUnitId: units ? [units[outletKey], units.total] : undefined,
  });

  return useMemo(() => {
    if (!ref || !records || !units) return undefined;
    const weeks = outletWeeks(ref.periods);
    const idx = buildFrIndex(records);
    const li2 = buildLi2Lookup(ref.lineItems);
    return {
      weeks,
      outlet: computeOutletSeries(idx, li2, units[outletKey], weeks),
      total: computeOutletSeries(idx, li2, units.total, weeks),
      menuMix: computeMenuMix(idx, li2, units, outletKey, weeks),
    };
  }, [ref, records, units, outletKey]);
}
