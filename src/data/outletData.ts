// Pure, parametrized Cafe weekly-workbook computations (business 2):
// outlet-level weekly P&L from Sept 2025 (Bosar Ghor / Dinning Room /
// Rannaghor + Total), revenue streams, menu & liquor mix, events breakdown,
// the Durga Puja special-event summary, and the whole-cafe Apr-Aug 2025
// weekly P&L from before the outlet split.
//
// Takes an FrIndex + a li2() name->lineItemId lookup built from a
// hook-fetched, per-route filtered slice (see src/hooks/useOutletData.ts et
// al.) instead of reading a whole-dataset singleton.
import { frGet, series, sum, type FrIndex, type Series } from "./seriesKernel";
import type { LineItem, Period } from "./types";

export const OUTLET_UNITS = { bosarGhor: 8, dinningRoom: 9, rannaghor: 10, total: 11 } as const;
export type OutletKey = keyof typeof OUTLET_UNITS;
export const OUTLET_LABELS: Record<OutletKey, string> = {
  bosarGhor: "Bosar Ghor (Cafe)",
  dinningRoom: "Dinning Room (Restaurant)",
  rannaghor: "Rannaghor",
  total: "All outlets",
};

export interface OutletWeek { id: number; label: string; short: string; month: string }

function weeksFrom(periods: Period[], predicate: (p: Period) => boolean): OutletWeek[] {
  return periods
    .filter((p) => p.periodType === "week" && !p.isSpecialEvent && predicate(p))
    .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))
    .map((p) => ({
      id: p.id,
      label: p.label,
      short: p.startDate.slice(8, 10) + "/" + p.startDate.slice(5, 7),
      month: new Date(p.startDate + "T00:00:00").toLocaleString("en", { month: "short" }),
    }));
}

// ordered outlet weeks (Sept 2025 →), special-event summaries excluded
export const outletWeeks = (periods: Period[]): OutletWeek[] =>
  weeksFrom(periods, (p) => p.startDate >= "2025-09-01");

// Business-2 (Cafe business) line item name -> amount lineItemId lookup.
export function buildLi2Lookup(lineItems: LineItem[]): (name: string) => number | null {
  const byName: Record<string, Partial<Record<"amount" | "percentage", number>>> = {};
  for (const l of lineItems) {
    if (l.businessId === 2) (byName[l.name] ??= {})[l.valueType] = l.id;
  }
  return (name: string) => byName[name]?.amount ?? null;
}

const OUTLET_STREAM_NAMES = {
  totalSales: "Total Cafe Sales",
  inhouse: "Inhouse Product Sales",
  liquor: "Sales from Liquor",
  events: "Sales from Events",
  outside: "Sales from Outside Products",
  opCost: "Total Operation Cost",
  pl: "P+L = Gross Revenue - Operating Costs",
};

export type OutletStreams = Record<keyof typeof OUTLET_STREAM_NAMES, Series>;

export function computeOutletSeries(
  idx: FrIndex, li2: (name: string) => number | null, unitId: number, weeks: OutletWeek[]
): OutletStreams {
  const out = {} as OutletStreams;
  for (const [key, name] of Object.entries(OUTLET_STREAM_NAMES)) {
    const lid = li2(name);
    out[key as keyof typeof OUTLET_STREAM_NAMES] = weeks.map((w) => frGet(idx, unitId, w.id, lid));
  }
  return out;
}

export function computeAllOutlets(
  idx: FrIndex, li2: (name: string) => number | null, weeks: OutletWeek[]
): Record<OutletKey, OutletStreams> {
  return {
    bosarGhor: computeOutletSeries(idx, li2, OUTLET_UNITS.bosarGhor, weeks),
    dinningRoom: computeOutletSeries(idx, li2, OUTLET_UNITS.dinningRoom, weeks),
    rannaghor: computeOutletSeries(idx, li2, OUTLET_UNITS.rannaghor, weeks),
    total: computeOutletSeries(idx, li2, OUTLET_UNITS.total, weeks),
  };
}

// Durga Puja 2025 special-event summary (sum of the two weeks it spans; kept
// separate so weekly series don't double count)
export function computeDurgaPuja(idx: FrIndex, li2: (name: string) => number | null, periods: Period[]) {
  const durgaPid = periods.find((p) => p.isSpecialEvent)?.id;
  return {
    label: "Durga Puja 2025 (22 Sep – 5 Oct)",
    totalSales: frGet(idx, OUTLET_UNITS.total, durgaPid ?? -1, li2(OUTLET_STREAM_NAMES.totalSales)),
    pl: frGet(idx, OUTLET_UNITS.total, durgaPid ?? -1, li2(OUTLET_STREAM_NAMES.pl)),
  };
}

// menu mix per outlet - aggregated over all outlet weeks
const MENU_ITEMS = [
  "Pizza", "Omlettes", "Sandwitch & Burgers", "Snacks", "Salads", "Soups",
  "Pastas", "Desserts", "Coffee", "Tea", "Lemonade", "Café Products",
  "Cafe Specials", "Sienna Specials", "Baro Plates", "Chotto Plates",
  "Sharing Portions", "Specials", "Bar Bites", "Mixer", "Misti",
];
const MENU_LABELS: Record<string, string> = { "Sandwitch & Burgers": "Sandwiches & Burgers", "Omlettes": "Omelettes" };

export function computeMenuMix(
  idx: FrIndex, li2: (name: string) => number | null, outletKey: OutletKey, weeks: OutletWeek[]
) {
  const uid = OUTLET_UNITS[outletKey];
  return MENU_ITEMS.map((name) => ({
    name: MENU_LABELS[name] || name,
    value: sum(weeks.map((w) => frGet(idx, uid, w.id, li2(name)))),
  }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
}

// liquor mix (all outlets) - "Beer" and "Wine/Beer" are the same row renamed
const LIQUOR_GROUPS = [
  { name: "Cocktails", lis: ["Cocktails"] },
  { name: "Spirits", lis: ["Spirits"] },
  { name: "Wine & Beer", lis: ["Beer", "Wine/Beer"] },
];
export function computeLiquorMix(idx: FrIndex, li2: (name: string) => number | null, weeks: OutletWeek[]) {
  return LIQUOR_GROUPS.map(({ name, lis }) => ({
    name,
    value: sum(lis.flatMap((n) => weeks.map((w) => frGet(idx, OUTLET_UNITS.total, w.id, li2(n))))),
  })).filter((x) => x.value > 0);
}

// events detail - weekly totals plus named-event breakdown (all outlets)
const EVENT_SUB_NAMES = [
  "Rannaghor", "Other Events", "Other Events (After Hours)", "Other Events (Mizu)",
  "Other Events (Beyond Berg)", "Other Events (Dali Gala After Hours)",
  "Other Events (Riga Foods and Key Stone)",
];
export function computeEventsBreakdown(idx: FrIndex, li2: (name: string) => number | null, weeks: OutletWeek[]) {
  return EVENT_SUB_NAMES.map((name) => ({
    name: name === "Rannaghor" ? "Rannaghor (event kitchen)" : name.replace(/^Other Events \(?|\)$/g, "") || "Other Events",
    value: sum(weeks.map((w) => frGet(idx, OUTLET_UNITS.total, w.id, li2(name)))),
  })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
}

// Whole-cafe P&L, weekly from the week of 31 Mar 2025 through the week
// before the outlet split (unit "Cafe": the source workbook reports weekly
// detail here too, same as the outlet-split era below - it's just not
// broken out by Bosar Ghor / Dinning Room / Rannaghor yet).
export const CAFE_BU = 7;

export const cafeEarlyWeeks = (periods: Period[]): OutletWeek[] =>
  weeksFrom(periods, (p) => p.startDate < "2025-09-01");

export function computeCafeEarlyWeekly(idx: FrIndex, li2: (name: string) => number | null, weeks: OutletWeek[]) {
  const pids = weeks.map((w) => w.id);
  return {
    productSales: series(idx, CAFE_BU, li2("Café Product Sales"), pids),
    retailSales: series(idx, CAFE_BU, li2("Café Retail Sales"), pids),
    liquor: series(idx, CAFE_BU, li2("Liquor"), pids),
    eventSales: series(idx, CAFE_BU, li2("Cafe Event Sales"), pids),
    totalSales: series(idx, CAFE_BU, li2("Total Cafe Sales"), pids),
    opCost: series(idx, CAFE_BU, li2("Total Operation Cost"), pids),
    pl: series(idx, CAFE_BU, li2("P+L = Gross Revenue - Operating Costs"), pids),
  };
}
