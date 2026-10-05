// All four Cafe outlet units (Bosar Ghor / Dinning Room / Rannaghor + Total)
// plus their derived liquor mix / events breakdown / Durga Puja summary -
// used by pages that compare across outlets (Bar, Events), unlike
// useOutletData which only fetches one outlet + the total.
import { useMemo } from 'react';
import { useReferenceData } from './useReferenceData';
import { useFinancialRecords } from './useFinancialRecords';
import { buildFrIndex } from '@/data/seriesKernel';
import {
  buildOutletUnitLookup, outletWeeks, buildLi2Lookup, computeAllOutlets,
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

export function useAllOutlets(): AllOutletsData | undefined {
  const { data: ref } = useReferenceData();
  const units = ref ? buildOutletUnitLookup(ref.businessUnits) : null;
  const allOutletBus = units ? [units.bosarGhor, units.dinningRoom, units.rannaghor, units.total] : undefined;
  const { data: records } = useFinancialRecords({ businessUnitId: allOutletBus });

  return useMemo(() => {
    if (!ref || !records || !units) return undefined;
    const weeks = outletWeeks(ref.periods);
    const idx = buildFrIndex(records);
    const li2 = buildLi2Lookup(ref.lineItems);
    return {
      weeks,
      outlets: computeAllOutlets(idx, li2, units, weeks),
      liquorMix: computeLiquorMix(idx, li2, units, weeks),
      eventsBreakdown: computeEventsBreakdown(idx, li2, units, weeks),
      durgaPuja: computeDurgaPuja(idx, li2, units, ref.periods),
    };
  }, [ref, records, units]);
}
