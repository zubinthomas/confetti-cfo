// All four Cafe outlet units (Bosar Ghor / Dinning Room / Rannaghor + Total)
// plus their derived liquor mix / events breakdown / Durga Puja summary -
// used by pages that compare across outlets (Bar, Events), unlike
// useOutletData which only fetches one outlet + the total.
import { useMemo } from 'react';
import { useReferenceData } from './useReferenceData';
import { useFinancialRecords } from './useFinancialRecords';
import { buildFrIndex } from '@/data/seriesKernel';
import {
  OUTLET_UNITS, outletWeeks, buildLi2Lookup, computeAllOutlets,
  computeLiquorMix, computeEventsBreakdown, computeDurgaPuja,
  type OutletKey, type OutletStreams, type OutletWeek,
} from '@/data/outletData';

export interface AllOutletsData {
  weeks: OutletWeek[];
  outlets: Record<OutletKey, OutletStreams>;
  liquorMix: ReturnType<typeof computeLiquorMix>;
  eventsBreakdown: ReturnType<typeof computeEventsBreakdown>;
  durgaPuja: ReturnType<typeof computeDurgaPuja>;
}

const ALL_OUTLET_BUS = [OUTLET_UNITS.bosarGhor, OUTLET_UNITS.dinningRoom, OUTLET_UNITS.rannaghor, OUTLET_UNITS.total];

export function useAllOutlets(): AllOutletsData | undefined {
  const { data: ref } = useReferenceData();
  const { data: records } = useFinancialRecords({ businessUnitId: ALL_OUTLET_BUS });

  return useMemo(() => {
    if (!ref || !records) return undefined;
    const weeks = outletWeeks(ref.periods);
    const idx = buildFrIndex(records);
    const li2 = buildLi2Lookup(ref.lineItems);
    return {
      weeks,
      outlets: computeAllOutlets(idx, li2, weeks),
      liquorMix: computeLiquorMix(idx, li2, weeks),
      eventsBreakdown: computeEventsBreakdown(idx, li2, weeks),
      durgaPuja: computeDurgaPuja(idx, li2, ref.periods),
    };
  }, [ref, records]);
}
