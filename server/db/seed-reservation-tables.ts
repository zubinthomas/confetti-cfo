// One-off seed for the reservation catalogue: the Hindustan Park location, its
// four areas and the dine-in tables, taken from the POS bill-wise sales export
// (Cafe Sales HP_Billwise_19-10-2026.xls): column D is the order type with the
// table code in brackets, column E the area.
//
// Left out on purpose:
//   - Delivery rows (Swiggy, Zomato). Handled separately later.
//   - "N. C KOT" (First Floor). Looks like a bookkeeping bucket, not a table.
// Mapping of POS codes to areas (the export only says Ground Floor, First
// Floor, Curbside or Take Away):
//   1-7, C1 (Curbside), T1/T2 (Take Away)  -> Cafe
//   F1-F10                                 -> Restaurant
//   BAR 1-3, B1, B3, B5                    -> Bar
//   (nothing)                              -> Second Floor
// Table names are the POS codes verbatim so POS rows map straight to a table.
// The export has no seat counts: every table starts at DEFAULT_CAPACITY and is
// corrected in Locations & Tables.
//
// Run per database: `npm run db:seed-reservation-tables` with the server
// stopped (PGlite is single-process - see client.ts). Safe to re-run:
//   - the location and areas are matched by name and only created if absent;
//   - a table is only inserted when its area has no table of that name, so an
//     edited capacity, merge setting or booking is never touched;
//   - nothing is deleted. Tables that are not in the list (dev's old test
//     tables, say) are reported and left alone.
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';
import { DEFAULT_AREAS, DEFAULT_LOCATION } from './reservationCatalog.ts';

export const DEFAULT_CAPACITY = 4;

const range = (prefix: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);

/** Area name -> POS table codes. Keys must be area names from DEFAULT_AREAS. */
export const TABLES_BY_AREA: Record<string, string[]> = {
  Cafe: [...range('', 1, 7), 'C1', 'T1', 'T2'],
  Restaurant: range('F', 1, 10),
  Bar: ['BAR 1', 'BAR 2', 'BAR 3', 'B1', 'B3', 'B5'],
  'Second Floor': [],
};

export interface ReservationSeedReport {
  locationCreated: boolean;
  areasCreated: string[];
  /** area name -> table names inserted by this run */
  tablesCreated: Record<string, string[]>;
  /** tables from the list that were already there */
  tablesKept: number;
  /** area name -> existing tables that are not in the list (left as they are) */
  otherTables: Record<string, string[]>;
}

export async function applyReservationTableSeed(): Promise<ReservationSeedReport> {
  await ready();
  const report: ReservationSeedReport = {
    locationCreated: false, areasCreated: [], tablesCreated: {}, tablesKept: 0, otherTables: {},
  };
  const now = new Date().toISOString();

  let [location] = await db.select().from(schema.reservationLocations)
    .where(eq(schema.reservationLocations.name, DEFAULT_LOCATION));
  if (!location) {
    [location] = await db.insert(schema.reservationLocations)
      .values({ id: randomUUID(), createdDate: now, name: DEFAULT_LOCATION }).returning();
    report.locationCreated = true;
  }

  for (const [i, def] of DEFAULT_AREAS.entries()) {
    let [area] = await db.select().from(schema.reservationAreas).where(and(
      eq(schema.reservationAreas.locationId, location.id), eq(schema.reservationAreas.name, def.name),
    ));
    if (!area) {
      [area] = await db.insert(schema.reservationAreas)
        .values({
          id: randomUUID(), createdDate: new Date(Date.parse(now) + i).toISOString(),
          locationId: location.id, name: def.name, floor: def.floor,
        })
        .returning();
      report.areasCreated.push(def.name);
    }

    const wanted = TABLES_BY_AREA[def.name] ?? [];
    const existing = await db.select({ name: schema.reservationTables.name }).from(schema.reservationTables)
      .where(eq(schema.reservationTables.areaId, area.id));
    const have = new Set(existing.map((t) => t.name));

    for (const name of wanted) {
      if (have.has(name)) { report.tablesKept += 1; continue; }
      await db.insert(schema.reservationTables).values({
        id: randomUUID(), createdDate: now, areaId: area.id, name, capacity: DEFAULT_CAPACITY,
      });
      (report.tablesCreated[def.name] ??= []).push(name);
    }
    const others = existing.map((t) => t.name).filter((n) => !wanted.includes(n)).sort();
    if (others.length) report.otherTables[def.name] = others;
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await applyReservationTableSeed();
  const created = Object.values(r.tablesCreated).reduce((n, l) => n + l.length, 0);
  console.log(r.locationCreated ? `Created location "${DEFAULT_LOCATION}".` : `Location "${DEFAULT_LOCATION}" already there.`);
  console.log(r.areasCreated.length ? `Created areas: ${r.areasCreated.join(', ')}.` : 'All areas already there.');
  console.log(`Created ${created} table(s), ${r.tablesKept} already there.`);
  for (const [area, names] of Object.entries(r.tablesCreated)) console.log(`  ${area}: ${names.join(', ')}`);
  for (const [area, names] of Object.entries(r.otherTables)) {
    console.log(`Left alone in ${area} (not in the POS list): ${names.join(', ')}. Delete them in Locations & Tables if unused.`);
  }
  process.exit(0);
}
