// One-off seed, companion to seed-tally-balance-sheet.ts. Covers the gaps
// found while mapping the accountant's "Accounts for 2026_27.xlsx" workbook
// (PL + BS sheets) against the live JP Office Tally source:
//
// 1. A company-wide "Profit & Loss" business unit, mirroring the "Balance
//    Sheet" one created 2026-10-07 - same problem, P&L side. Every existing
//    P&L line item is scoped to one F&B/craft outlet; Tally's P&L groups
//    (Sales Accounts sub-groups, Direct/Indirect Expenses, ...) are
//    company-wide totals with nowhere to point until now.
// 2. One new P&L line item per Tally group that the group-mapping UI still
//    shows unmapped - the 51 groups outside the 23 already seeded as
//    balance-sheet items.
// 3. Five new balance-sheet line items for ledgers the accountant's sheet
//    names as their own category, where that ledger turned out to live
//    inside an existing Tally group rather than having one of its own:
//    Share Capital (inside Reserves & Surplus), Salary Payable (inside TDS
//    Payable), Accrued Interest and TDS Refundable on Commission (both
//    inside Sundry Debtors), TDS (also inside Sundry Debtors, a ledger
//    literally named "TDS"). These need a per-ledger override on top of the
//    group's own mapping, not a new group mapping - the group's other
//    ledgers still belong where they are.
//
// Four more accountant categories - Unsecured Loans, Deposits (Asset),
// Loans & Advances (Asset), Bank Accounts - are deliberately NOT seeded
// here. No ledger or group in this chart matches any of them by name; the
// real ledgers are most likely already inside other mapped groups (real
// bank current accounts turned up inside "Fixed Deposit", for instance),
// which means a new line item would either sit empty or double-count money
// that's already flowing into an existing one. See
// tally-trial-balance-gap-report.md and the accountant-mapping report for
// the full writeup - this needs the accountant to name specific ledgers
// before it's safe to map.
//
// Run once per database: `node db/seed-tally-pl-and-missing-bs.ts` with the
// server stopped first (PGlite is single-process - see client.ts). Safe to
// re-run - it skips names that already exist under the target business.
import { db, ready, schema } from './client.ts';
import { eq, and } from 'drizzle-orm';

const BUSINESS_ID = 1; // CEPL - same as the Balance Sheet seed

const PL_UNIT_NAME = 'Profit & Loss';

type LineItemCategory = 'revenue' | 'cogs' | 'hr_cost' | 'operating_cost' | 'subtotal' | 'other';

// Named after the real Tally group. category follows the accountant's own
// Class/Group columns where unambiguous; ambiguous ones default to 'other'
// rather than guess.
const PL_GROUPS: { name: string; category: LineItemCategory }[] = [
  // Sales Accounts sub-groups + direct/other income - revenue
  { name: 'Sales-Garment', category: 'revenue' },
  { name: 'Sales - Services', category: 'revenue' },
  { name: 'Sales -Handicrafts', category: 'revenue' },
  { name: 'Sales Personal Care', category: 'revenue' },
  { name: 'Sales-Handicraft-14.5%', category: 'revenue' },
  { name: 'Sales-Handicraft-2%', category: 'revenue' },
  { name: 'Sales-Handicrafts-5%', category: 'revenue' },
  { name: 'Sales-Jewellery', category: 'revenue' },
  { name: 'Sales-Other', category: 'revenue' },
  { name: 'Sales-Pottery', category: 'revenue' },
  { name: 'Sales-Pottery-14.5%', category: 'revenue' },
  { name: 'Sales-Pottery-CST', category: 'revenue' },
  { name: 'Sales-Taxtiles-5%', category: 'revenue' },
  { name: 'Sales-Textile-Sari', category: 'revenue' },
  { name: 'Sales-Textiles', category: 'revenue' },
  { name: 'Sales-Tiles-14.5%', category: 'revenue' },
  { name: 'Direct Incomes', category: 'revenue' },
  { name: 'Service Charges', category: 'revenue' },
  // Direct Expenses + purchase/consumable groups - cogs
  { name: 'Electricity Charges', category: 'cogs' },
  { name: 'Freight Charges', category: 'cogs' },
  { name: 'Processing Expenses', category: 'cogs' },
  { name: 'Purchase Sienna Cafe', category: 'cogs' },
  { name: 'Purchase Sienna Cafe (Bar Find)', category: 'cogs' },
  { name: 'Purchases RM-Pottery', category: 'cogs' },
  { name: 'Finished Goods-Trading', category: 'cogs' },
  { name: 'Consumable A/c', category: 'cogs' },
  { name: 'Consumable A/c Printing', category: 'cogs' },
  { name: 'Consumable A/c- Dress', category: 'cogs' },
  { name: 'Packing Materials-Purchase', category: 'cogs' },
  // Payroll-adjacent - hr_cost
  { name: 'Salary & Benefits-Payroll', category: 'hr_cost' },
  { name: 'Staff Food', category: 'hr_cost' },
  // Indirect Expenses - operating_cost
  { name: 'Auditors Remuneration', category: 'operating_cost' },
  { name: 'Bank Charges & Interest', category: 'operating_cost' },
  { name: 'Batik Unit Expenses', category: 'operating_cost' },
  { name: 'Building & Show Room Maintanance', category: 'operating_cost' },
  { name: 'Cost of Promotion', category: 'operating_cost' },
  { name: 'Donation & Subcription', category: 'operating_cost' },
  { name: 'Factory Maintenance', category: 'operating_cost' },
  { name: 'Fair & Exhibition', category: 'operating_cost' },
  { name: 'Insurance Expenses', category: 'operating_cost' },
  { name: 'Machinery Maintenance', category: 'operating_cost' },
  { name: 'Misc Expenses', category: 'operating_cost' },
  { name: 'Other Expenses', category: 'operating_cost' },
  { name: 'Printing & Stationery', category: 'operating_cost' },
  { name: 'Professional Service', category: 'operating_cost' },
  { name: 'Rate & Taxes', category: 'operating_cost' },
  { name: 'Rent & Rates', category: 'operating_cost' },
  { name: 'Stiching Expenses', category: 'operating_cost' },
  { name: 'Telephone & Internet Exp.', category: 'operating_cost' },
  { name: 'Travelling Expenses', category: 'operating_cost' },
  // Non-operating income - other
  { name: 'Indirect Incomes', category: 'other' },
];

// Balance-sheet line items for specific ledgers the accountant's sheet
// names on their own, where that ledger lives inside an existing group.
const BS_LEDGER_ITEMS = [
  'Share Capital',
  'Salary Payable',
  'Accrued Interest',
  'TDS',
  'TDS Refundable on Commission',
];

async function ensureUnit(name: string): Promise<number> {
  const existing = await db.query.businessUnits.findFirst({
    where: and(eq(schema.businessUnits.businessId, BUSINESS_ID), eq(schema.businessUnits.name, name)),
  });
  if (existing) {
    console.log(`Business unit "${name}" already exists (id ${existing.id}), reusing it.`);
    return existing.id;
  }
  const units = await db.select({ id: schema.businessUnits.id }).from(schema.businessUnits);
  const id = units.reduce((m, r) => Math.max(m, r.id), 0) + 1;
  await db.insert(schema.businessUnits).values({ id, businessId: BUSINESS_ID, name, unitType: 'department' });
  console.log(`Created business unit "${name}" (id ${id}).`);
  return id;
}

async function main() {
  await ready();

  const plUnitId = await ensureUnit(PL_UNIT_NAME);

  const lineItemRows = await db.select().from(schema.lineItems);
  let nextLiId = lineItemRows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
  const existingByName = new Set(
    lineItemRows.filter((l) => l.businessId === BUSINESS_ID).map((l) => l.name),
  );

  let created = 0;
  const createdIds: Record<string, number> = {};

  for (const { name, category } of PL_GROUPS) {
    if (existingByName.has(name)) {
      console.log(`Line item "${name}" already exists, skipping.`);
      continue;
    }
    await db.insert(schema.lineItems).values({ id: nextLiId, businessId: BUSINESS_ID, name, category, valueType: 'amount' });
    createdIds[name] = nextLiId;
    console.log(`Created P&L line item "${name}" (id ${nextLiId}, category ${category}).`);
    nextLiId += 1;
    created += 1;
  }

  for (const name of BS_LEDGER_ITEMS) {
    if (existingByName.has(name)) {
      console.log(`Line item "${name}" already exists, skipping.`);
      continue;
    }
    await db.insert(schema.lineItems).values({ id: nextLiId, businessId: BUSINESS_ID, name, category: 'other', valueType: 'amount' });
    createdIds[name] = nextLiId;
    console.log(`Created BS ledger line item "${name}" (id ${nextLiId}).`);
    nextLiId += 1;
    created += 1;
  }

  console.log(`Done. "Profit & Loss" business unit id ${plUnitId}, ${created} new line item(s) created.`);
  console.log(`JSON: ${JSON.stringify({ plUnitId, createdIds })}`);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
