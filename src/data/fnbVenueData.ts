// Pure, parametrized CEPL F&B venue-level computations (business 1): weekly
// P&L by venue (Bosar Ghor / Dining Room / Rannaghor / Bar / Event / Bar
// Find / Catering), menu/liquor mix, and a top-level cost-category mix -
// sourced from the "F&B Weekly P&L" import (server/import/parseFnbWeekly.ts),
// opt-in detail layered on top of the existing monthly F&B aggregate.
//
// Unlike src/data/outletData.ts (Cafe's equivalent), venue business-unit ids
// aren't known ahead of time here - Cafe's outlets were seeded once at fixed
// ids, but CEPL's venue units are created fresh by the weekly importer and
// get whatever ids the DB assigns them. So venue name -> business-unit id is
// resolved dynamically from reference data (buildVenueUnitLookup), the same
// way outletData.ts already resolves line-item name -> id dynamically
// (buildLi2Lookup) instead of hardcoding those.
import { frGet, sum, type FrIndex, type Series } from "./seriesKernel";
import type { BusinessUnit, LineItem, Period } from "./types";

export const CEPL_ID = 1;

// canonical venue names post-alias (parseFnbWeekly.ts folds "Dinning Room"
// onto "Dining Room" before writing); "Bar Find" stops appearing in the
// source from mid-July 2026 but its unit/data stay valid for the weeks it
// does cover.
export const VENUE_NAMES = [
  "Bosar Ghor", "Dining Room", "Rannaghor", "Bar", "Event", "Bar Find", "Catering",
] as const;
export type VenueName = (typeof VENUE_NAMES)[number];

/** Venue name -> business_unit id, resolved from reference data (not hardcoded - see header note). */
export function buildVenueUnitLookup(businessUnits: BusinessUnit[]): Partial<Record<VenueName, number>> {
  const out: Partial<Record<VenueName, number>> = {};
  for (const u of businessUnits) {
    if (u.businessId === CEPL_ID && u.unitType === "outlet" && (VENUE_NAMES as readonly string[]).includes(u.name)) {
      out[u.name as VenueName] = u.id;
    }
  }
  return out;
}

/** CEPL (business 1) line item name -> amount lineItemId lookup. */
export function buildFnbLiLookup(lineItems: LineItem[]): (name: string) => number | null {
  const byName: Record<string, Partial<Record<"amount" | "percentage", number>>> = {};
  for (const l of lineItems) {
    if (l.businessId === CEPL_ID) (byName[l.name] ??= {})[l.valueType] = l.id;
  }
  return (name: string) => byName[name]?.amount ?? null;
}

export interface FnbWeek { id: number; label: string; short: string; month: string }

/** Ordered weekly periods the F&B Weekly P&L import covers (01-Apr-2026 on). */
export function fnbWeeks(periods: Period[]): FnbWeek[] {
  return periods
    .filter((p) => p.periodType === "week" && !p.isSpecialEvent && p.startDate >= "2026-04-01")
    .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))
    .map((p) => ({
      id: p.id,
      label: p.label,
      short: p.startDate.slice(8, 10) + "/" + p.startDate.slice(5, 7),
      month: new Date(p.startDate + "T00:00:00").toLocaleString("en", { month: "short" }),
    }));
}

const FNB_STREAM_NAMES = {
  totalSales: "Total F&B Sales",
  inhouse: "Inhouse Product Sales",
  liquor: "Sales from Liquor",
  events: "Sales from Events",
  outside: "Sales from Outside Products",
  opCost: "Total Operation Cost",
  pl: "P+L = Gross Revenue - Operating Costs",
};

export type FnbStreams = Record<keyof typeof FNB_STREAM_NAMES, Series>;

export function computeVenueSeries(
  idx: FrIndex, li: (name: string) => number | null, unitId: number, weeks: FnbWeek[]
): FnbStreams {
  const out = {} as FnbStreams;
  for (const [key, name] of Object.entries(FNB_STREAM_NAMES)) {
    out[key as keyof typeof FNB_STREAM_NAMES] = weeks.map((w) => frGet(idx, unitId, w.id, li(name)));
  }
  return out;
}

export function computeAllVenues(
  idx: FrIndex, li: (name: string) => number | null,
  venueUnits: Partial<Record<VenueName, number>>, weeks: FnbWeek[]
): Partial<Record<VenueName, FnbStreams>> {
  const out: Partial<Record<VenueName, FnbStreams>> = {};
  for (const name of VENUE_NAMES) {
    const unitId = venueUnits[name];
    if (unitId != null) out[name] = computeVenueSeries(idx, li, unitId, weeks);
  }
  return out;
}

/** Sum of `names` across every active venue/week, ranked desc, zeroes dropped. */
function mixOf(
  idx: FrIndex, li: (name: string) => number | null,
  venueUnits: Partial<Record<VenueName, number>>, weeks: FnbWeek[], names: string[]
): { name: string; value: number }[] {
  const unitIds = Object.values(venueUnits).filter((v): v is number => v != null);
  return names
    .map((name) => ({ name, value: sum(unitIds.flatMap((uid) => weeks.map((w) => frGet(idx, uid, w.id, li(name))))) }))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value);
}

// menu mix (all venues combined) - explicit leaf-item names only, so the
// parent rollup row ("Inhouse Product Sales") isn't double-counted
const MENU_ITEMS = [
  "Pizza", "Omlettes", "Sandwitch & Burgers", "Snacks", "Salads", "Soups", "Pastas",
  "Cafe Specials", "Desserts", "Coffee", "Tea", "Lemonade", "Café Products",
  "Baro Plates", "Chotto Plates", "Sharing Portions", "Sienna Specials", "Bar Bites",
  "Mixer", "Misti", "Sienna Kids Menu", "Tasting Menu Food", "Tasting Menu Drinks",
];

export const computeMenuMix = (
  idx: FrIndex, li: (name: string) => number | null,
  venueUnits: Partial<Record<VenueName, number>>, weeks: FnbWeek[]
) => mixOf(idx, li, venueUnits, weeks, MENU_ITEMS);

const LIQUOR_ITEMS = ["Cocktails", "Spirits", "Wine/Beer"];

export const computeLiquorMix = (
  idx: FrIndex, li: (name: string) => number | null,
  venueUnits: Partial<Record<VenueName, number>>, weeks: FnbWeek[]
) => mixOf(idx, li, venueUnits, weeks, LIQUOR_ITEMS);

// top-level operating-cost categories (all venues combined) - the sheet's
// own section-header rows. Five of these have a further sub-line tree below
// them (see DRILL_DOWN) - Marketing & PR is a single line in the sheet, and
// Delivery Commission's sub-items are already their own card
// (computeDeliveryPlatformMix), so neither needs a drill-down entry too.
const COST_CATEGORY_NAMES = {
  "Raw Material": "Total Raw Material Purchase",
  "HR": "HR",
  "Site Cost": "Site Cost (IT, POS, Utilities, Internet, Phones, Electiricity & Similar Costs)",
  "Repair & Maintenance": "Repair & Maintenance (AMCs + Ad-hoc Repairs+Furniture+Equipment)",
  "Marketing & PR": "Marketing & PR",
  "Delivery Commission": "Delivery Partner Commission",
  "Other Expenses": "Other Expenses (think off the books pay-offs and any other expenses being occurred but not falling into the above brackets)",
};

export function computeCostMix(
  idx: FrIndex, li: (name: string) => number | null,
  venueUnits: Partial<Record<VenueName, number>>, weeks: FnbWeek[]
) {
  const unitIds = Object.values(venueUnits).filter((v): v is number => v != null);
  return Object.entries(COST_CATEGORY_NAMES).map(([name, rowLabel]) => ({
    name,
    value: sum(unitIds.flatMap((uid) => weeks.map((w) => frGet(idx, uid, w.id, li(rowLabel))))),
  })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value);
}

const DELIVERY_PLATFORMS = ["Zomato", "Zomato Gold", "Swiggy", "Swiggy Dineout"];

export const computeDeliveryPlatformMix = (
  idx: FrIndex, li: (name: string) => number | null,
  venueUnits: Partial<Record<VenueName, number>>, weeks: FnbWeek[]
) => mixOf(idx, li, venueUnits, weeks, DELIVERY_PLATFORMS);

// Sub-line detail one level below a mix card's headline number - opt-in via
// a "drill into" chip in the UI, not shown by default. Leaf names are
// verbatim sheet labels (typos included, e.g. "Bevarage", "Proffessional
// Tax") since parseFnbWeekly.ts imports every row label as-is; parent/
// subtotal rows (e.g. "Perishable Goods") are deliberately excluded so
// their children aren't double-counted against the headline total.
const DRILL_DOWN: Record<string, string[]> = {
  "Raw Material": [
    "Vegetables", "Fruits", "Dairy", "Sweets", "Bread", "Mutton", "Chicken", "Pork",
    "Fish", "Egg", "Processed Meats",
    "Rice", "Dal", "Spices", "Dry Fruits", "Oil", "Grocery Others", "Chocolate",
    "Ice", "Bevarage", "Chips", "Honey", "Liquor",
    "Gas", "Wood", "Kitchen Items", "Housekeeping", "Packaging", "Other Stationeries",
    "Kombucha (Retail Purchases)", "Water Charges",
  ],
  "HR": ["Salary", "Service Charges", "Staff Meal Food Cost", "Medical", "Staff Welfare"],
  "Site Cost": ["Building Rent", "Electricity Charges", "Fuel", "Telephone & Internet"],
  "Repair & Maintenance": [
    "Electrical Maintenance", "Furniture Repairing", "Plumbing Expenses",
    "Filter Repairing Expenses", "Fire Extinguisher", "CCTV Maintenance",
    "Coffee Machine Repairing", "Café Maintenance", "Kitchen Items Repairing",
    "Housekeeping Charges", "PC & Tab Maintenance", "AC Maintenance",
    "Pest Control Expenses", "Car Expenses", "Courier", "Misc Expenses",
  ],
  "Other Expenses": [
    "Banking Charges", "Insurance", "Legal Fees", "Consultancy Fees", "TDS Deducted",
    "GST Paid", "Proffessional Tax", "Property Tax", "Fire License", "Trade License",
    "FOOD LICENSE", "Police License", "Bar License", "Traveling Expneses", "Freight Charges",
  ],
  "Events": ["Rannaghor", "Other Events"],
  "Outside Products": ["Water", "Kombucha"],
};

export const DRILL_DOWN_CATEGORIES = Object.keys(DRILL_DOWN);

// "Rannaghor" as an events sub-item means Rannaghor booked as an event
// space, distinct from the venue's own regular sales - disambiguated in
// display only (the lookup key stays the sheet's own "Rannaghor" label).
const DRILL_DOWN_LABELS: Record<string, string> = { "Rannaghor": "Rannaghor (event kitchen)" };

export function computeDrillDown(
  idx: FrIndex, li: (name: string) => number | null,
  venueUnits: Partial<Record<VenueName, number>>, weeks: FnbWeek[], category: string
) {
  return mixOf(idx, li, venueUnits, weeks, DRILL_DOWN[category] ?? [])
    .map((x) => (category === "Events" && DRILL_DOWN_LABELS[x.name] ? { ...x, name: DRILL_DOWN_LABELS[x.name] } : x));
}
