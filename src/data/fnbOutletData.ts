// ─────────────────────────────────────────────────────────────────────────────
// Cafe weekly workbook adapter (business 2): outlet-level weekly P&L from
// Sept 2025 (Bosar Ghor / Dinning Room / Rannaghor + Total), revenue streams
// (inhouse menu, liquor, events, outside products), menu & liquor mix,
// events breakdown, the Durga Puja special-event summary, and the whole-cafe
// Apr-Aug 2025 monthly P&L from before the outlet split.
// ─────────────────────────────────────────────────────────────────────────────

import { FY2526_PIDS, periods, lineItems, frGet, series, sum, type Series } from "./core";

const li2ByName: Record<string, Partial<Record<"amount" | "percentage", number>>> = {};
for (const l of lineItems) {
  if (l.businessId === 2) (li2ByName[l.name] ??= {})[l.valueType] = l.id;
}
const li2 = (name: string): number | null => li2ByName[name]?.amount ?? null;

export const OUTLET_UNITS = { bosarGhor: 8, dinningRoom: 9, rannaghor: 10, total: 11 } as const;
export type OutletKey = keyof typeof OUTLET_UNITS;
export const OUTLET_LABELS: Record<OutletKey, string> = {
  bosarGhor: "Bosar Ghor (Cafe)",
  dinningRoom: "Dinning Room (Restaurant)",
  rannaghor: "Rannaghor",
  total: "All outlets",
};

// ordered outlet weeks (Sept 2025 →), special-event summaries excluded
export const OUTLET_WEEKS = periods
  .filter((p) => p.periodType === "week" && p.startDate >= "2025-09-01" && !p.isSpecialEvent)
  .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))
  .map((p) => ({
    id: p.id,
    label: p.label,
    short: p.startDate.slice(8, 10) + "/" + p.startDate.slice(5, 7),
    month: new Date(p.startDate + "T00:00:00").toLocaleString("en", { month: "short" }),
  }));

const OUTLET_STREAM_LIS = {
  totalSales: li2("Total Cafe Sales"),
  inhouse:    li2("Inhouse Product Sales"),
  liquor:     li2("Sales from Liquor"),
  events:     li2("Sales from Events"),
  outside:    li2("Sales from Outside Products"),
  opCost:     li2("Total Operation Cost"),
  pl:         li2("P+L = Gross Revenue - Operating Costs"),
};

export type OutletStreams = Record<keyof typeof OUTLET_STREAM_LIS, Series>;

function outletSeries(unitId: number): OutletStreams {
  const out = {} as OutletStreams;
  for (const [key, lid] of Object.entries(OUTLET_STREAM_LIS)) {
    out[key as keyof typeof OUTLET_STREAM_LIS] = OUTLET_WEEKS.map((w) => frGet(unitId, w.id, lid));
  }
  return out;
}
export const OUTLETS: Record<OutletKey, OutletStreams> = {
  bosarGhor: outletSeries(OUTLET_UNITS.bosarGhor),
  dinningRoom: outletSeries(OUTLET_UNITS.dinningRoom),
  rannaghor: outletSeries(OUTLET_UNITS.rannaghor),
  total: outletSeries(OUTLET_UNITS.total),
};

// Durga Puja 2025 special-event summary (sum of the two weeks it spans; kept
// separate so weekly series don't double count)
const DURGA_PID = periods.find((p) => p.isSpecialEvent)?.id;
export const DURGA_PUJA = {
  label: "Durga Puja 2025 (22 Sep – 5 Oct)",
  totalSales: frGet(OUTLET_UNITS.total, DURGA_PID, OUTLET_STREAM_LIS.totalSales),
  pl:         frGet(OUTLET_UNITS.total, DURGA_PID, OUTLET_STREAM_LIS.pl),
};

// menu mix per outlet — aggregated over all outlet weeks
const MENU_ITEMS = [
  "Pizza", "Omlettes", "Sandwitch & Burgers", "Snacks", "Salads", "Soups",
  "Pastas", "Desserts", "Coffee", "Tea", "Lemonade", "Café Products",
  "Cafe Specials", "Sienna Specials", "Baro Plates", "Chotto Plates",
  "Sharing Portions", "Specials", "Bar Bites", "Mixer", "Misti",
];
const MENU_LABELS: Record<string, string> = { "Sandwitch & Burgers": "Sandwiches & Burgers", "Omlettes": "Omelettes" };
export function menuMix(outletKey: OutletKey) {
  const uid = OUTLET_UNITS[outletKey];
  return MENU_ITEMS.map((name) => ({
    name: MENU_LABELS[name] || name,
    value: sum(OUTLET_WEEKS.map((w) => frGet(uid, w.id, li2(name)))),
  }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
}

// liquor mix (all outlets) — "Beer" and "Wine/Beer" are the same row renamed
export const LIQUOR_MIX = [
  { name: "Cocktails", lis: ["Cocktails"] },
  { name: "Spirits", lis: ["Spirits"] },
  { name: "Wine & Beer", lis: ["Beer", "Wine/Beer"] },
].map(({ name, lis }) => ({
  name,
  value: sum(lis.flatMap((n) => OUTLET_WEEKS.map((w) => frGet(OUTLET_UNITS.total, w.id, li2(n))))),
})).filter((x) => x.value > 0);

// events detail — weekly totals plus named-event breakdown (all outlets)
const EVENT_SUB_LIS = [
  "Rannaghor", "Other Events", "Other Events (After Hours)", "Other Events (Mizu)",
  "Other Events (Beyond Berg)", "Other Events (Dali Gala After Hours)",
  "Other Events (Riga Foods and Key Stone)",
];
export const EVENTS_BREAKDOWN = EVENT_SUB_LIS.map((name) => ({
  name: name === "Rannaghor" ? "Rannaghor (event kitchen)" : name.replace(/^Other Events \(?|\)$/g, "") || "Other Events",
  value: sum(OUTLET_WEEKS.map((w) => frGet(OUTLET_UNITS.total, w.id, li2(name)))),
})).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);

// Whole-cafe P&L, Apr-Aug 2025 (unit "Cafe": monthly Total column of the
// weekly sheets; the outlet split doesn't exist yet for these months)
const CAFE_BU = 7;
export const CAFE_MONTH_LABELS = ["Apr", "May", "Jun", "Jul", "Aug"];
const CAFE_MONTH_PIDS = FY2526_PIDS.slice(0, 5);
export const CAFE_MONTHLY = {
  productSales: series(CAFE_BU, li2("Café Product Sales"), CAFE_MONTH_PIDS),
  retailSales:  series(CAFE_BU, li2("Café Retail Sales"), CAFE_MONTH_PIDS),
  liquor:       series(CAFE_BU, li2("Liquor"), CAFE_MONTH_PIDS),
  eventSales:   series(CAFE_BU, li2("Cafe Event Sales"), CAFE_MONTH_PIDS),
  totalSales:   series(CAFE_BU, li2("Total Cafe Sales"), CAFE_MONTH_PIDS),
  opCost:       series(CAFE_BU, li2("Total Operation Cost"), CAFE_MONTH_PIDS),
  pl:           series(CAFE_BU, li2("P+L = Gross Revenue - Operating Costs"), CAFE_MONTH_PIDS),
};
