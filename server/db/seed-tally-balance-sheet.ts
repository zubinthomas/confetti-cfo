// One-off seed: adds a company-wide "Balance Sheet" business unit and one
// line item per balance-sheet-natured Tally group, so the Tally group-mapping
// UI (src/components/dashboard/TallyPage.tsx) has somewhere real to point
// balance groups at. Before this, every business unit was an F&B/craft
// outlet and every line item was P&L-shaped (see
// src/data/cashFlowFinancials.ts's own header comment) - there was no
// destination for Fixed Deposit, Sundry Debtors, Duties & Taxes and so on.
//
// Run once per database: `node db/seed-tally-balance-sheet.ts` with the
// server stopped first (PGlite is single-process - see client.ts). Safe to
// re-run - it skips names that already exist under the target business.
import { db, ready, schema } from './client.ts';
import { eq, and } from 'drizzle-orm';

const BUSINESS_ID = 1; // CEPL - the group that JP Office's chart of accounts belongs to
const UNIT_NAME = 'Balance Sheet';

// Named after the real Tally group, so a client's accountant sees their own
// vocabulary in the mapping UI rather than a relabeling. One row per primary
// group that is asset/liability/capital in nature; P&L groups (Sales-*,
// Purchase*, the expense groups, Salary & Benefits, ...) are excluded here -
// those await the group-row reconciliation decision (tally-deployment-steps
// step 2) and map against the existing P&L line items once that lands.
const BALANCE_GROUP_NAMES = [
  'Adv. to Outsider',
  'Advance From Client',
  'Advance From Director for Purchase',
  'Advance From Other',
  'Advance to Staff',
  'Advance to Supplier',
  'Bank OD A/c',
  'Cash-in-hand',
  'Duties & Taxes',
  'Fixed Assets',
  'Fixed Deposit',
  'Loan & Advance-Other',
  'Loan From Directors',
  'Other Current Liabilities',
  'Provisions',
  'Reserves & Surplus',
  'Secured Loans',
  'Security Deposit',
  'Stock-in-hand',
  'Sundry Creditors',
  'Sundry Debtors',
  'Suspense A/c',
  'TDS Payable',
];

async function main() {
  await ready();

  const existingUnit = await db.query.businessUnits.findFirst({
    where: and(eq(schema.businessUnits.businessId, BUSINESS_ID), eq(schema.businessUnits.name, UNIT_NAME)),
  });

  let unitId: number;
  if (existingUnit) {
    unitId = existingUnit.id;
    console.log(`Business unit "${UNIT_NAME}" already exists (id ${unitId}), reusing it.`);
  } else {
    const units = await db.select({ id: schema.businessUnits.id }).from(schema.businessUnits);
    unitId = units.reduce((m, r) => Math.max(m, r.id), 0) + 1;
    await db.insert(schema.businessUnits).values({
      id: unitId, businessId: BUSINESS_ID, name: UNIT_NAME, unitType: 'department',
    });
    console.log(`Created business unit "${UNIT_NAME}" (id ${unitId}).`);
  }

  const lineItemRows = await db.select().from(schema.lineItems);
  let nextLiId = lineItemRows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
  const existingByName = new Set(
    lineItemRows.filter((l) => l.businessId === BUSINESS_ID).map((l) => l.name),
  );

  let created = 0;
  for (const name of BALANCE_GROUP_NAMES) {
    if (existingByName.has(name)) {
      console.log(`Line item "${name}" already exists, skipping.`);
      continue;
    }
    await db.insert(schema.lineItems).values({
      id: nextLiId, businessId: BUSINESS_ID, name, category: 'other', valueType: 'amount',
    });
    console.log(`Created line item "${name}" (id ${nextLiId}).`);
    nextLiId += 1;
    created += 1;
  }

  console.log(`Done. Business unit id ${unitId}, ${created} new line item(s) created.`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
