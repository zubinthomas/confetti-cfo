// Development oracle: run the workbook parsers over data-sources/ and compare
// their output, by natural key, against the verified extraction in
// src/data/extracted_data.json. Exits non-zero on any numeric difference.
//   node import/verify-parsers.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorkbook } from './xlsx.ts';
import { parseCepl } from './parseCepl.ts';
import { parseCafe } from './parseCafe.ts';
import { parseSienna } from './parseSienna.ts';
import { parseHr } from './parseHr.ts';
import { parseTarget } from './parseTarget.ts';
import { parseFnbMonthly } from './parseFnbMonthly.ts';
import { parseFnbWeekly } from './parseFnbWeekly.ts';
import { parseOrders } from './parseOrders.ts';
import type { ParsedWorkbook } from './types.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const DATASET = path.join(ROOT, 'src', 'data', 'extracted_data.json');
const SOURCES: [string, string, (wb: Awaited<ReturnType<typeof loadWorkbook>>) => ParsedWorkbook][] = [
  ['CEPL', path.join(ROOT, 'data-sources', 'P&L', 'CEPL P & L_2025-26.xlsx'), parseCepl],
  ['Cafe', path.join(ROOT, 'data-sources', 'P&L', 'Cafe Weekly P&L - 2025 -2026.xlsx'), parseCafe],
  ['Sienna', path.join(ROOT, 'data-sources', 'Store sales', 'Sienna Store Sales Analysis FINAL.xlsx'), parseSienna],
];

const raw = JSON.parse(fs.readFileSync(DATASET, 'utf-8'));
const unitById = new Map<number, { name: string; businessId: number }>(
  raw.businessUnits.map((u: { id: number; name: string; businessId: number }) => [u.id, u]));
const businessNameById = new Map<number, string>(
  raw.businesses.map((b: { id: number; name: string }) => [b.id, b.name]));
const periodById = new Map<number, { startDate: string; periodType: string }>(
  raw.periods.map((p: { id: number; startDate: string; periodType: string }) => [p.id, p]));
const liById = new Map<number, { name: string; valueType: string; businessId: number }>(
  raw.lineItems.map((l: { id: number; name: string; valueType: string; businessId: number }) => [l.id, l]));
const catById = new Map<number, string>(raw.categories.map((c: { id: number; name: string }) => [c.id, c.name]));
const chanById = new Map<number, string>(raw.channels.map((c: { id: number; name: string }) => [c.id, c.name]));
const vendorById = new Map<number, string>(raw.vendors.map((v: { id: number; name: string }) => [v.id, v.name]));

function jsonFinancialMap(businessName: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of raw.financialRecords) {
    const unit = unitById.get(r.businessUnitId)!;
    if (businessNameById.get(unit.businessId) !== businessName) continue;
    const p = periodById.get(r.periodId)!;
    const li = liById.get(r.lineItemId)!;
    m.set(`${unit.name}|${p.periodType}|${p.startDate}|${li.name}|${li.valueType}`, r.value);
  }
  return m;
}

function parsedFinancialMap(pw: ParsedWorkbook): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of pw.financialRecords) {
    m.set(`${r.unitName}|${r.periodType}|${r.periodStart}|${r.lineItemName}|${r.valueType}`, r.value);
  }
  return m;
}

function diffMaps(name: string, expected: Map<string, number>, actual: Map<string, number>): number {
  let bad = 0;
  for (const [k, v] of expected) {
    if (!actual.has(k)) { if (bad++ < 12) console.error(`  [${name}] missing: ${k} = ${v}`); }
    else if (!Object.is(actual.get(k), v)) { if (bad++ < 12) console.error(`  [${name}] value: ${k} = ${actual.get(k)} (expected ${v})`); }
  }
  for (const k of actual.keys()) {
    if (!expected.has(k)) { if (bad++ < 12) console.error(`  [${name}] extra: ${k} = ${actual.get(k)}`); }
  }
  console.log(`  [${name}] expected ${expected.size}, parsed ${actual.size}, differences ${bad}`);
  return bad;
}

let total = 0;
for (const [businessName, file, parser] of SOURCES) {
  if (!fs.existsSync(file)) { console.log(`skipping ${businessName} (no ${file})`); continue; }
  const pw = parser(await loadWorkbook(file));
  console.log(`== ${businessName} - issues: ${pw.issues.filter(i => i.level === 'error').length} error(s), ${pw.issues.filter(i => i.level === 'warning').length} warning(s)`);
  for (const i of pw.issues.filter(i => i.level !== 'info').slice(0, 8)) console.log(`   ${i.level}: [${i.sheet}] ${i.message}`);

  total += diffMaps('financial', jsonFinancialMap(businessName), parsedFinancialMap(pw));

  if (businessName === 'Sienna') {
    const expSales = new Map<string, number>();
    for (const r of raw.salesRecords) {
      const p = periodById.get(r.periodId)!;
      expSales.set(`${p.startDate}|${r.categoryId == null ? '' : catById.get(r.categoryId)}|${chanById.get(r.channelId)}`, r.amount);
    }
    const actSales = new Map<string, number>();
    for (const r of pw.salesRecords) actSales.set(`${r.periodStart}|${r.categoryName ?? ''}|${r.channelName}`, r.amount);
    total += diffMaps('sales', expSales, actSales);

    const expCon = new Map<string, number>();
    for (const r of raw.consignmentRecords) {
      const p = periodById.get(r.periodId)!;
      expCon.set(`${p.startDate}|${vendorById.get(r.vendorId)}`, r.amount);
    }
    const actCon = new Map<string, number>();
    for (const r of pw.consignmentRecords) actCon.set(`${r.periodStart}|${r.vendorName}`, r.amount);
    total += diffMaps('consignment', expCon, actCon);
  }
}

// The HR Mastersheet has no extracted_data.json-style oracle (that file
// only covers the financial dataset) - spot-check instead of a full diff:
// expected row count, zero parse errors, and a couple of known values from
// the first row.
{
  const HR_FILE = path.join(ROOT, 'data-sources', 'HR Mastersheet for IT.xlsx');
  if (!fs.existsSync(HR_FILE)) {
    console.log(`skipping HR (no ${HR_FILE})`);
  } else {
    const pw = parseHr(await loadWorkbook(HR_FILE));
    const errors = pw.issues.filter((i) => i.level === 'error').length;
    const warnings = pw.issues.filter((i) => i.level === 'warning').length;
    console.log(`== HR - issues: ${errors} error(s), ${warnings} warning(s)`);
    let bad = 0;
    if (pw.employeeRecords.length !== 119) {
      console.error(`  [HR] expected 119 employee rows, got ${pw.employeeRecords.length}`);
      bad++;
    }
    if (errors > 0) {
      console.error(`  [HR] expected 0 parse errors, got ${errors}`);
      bad++;
    }
    const first = pw.employeeRecords.find((r) => r.fullName === 'Buddhadev Tapadar');
    if (!first || first.division !== 'Accounts' || first.aadharNumber !== '933655854041') {
      console.error(`  [HR] spot-check row (Buddhadev Tapadar) didn't match: ${JSON.stringify(first)}`);
      bad++;
    }
    console.log(`  [HR] ${bad === 0 ? 'spot-checks passed' : `${bad} spot-check failure(s)`}`);
    total += bad;
  }
}

// The FY Target Plan workbook has no extracted_data.json-style oracle either
// - spot-check instead: 12 months x 2 categories (store/fnb), zero parse
// errors, and April's known target split (from the earlier cross-checked
// analysis: store + fnb = the sheet's own stated 8,000,000 April target).
{
  const TARGET_FILE = path.join(ROOT, 'data-sources', 'HP_FY26_27_Target_Plan.xlsx');
  if (!fs.existsSync(TARGET_FILE)) {
    console.log(`skipping Target Plan (no ${TARGET_FILE})`);
  } else {
    const pw = parseTarget(await loadWorkbook(TARGET_FILE));
    const errors = pw.issues.filter((i) => i.level === 'error').length;
    const warnings = pw.issues.filter((i) => i.level === 'warning').length;
    console.log(`== Target Plan - issues: ${errors} error(s), ${warnings} warning(s)`);
    let bad = 0;
    if (pw.targetRecords.length !== 24) {
      console.error(`  [Target] expected 24 target rows (12 months x 2 categories), got ${pw.targetRecords.length}`);
      bad++;
    }
    if (errors > 0) {
      console.error(`  [Target] expected 0 parse errors, got ${errors}`);
      bad++;
    }
    const april = pw.targetRecords.filter((r) => r.periodStart === '2026-04-01');
    const aprilTotal = april.reduce((s, r) => s + r.amount, 0);
    if (Math.round(aprilTotal) !== 8000000) {
      console.error(`  [Target] April store+fnb target expected ~8,000,000, got ${aprilTotal}`);
      bad++;
    }
    console.log(`  [Target] ${bad === 0 ? 'spot-checks passed' : `${bad} spot-check failure(s)`}`);
    total += bad;
  }
}

// The Monthly F&B P&L workbook has no extracted_data.json-style oracle
// either - spot-check instead: 4 month sheets found so far (Apr-Jul 2026),
// zero parse errors, and April's known Total F&B Sales figure (cross-checked
// by hand against the sheet's own "Total" column and the Department Revenue
// summary sheet, which agree).
{
  const FNB_MONTHLY_FILE = path.join(ROOT, 'data-sources', 'Monthly F&B P&L (2026-27).xlsx');
  if (!fs.existsSync(FNB_MONTHLY_FILE)) {
    console.log(`skipping Monthly F&B P&L (no ${FNB_MONTHLY_FILE})`);
  } else {
    const pw = parseFnbMonthly(await loadWorkbook(FNB_MONTHLY_FILE));
    const errors = pw.issues.filter((i) => i.level === 'error').length;
    const warnings = pw.issues.filter((i) => i.level === 'warning').length;
    console.log(`== Monthly F&B P&L - issues: ${errors} error(s), ${warnings} warning(s)`);
    let bad = 0;
    if (pw.periods.length !== 4) {
      console.error(`  [FnbMonthly] expected 4 month sheets (Apr-Jul 2026), got ${pw.periods.length}`);
      bad++;
    }
    if (errors > 0) {
      console.error(`  [FnbMonthly] expected 0 parse errors, got ${errors}`);
      bad++;
    }
    const april = pw.financialRecords.find(
      (r) => r.periodStart === '2026-04-01' && r.lineItemName === 'Total F&B Sales Monthwise');
    if (!april || Math.round(april.value) !== 6718652) {
      console.error(`  [FnbMonthly] April Total F&B Sales expected 6,718,652, got ${april?.value}`);
      bad++;
    }
    console.log(`  [FnbMonthly] ${bad === 0 ? 'spot-checks passed' : `${bad} spot-check failure(s)`}`);
    total += bad;
  }
}

// The Weekly F&B P&L workbook has no extracted_data.json-style oracle
// either - spot-check instead: 19 week sheets found so far (01-Apr through
// 09-Aug 2026), zero parse errors, and the first week's known Total F&B
// Sales figure (cross-checked by hand against the sheet's own "Total"
// column).
{
  const FNB_WEEKLY_FILE = path.join(ROOT, 'data-sources', 'F&B Weekly P&L (2026-27).xlsx');
  if (!fs.existsSync(FNB_WEEKLY_FILE)) {
    console.log(`skipping Weekly F&B P&L (no ${FNB_WEEKLY_FILE})`);
  } else {
    const pw = parseFnbWeekly(await loadWorkbook(FNB_WEEKLY_FILE));
    const errors = pw.issues.filter((i) => i.level === 'error').length;
    const warnings = pw.issues.filter((i) => i.level === 'warning').length;
    console.log(`== Weekly F&B P&L - issues: ${errors} error(s), ${warnings} warning(s)`);
    for (const i of pw.issues) console.log(`    [${i.level}] ${i.sheet}: ${i.message}`);
    let bad = 0;
    if (pw.periods.length !== 19) {
      console.error(`  [FnbWeekly] expected 19 week sheets (01-Apr through 09-Aug 2026), got ${pw.periods.length}`);
      bad++;
    }
    if (errors > 0) {
      console.error(`  [FnbWeekly] expected 0 parse errors, got ${errors}`);
      bad++;
    }
    const week1 = pw.financialRecords.find(
      (r) => r.periodStart === '2026-04-01' && r.unitName === 'F&B' && r.lineItemName === 'Total F&B Sales');
    if (!week1 || Math.round(week1.value) !== 1747698) {
      console.error(`  [FnbWeekly] week of 01-04-2026 Total F&B Sales expected 1,747,698, got ${week1?.value}`);
      bad++;
    }
    console.log(`  [FnbWeekly] ${bad === 0 ? 'spot-checks passed' : `${bad} spot-check failure(s)`}`);
    total += bad;
  }
}

// The 2026-27 CEPL workbook has no extracted_data.json-style oracle either,
// and it's a newer, differently-shaped edition of the same recurring report
// (upper-case sheet names, no F&B/Overview sheets) - spot-check instead:
// detected as 'cepl', F&B/Overview absence downgraded to warnings (not
// errors), and April's known Store sales figure (cross-checked against the
// sheet's own "Retails Sales Report" row). The workbook has one genuine
// source data-entry gap (Trading Items row 31, a hand-typed January value
// with no row label) that should keep producing exactly one error - it's a
// real issue in the source, not something the parser should swallow.
{
  const CEPL_2627_FILE = path.join(ROOT, 'data-sources', 'P&L', 'CEPL Combined P&L 2026-27.xlsx');
  if (!fs.existsSync(CEPL_2627_FILE)) {
    console.log(`skipping CEPL 2026-27 (no ${CEPL_2627_FILE})`);
  } else {
    const wb = await loadWorkbook(CEPL_2627_FILE);
    const pw = parseCepl(wb);
    const errors = pw.issues.filter((i) => i.level === 'error').length;
    const warnings = pw.issues.filter((i) => i.level === 'warning').length;
    console.log(`== CEPL 2026-27 - issues: ${errors} error(s), ${warnings} warning(s)`);
    for (const i of pw.issues) console.log(`    [${i.level}] ${i.sheet}: ${i.message}`);
    let bad = 0;
    if (errors !== 1) {
      console.error(`  [CEPL 2026-27] expected 1 parse error (Trading Items row 31 unlabeled), got ${errors}`);
      bad++;
    }
    if (!pw.issues.some((i) => i.level === 'warning' && i.sheet === 'F&B')) {
      console.error('  [CEPL 2026-27] expected a warning for the missing F&B sheet');
      bad++;
    }
    const storeApril = pw.financialRecords.find(
      (r) => r.unitName === 'Store' && r.periodStart === '2026-04-01' && r.lineItemName === 'Retails Sales Report');
    if (!storeApril || storeApril.value !== 2273728) {
      console.error(`  [CEPL 2026-27] Store April sales expected 2,273,728, got ${storeApril?.value}`);
      bad++;
    }
    console.log(`  [CEPL 2026-27] ${bad === 0 ? 'spot-checks passed' : `${bad} spot-check failure(s)`}`);
    total += bad;
  }
}

// The four client Order Status workbooks have no extracted_data.json-style
// oracle either - spot-check instead: detected client, row count, zero
// parse errors, and one known value per file (Rannaghor's "Galaxy plate":
// bisqueQty 40, dispatchDate 2026-09-14, every other stage qty null).
{
  const ORDERS_FILES: [string, string, string][] = [
    ['Rannaghor', path.join(ROOT, 'data-sources', 'Orders', 'Rannaghor order Line sheet (1).xlsx'), 'Rannaghor'],
    ['Buco', path.join(ROOT, 'data-sources', 'Orders', 'Sienna X Buco order status.xlsx'), 'Sienna x Buco'],
    ['Dubai', path.join(ROOT, 'data-sources', 'Orders', 'Sienna X Dubai order status.xlsx'), 'Sienna x Dubai'],
    ['WOV', path.join(ROOT, 'data-sources', 'Orders', 'Sienna_X_WOV_Order_Status (1).xlsx'), 'Sienna x WOV'],
  ];
  // WOV: 27 raw rows minus 3 - four rows (WOV-08..11) share the same item
  // name/size with no colour column to distinguish them, so only the first
  // is kept (see parseOrders.ts's matchKey dedup) and the other three are
  // warned about instead of crashing the DB's unique index.
  const EXPECTED_ROWS: Record<string, number> = { Rannaghor: 19, Buco: 6, Dubai: 2, WOV: 24 };

  for (const [label, file, expectedClient] of ORDERS_FILES) {
    if (!fs.existsSync(file)) { console.log(`skipping Orders/${label} (no ${file})`); continue; }
    const pw = parseOrders(await loadWorkbook(file));
    const errors = pw.issues.filter((i) => i.level === 'error').length;
    const warnings = pw.issues.filter((i) => i.level === 'warning').length;
    console.log(`== Orders/${label} - issues: ${errors} error(s), ${warnings} warning(s)`);
    let bad = 0;
    if (pw.orderRecords.length !== EXPECTED_ROWS[label]) {
      console.error(`  [Orders/${label}] expected ${EXPECTED_ROWS[label]} order lines, got ${pw.orderRecords.length}`);
      bad++;
    }
    if (errors > 0) {
      console.error(`  [Orders/${label}] expected 0 parse errors, got ${errors}`);
      bad++;
    }
    if (pw.orderRecords[0]?.client !== expectedClient) {
      console.error(`  [Orders/${label}] expected client "${expectedClient}", got "${pw.orderRecords[0]?.client}"`);
      bad++;
    }
    if (label === 'Rannaghor') {
      const galaxy = pw.orderRecords.find((r) => r.itemName === 'Galaxy plate');
      if (!galaxy || galaxy.bisqueQty !== 40 || galaxy.dispatchDate !== '2026-09-14'
        || galaxy.greenQty != null || galaxy.glazeAppQty != null || galaxy.glazeFiringQty != null || galaxy.readyQty != null) {
        console.error(`  [Orders/Rannaghor] "Galaxy plate" spot-check didn't match: ${JSON.stringify(galaxy)}`);
        bad++;
      }
    }
    console.log(`  [Orders/${label}] ${bad === 0 ? 'spot-checks passed' : `${bad} spot-check failure(s)`}`);
    total += bad;
  }
}

if (total) { console.error(`PARSER CHECK FAILED - ${total} difference(s)`); process.exit(1); }
console.log('PARSER CHECK OK - parsers reproduce the verified extraction exactly');
process.exit(0);
