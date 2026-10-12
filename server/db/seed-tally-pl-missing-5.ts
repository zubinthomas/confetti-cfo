// Follow-up to seed-tally-pl-and-missing-bs.ts. That script's "skip if a
// line item with this name already exists under businessId" check was too
// broad: line items aren't scoped to a business UNIT, only a business, so
// five of its intended company-wide "Profit & Loss" line items collided
// with unrelated *per-outlet* line items that happen to share the same
// display name (two different outlets each already have their own
// "Electricity Charges" line item, for instance) and got silently skipped.
//
// This creates exactly those five, unconditionally (no name-collision
// check against the wider catalog) - safe to run once. Re-running it is
// NOT idempotent by name like the other seed scripts, because the whole
// point is that the name is allowed to repeat; it guards only against
// re-running this exact script twice, by checking whether an item with
// this name already exists at an id >= FIRST_RUN_MIN_ID (i.e. was created
// by the first seed's own run, not a pre-existing legacy one).
import { db, ready, schema } from './client.ts';

const BUSINESS_ID = 1; // CEPL, same as the other two Tally seeds
const FIRST_RUN_MIN_ID = 709; // the first new id seed-tally-pl-and-missing-bs.ts created

const MISSING: { name: string; category: 'revenue' | 'cogs' | 'hr_cost' | 'operating_cost' | 'subtotal' | 'other' }[] = [
  { name: 'Service Charges', category: 'revenue' },
  { name: 'Electricity Charges', category: 'cogs' },
  { name: 'Freight Charges', category: 'cogs' },
  { name: 'Misc Expenses', category: 'operating_cost' },
  { name: 'Printing & Stationery', category: 'operating_cost' },
];

async function main() {
  await ready();

  const lineItemRows = await db.select().from(schema.lineItems);
  let nextLiId = lineItemRows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
  const alreadyFromThisSeed = new Set(
    lineItemRows.filter((l) => l.businessId === BUSINESS_ID && l.id >= FIRST_RUN_MIN_ID).map((l) => l.name),
  );

  let created = 0;
  for (const { name, category } of MISSING) {
    if (alreadyFromThisSeed.has(name)) {
      console.log(`"${name}" already created by this seed family, skipping.`);
      continue;
    }
    await db.insert(schema.lineItems).values({ id: nextLiId, businessId: BUSINESS_ID, name, category, valueType: 'amount' });
    console.log(`Created line item "${name}" (id ${nextLiId}, category ${category}).`);
    nextLiId += 1;
    created += 1;
  }

  console.log(`Done. ${created} new line item(s) created.`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
