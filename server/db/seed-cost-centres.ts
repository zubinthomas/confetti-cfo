// One-off seed for the cost-centre master (cost-centre-master-proposal): the
// seven coded groups plus ONLY the memberships that have been decided.
// Everything still open with Sienna or Capsage (Store, Trading Items, Midweek,
// the F&B and Cafe department aggregates, Sienna's channels, consignment
// vendors) is deliberately left without a row so it shows up as Unassigned.
//
// Run per database: `node db/seed-cost-centres.ts` with the server stopped
// (PGlite is single-process - see client.ts). Safe to re-run:
//   - centres are inserted by code and never renamed or edited if they exist;
//   - a unit that already has a membership row (decided, moved, or excluded in
//     the UI) is left exactly as it is;
//   - a unit that doesn't exist in this database is reported, never created.
// Units are resolved by (business name, unit name) because unit ids are
// allocated max+1 at import time and differ between environments.
import { pathToFileURL } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';

export const COST_CENTRES = [
  { code: 'CC-HFB', name: 'Hospitality F&B', description: 'Cafe, restaurant and bar outlets.' },
  { code: 'CC-RTL', name: 'Retail', description: "Direct-to-customer retail: Sienna's store channels and partner-brand sales." },
  { code: 'CC-CRF', name: 'Pottery/Craft', description: 'Craft production departments: Pottery, Batik, Stitching.' },
  { code: 'CC-CEV', name: 'Catering/Events', description: 'Catering and event-hosting activity, including the Chef\'s Table (Rannaghor).' },
  { code: 'CC-SPN', name: 'Sponsorships', description: 'No data source defined yet.' },
  { code: 'CC-SHS', name: 'Shared Services', description: 'Costs shared across cost centres. No data source defined yet.' },
  { code: 'CC-CPX', name: 'Capital/Expansion', description: 'Capital expenditure and expansion projects. No data source defined yet.' },
] as const;

type Code = typeof COST_CENTRES[number]['code'];

// [business, unit, centre]
const MEMBERSHIPS: [string, string, Code][] = [
  ['CEPL', 'Bosar Ghor', 'CC-HFB'],
  ['CEPL', 'Dining Room', 'CC-HFB'],
  ['CEPL', 'Bar', 'CC-HFB'],
  ['CEPL', 'Bar Find', 'CC-HFB'], // retired from the workbook 13-07-2026; history stays in F&B
  ['Cafe', 'Bosar Ghor', 'CC-HFB'],
  ['Cafe', 'Dinning Room', 'CC-HFB'],
  ['CEPL', 'Rannaghor', 'CC-CEV'], // the Chef's Table; bookable, so an open allocation question for Sienna
  ['Cafe', 'Rannaghor', 'CC-CEV'],
  ['CEPL', 'Event', 'CC-CEV'],
  ['CEPL', 'Catering', 'CC-CEV'],
  ['CEPL', 'Pottery', 'CC-CRF'],
  ['CEPL', 'Batik', 'CC-CRF'],
  ['CEPL', 'Stitching', 'CC-CRF'],
];

// [business, unit, reason]
const EXCLUSIONS: [string, string, string][] = [
  ['CEPL', 'Balance Sheet', 'Technical bucket holding Tally balance-sheet mappings, not an org unit.'],
  ['CEPL', 'Profit & Loss', 'Technical bucket holding Tally P&L mappings, not an org unit.'],
  ['Cafe', 'Total', 'Rollup of the Cafe outlet rows; counting it would double count.'],
];

export interface SeedReport {
  centresCreated: string[];
  membersCreated: string[];
  alreadyDecided: string[];
  notFound: string[];
}

export async function applyCostCentreSeed(): Promise<SeedReport> {
  await ready();
  const report: SeedReport = { centresCreated: [], membersCreated: [], alreadyDecided: [], notFound: [] };
  const now = new Date().toISOString();

  for (const [i, c] of COST_CENTRES.entries()) {
    const inserted = await db.insert(schema.costCentres)
      .values({ ...c, sortOrder: i + 1, createdAt: now })
      .onConflictDoNothing({ target: schema.costCentres.code }).returning({ code: schema.costCentres.code });
    if (inserted.length) report.centresCreated.push(c.code);
  }
  const centres = await db.select().from(schema.costCentres);
  const centreId = new Map(centres.map((c) => [c.code, c.id]));
  const businesses = await db.select().from(schema.businesses);
  const businessId = new Map(businesses.map((b) => [b.name, b.id]));

  async function place(business: string, unit: string, state: { costCentreId: number } | { exclusionReason: string }) {
    const label = `${business} / ${unit}`;
    const bId = businessId.get(business);
    const [row] = bId == null ? [] : await db.select({ id: schema.businessUnits.id }).from(schema.businessUnits)
      .where(and(eq(schema.businessUnits.businessId, bId), eq(schema.businessUnits.name, unit)));
    if (!row) { report.notFound.push(label); return; }
    const [existing] = await db.select({ id: schema.costCentreMembers.id }).from(schema.costCentreMembers)
      .where(eq(schema.costCentreMembers.businessUnitId, row.id));
    if (existing) { report.alreadyDecided.push(label); return; }
    await db.insert(schema.costCentreMembers).values({
      businessUnitId: row.id,
      costCentreId: 'costCentreId' in state ? state.costCentreId : null,
      exclusionReason: 'exclusionReason' in state ? state.exclusionReason : null,
      createdAt: now,
    });
    report.membersCreated.push(label);
  }

  for (const [business, unit, code] of MEMBERSHIPS) await place(business, unit, { costCentreId: centreId.get(code)! });
  for (const [business, unit, reason] of EXCLUSIONS) await place(business, unit, { exclusionReason: reason });
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await applyCostCentreSeed();
  console.log(`Centres created: ${r.centresCreated.join(', ') || '(none, all existed)'}`);
  console.log(`Memberships created (${r.membersCreated.length}): ${r.membersCreated.join('; ') || '(none)'}`);
  if (r.alreadyDecided.length) console.log(`Left as-is, already decided (${r.alreadyDecided.length}): ${r.alreadyDecided.join('; ')}`);
  if (r.notFound.length) console.log(`Not found in this database, skipped (${r.notFound.length}): ${r.notFound.join('; ')}`);
  process.exit(0);
}
