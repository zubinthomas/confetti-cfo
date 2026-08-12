// Pure projection math for the FY26-27 Target vs Projection comparison.
//
// Two distinct estimation methods, chosen per month by data availability:
//  - A month with actual data (in progress or fully closed) projects via the
//    day-elapsed run-rate reverse-engineered from the source sheet's own
//    "Current Run-rate / Projection" column (verified against May: actual-
//    to-date / days-elapsed * days-in-month reproduced the sheet's stated
//    figure exactly) - or, once the month has fully closed, its own actual
//    (nothing left to extrapolate).
//  - A month with NO actual data at all (a future month, or a past/current
//    month whose data just hasn't been imported yet) has nothing of its own
//    to extrapolate from, so it's estimated from the prior year's actual for
//    that same month, scaled by a growth rate. That rate is normally the YTD
//    growth observed across whichever months this FY *does* have actual data
//    for - the same mechanism the source sheet itself used to build FY26-27
//    targets from FY25-26 actuals, just driven by this year's real
//    performance instead of a fixed assumption. If there's no actual data for
//    the FY at all (nothing to compare growth against), it falls back to the
//    growth rate implied by Target vs prior-year-actual instead - i.e. it
//    reshapes the target's own YoY assumption across the prior year's
//    seasonality rather than leaving every month blank. Callers must surface
//    this fallback in the UI (see growthRateSource) since a target-implied
//    projection isn't grounded in any real FY26-27 performance yet.
import type { Period, RevenueTarget } from "./types";

/** Whole calendar days in [start, end) - end is exclusive (the next period's start). */
function daysBetween(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86400000);
}

/** Day-elapsed run-rate for a month currently in progress. */
function runRate(actualToDate: number, periodStart: string, periodEnd: string, todayStr: string): number {
  const daysElapsed = daysBetween(periodStart, todayStr);
  const daysInMonth = daysBetween(periodStart, periodEnd);
  if (daysElapsed <= 0) return actualToDate; // today == periodStart, first day
  return (actualToDate / daysElapsed) * daysInMonth;
}

/**
 * YTD growth rate: sum of actual across every month that has data, divided by
 * the prior-year actual for those SAME months, minus 1. Null if no month has
 * both a current-year actual and a comparable prior-year actual to compare.
 */
export function computeGrowthRate(actual: (number | null)[], priorYearActual: (number | null)[]): number | null {
  let sumActual = 0, sumPrior = 0, any = false;
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] != null && priorYearActual[i] != null) {
      sumActual += actual[i] as number;
      sumPrior += priorYearActual[i] as number;
      any = true;
    }
  }
  if (!any || sumPrior === 0) return null;
  return sumActual / sumPrior - 1;
}

/**
 * Growth rate implied by Target vs prior-year-actual, for months where both
 * exist. Used only as a fallback when computeGrowthRate has no actual data to
 * work with at all (see projectionSeries).
 */
export function computeGrowthRateFromTargets(target: (number | null)[], priorYearActual: (number | null)[]): number | null {
  let sumTarget = 0, sumPrior = 0, any = false;
  for (let i = 0; i < target.length; i++) {
    if (target[i] != null && priorYearActual[i] != null) {
      sumTarget += target[i] as number;
      sumPrior += priorYearActual[i] as number;
      any = true;
    }
  }
  if (!any || sumPrior === 0) return null;
  return sumTarget / sumPrior - 1;
}

export function computeGap(projection: number | null, target: number | null): number | null {
  if (projection == null || target == null) return null;
  return projection - target;
}

/** Monthly Target series (nulls where a target row doesn't exist for that period). */
export function targetSeries(
  targets: RevenueTarget[], category: "store" | "fnb", periodIds: number[]
): (number | null)[] {
  const byPeriod = new Map(targets.filter((t) => t.category === category).map((t) => [t.periodId, t.targetAmount]));
  return periodIds.map((pid) => byPeriod.get(pid) ?? null);
}

/** Which comparison the no-data-month growth rate was derived from. */
export type GrowthRateSource = "actual" | "target" | "none";

export interface ProjectionResult {
  series: (number | null)[];
  growthRate: number | null;
  /**
   * "actual": rate came from real FY performance vs prior year (normal case).
   * "target": no actual data existed for the FY at all, so the rate was
   *   derived from Target vs prior-year-actual instead - callers should flag
   *   this in the UI, since these projections aren't grounded in any real
   *   performance yet.
   * "none": neither was computable (e.g. no prior-year data either).
   */
  growthRateSource: GrowthRateSource;
}

/**
 * Monthly Projection series. Months with actual data use the run-rate/actual
 * method; months with none are estimated from the prior year via a growth
 * rate - normally the one observed across the months that do have actual
 * data (see computeGrowthRate), or, if there's no actual data for the FY at
 * all, the one implied by Target vs prior-year-actual instead (see
 * computeGrowthRateFromTargets).
 */
export function projectionSeries(
  actual: (number | null)[],
  priorYearActual: (number | null)[],
  target: (number | null)[],
  periods: Period[],
  periodIds: number[],
  today: Date = new Date()
): ProjectionResult {
  const periodById = new Map(periods.map((p) => [p.id, p]));
  const todayStr = today.toISOString().slice(0, 10);

  let growthRate = computeGrowthRate(actual, priorYearActual);
  let growthRateSource: GrowthRateSource = growthRate != null ? "actual" : "none";
  if (growthRate == null) {
    growthRate = computeGrowthRateFromTargets(target, priorYearActual);
    growthRateSource = growthRate != null ? "target" : "none";
  }

  const series = periodIds.map((pid, i) => {
    const p = periodById.get(pid);
    if (!p) return null;

    if (actual[i] != null) {
      if (todayStr >= p.endDate) return actual[i]; // fully elapsed - nothing to extrapolate
      if (todayStr >= p.startDate) return runRate(actual[i] as number, p.startDate, p.endDate, todayStr); // in progress
      return actual[i]; // data exists for a month that hasn't "started" by today's clock - trust it
    }

    // No actual for this month at all - estimate from the prior year's same
    // month, scaled by how this year is trending so far (or by the
    // target-implied rate, if that's all we have - see growthRateSource).
    if (growthRate != null && priorYearActual[i] != null) {
      return (priorYearActual[i] as number) * (1 + growthRate);
    }
    return null; // can't estimate - no prior-year figure and no growth rate to apply
  });

  return { series, growthRate, growthRateSource };
}
