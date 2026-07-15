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

if (total) { console.error(`PARSER CHECK FAILED - ${total} difference(s)`); process.exit(1); }
console.log('PARSER CHECK OK - parsers reproduce the verified extraction exactly');
process.exit(0);
