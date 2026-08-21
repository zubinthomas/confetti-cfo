// CEPL F&B venue-level weekly data (business 1, opt-in drill-down on top of
// the existing monthly F&B aggregate) - powers the "By Venue"/"By Item"
// views on /fnb. See src/data/fnbVenueData.ts for the computations.
import { useMemo } from "react";
import { useReferenceData } from "./useReferenceData";
import { useFinancialRecords } from "./useFinancialRecords";
import { buildFrIndex } from "@/data/seriesKernel";
import {
  buildVenueUnitLookup, buildFnbLiLookup, fnbWeeks, computeAllVenues,
  computeMenuMix, computeLiquorMix, computeCostMix, computeDeliveryPlatformMix, computeDrillDown,
  type VenueName, type FnbStreams, type FnbWeek,
} from "@/data/fnbVenueData";

export interface FnbVenueData {
  weeks: FnbWeek[];
  venues: Partial<Record<VenueName, FnbStreams>>;
  menuMix: ReturnType<typeof computeMenuMix>;
  liquorMix: ReturnType<typeof computeLiquorMix>;
  costMix: ReturnType<typeof computeCostMix>;
  deliveryPlatformMix: ReturnType<typeof computeDeliveryPlatformMix>;
  /** Sub-line breakdown one level below a category's headline number (see DRILL_DOWN_CATEGORIES). */
  drillDown: (category: string) => ReturnType<typeof computeDrillDown>;
}

/** undefined while loading; null once loaded if no weekly F&B detail exists yet. */
export function useFnbVenueData(): FnbVenueData | undefined | null {
  const { data: ref } = useReferenceData();
  const venueUnitIds = useMemo(
    () => (ref ? Object.values(buildVenueUnitLookup(ref.businessUnits)).filter((v): v is number => v != null) : []),
    [ref]
  );
  // businessUnitId alone is enough to scope this to just the venue units
  // (they're written to at periodType 'week' only) - it also naturally
  // disables the query (useFinancialRecords requires >=1 filter value) until
  // reference data has resolved which units those are.
  const { data: records } = useFinancialRecords({ businessUnitId: venueUnitIds });

  return useMemo(() => {
    if (!ref) return undefined;
    if (!venueUnitIds.length) return null;
    if (!records) return undefined;

    const weeks = fnbWeeks(ref.periods);
    if (!weeks.length) return null;

    const idx = buildFrIndex(records);
    const li = buildFnbLiLookup(ref.lineItems);
    const venueUnits = buildVenueUnitLookup(ref.businessUnits);

    return {
      weeks,
      venues: computeAllVenues(idx, li, venueUnits, weeks),
      menuMix: computeMenuMix(idx, li, venueUnits, weeks),
      liquorMix: computeLiquorMix(idx, li, venueUnits, weeks),
      costMix: computeCostMix(idx, li, venueUnits, weeks),
      deliveryPlatformMix: computeDeliveryPlatformMix(idx, li, venueUnits, weeks),
      drillDown: (category: string) => computeDrillDown(idx, li, venueUnits, weeks, category),
    };
  }, [ref, records, venueUnitIds]);
}
