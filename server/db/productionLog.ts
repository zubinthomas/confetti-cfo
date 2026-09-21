// Read-only query helpers over `production_log`, feeding the Production and
// Kiln & Energy ops pages (src/components/dashboard/ops/). Data only ever
// arrives via the import pipeline (server/import/mergeProductionLog.ts) -
// there is no write surface here. Aggregation is done in plain JS over the
// full table rather than a Drizzle groupBy, matching this codebase's
// existing convention (see server/import/merge.ts) and fine at this table's
// size (low thousands of rows).
import { db, ready, schema } from './client.ts';

export interface DailyStageOutput { date: string; stage: string; qty: number }
export interface DailyKilnLoad { date: string; kiln: string }
export interface DailyFiringType { date: string; firingType: string }
export interface DailyProductOutput { date: string; stage: string; productName: string; qty: number }
export interface ProductionKpis {
  totalPieces: number;
  daysCovered: number;
  avgPerDay: number;
  busiestStage: string | null;
}

/** Per (date, stage) total output. Throwing sums throwingQty + turningQty
 *  (both represent pieces produced that stage); every other stage uses qty. */
export async function dailyProductionByStage(): Promise<DailyStageOutput[]> {
  await ready();
  const rows = await db.select().from(schema.productionLog);
  const totals = new Map<string, number>();
  for (const r of rows) {
    if (!r.date) continue;
    const qty = r.stage === 'throwing' ? (r.throwingQty ?? 0) + (r.turningQty ?? 0) : (r.qty ?? 0);
    const key = `${r.date} ${r.stage}`;
    totals.set(key, (totals.get(key) ?? 0) + qty);
  }
  return [...totals.entries()]
    .map(([key, qty]) => {
      const [date, stage] = key.split(' ');
      return { date, stage, qty };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function productionKpis(): Promise<ProductionKpis> {
  const daily = await dailyProductionByStage();
  const totalPieces = daily.reduce((sum, d) => sum + d.qty, 0);
  const days = new Set(daily.map((d) => d.date));
  const byStage = new Map<string, number>();
  for (const d of daily) byStage.set(d.stage, (byStage.get(d.stage) ?? 0) + d.qty);
  let busiestStage: string | null = null;
  let max = -1;
  for (const [stage, qty] of byStage) {
    if (qty > max) { max = qty; busiestStage = stage; }
  }
  return {
    totalPieces,
    daysCovered: days.size,
    avgPerDay: days.size ? Math.round(totalPieces / days.size) : 0,
    busiestStage,
  };
}

/** One row per distinct (date, kiln) pair actually fired - i.e. one row per
 *  approximated "load" (the source doesn't encode discrete load boundaries
 *  beyond that, so a kiln fired twice in one day still counts as one load
 *  that day - see the Kiln & Energy ops section's UI copy). Date-tagged, not
 *  pre-aggregated, so the frontend can scope to a fiscal year the same way
 *  it does with dailyProductionByStage(). */
export async function dailyKilnLoads(): Promise<DailyKilnLoad[]> {
  await ready();
  const rows = await db.select().from(schema.productionLog);
  const seenPairs = new Set<string>();
  const result: DailyKilnLoad[] = [];
  for (const r of rows) {
    if (r.stage !== 'firing' || !r.kiln || !r.date) continue;
    const pairKey = `${r.date} ${r.kiln}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);
    result.push({ date: r.date, kiln: r.kiln });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

/** One row per firing record with a recognized firing type, date-tagged so
 *  the frontend can scope to a fiscal year. */
export async function dailyFiringTypes(): Promise<DailyFiringType[]> {
  await ready();
  const rows = await db.select().from(schema.productionLog);
  const result: DailyFiringType[] = [];
  for (const r of rows) {
    if (r.stage !== 'firing' || !r.firingType || !r.date) continue;
    result.push({ date: r.date, firingType: r.firingType });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

/** One row per production_log record with a product name, date-tagged so
 *  the frontend can scope to a fiscal year and group by item. Uses the same
 *  per-row qty rule as dailyProductionByStage (throwing sums throwingQty +
 *  turningQty, every other stage uses qty) - a piece that passes through
 *  multiple logged stages contributes at each one, same as the Production
 *  page's "Total Pieces" KPI. Product names are free text; normalizing
 *  near-duplicates (case/whitespace) for grouping is left to the frontend. */
export async function dailyProductionByItem(): Promise<DailyProductOutput[]> {
  await ready();
  const rows = await db.select().from(schema.productionLog);
  const result: DailyProductOutput[] = [];
  for (const r of rows) {
    if (!r.date || !r.productName) continue;
    const qty = r.stage === 'throwing' ? (r.throwingQty ?? 0) + (r.turningQty ?? 0) : (r.qty ?? 0);
    result.push({ date: r.date, stage: r.stage, productName: r.productName, qty });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}
