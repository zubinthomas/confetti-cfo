// Full-pipeline equivalence proof: import the three source workbooks through
// the parser + merge pipeline into a SCRATCH database, then compare the
// resulting dataset content (by natural key) against the verified extraction
// in src/data/extracted_data.json. Also proves idempotence: a second import
// pass must produce zero creates and zero updates.
//   node import/verify-import.ts     (requires data-sources/)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

// Point the db client at a throwaway PGlite dir BEFORE importing it.
process.env.PGLITE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'import-verify-pg-'));

const { loadWorkbook } = await import('./xlsx.ts');
const { parseCepl } = await import('./parseCepl.ts');
const { parseCafe } = await import('./parseCafe.ts');
const { parseSienna } = await import('./parseSienna.ts');
const { buildMergePlan, commitMergePlan } = await import('./merge.ts');
const { loadDataset } = await import('../db/dataset.ts');
const { ready } = await import('../db/client.ts');

const SOURCES = [
  [path.join(ROOT, 'data-sources', 'P&L', 'CEPL P & L_2025-26.xlsx'), parseCepl],
  [path.join(ROOT, 'data-sources', 'P&L', 'Cafe Weekly P&L - 2025 -2026.xlsx'), parseCafe],
  [path.join(ROOT, 'data-sources', 'Store sales', 'Sienna Store Sales Analysis FINAL.xlsx'), parseSienna],
] as const;

for (const [file] of SOURCES) {
  if (!fs.existsSync(file)) {
    console.log(`SKIPPED — ${file} not present`);
    process.exit(0);
  }
}

await ready();

// ── pass 1: import everything into the empty scratch db ─────────────────────
for (const [file, parser] of SOURCES) {
  const parsed = parser(await loadWorkbook(file));
  const errors = parsed.issues.filter((i) => i.level === 'error');
  if (errors.length) {
    console.error(`PARSE ERRORS in ${path.basename(file)}:`, errors);
    process.exit(1);
  }
  const plan = await buildMergePlan(parsed);
  await commitMergePlan(plan);
}

// ── compare content by natural key against the verified extraction ──────────
type Row = Record<string, unknown>;
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'extracted_data.json'), 'utf-8'));
const dbData = await loadDataset();

function naturalMaps(d: { businesses: Row[]; businessUnits: Row[]; periods: Row[]; lineItems: Row[];
  financialRecords: Row[]; categories: Row[]; channels: Row[]; salesRecords: Row[];
  vendors: Row[]; consignmentRecords: Row[] }) {
  const unit = new Map(d.businessUnits.map((u) => [u.id, u.name]));
  const period = new Map(d.periods.map((p) => [p.id, `${p.periodType}|${p.startDate}`]));
  const li = new Map(d.lineItems.map((l) => [l.id, `${l.name}|${l.valueType}`]));
  const cat = new Map(d.categories.map((c) => [c.id, c.name]));
  const chan = new Map(d.channels.map((c) => [c.id, c.name]));
  const vendor = new Map(d.vendors.map((v) => [v.id, v.name]));
  return {
    financial: new Map(d.financialRecords.map((r) => [
      `${unit.get(r.businessUnitId)}|${period.get(r.periodId)}|${li.get(r.lineItemId)}`, r.value as number])),
    sales: new Map(d.salesRecords.map((r) => [
      `${period.get(r.periodId)}|${r.categoryId == null ? '' : cat.get(r.categoryId as number)}|${chan.get(r.channelId)}`, r.amount as number])),
    consignment: new Map(d.consignmentRecords.map((r) => [
      `${period.get(r.periodId)}|${vendor.get(r.vendorId)}`, r.amount as number])),
  };
}

const expected = naturalMaps(raw);
const actual = naturalMaps(dbData as never);

let bad = 0;
for (const table of ['financial', 'sales', 'consignment'] as const) {
  const exp = expected[table], act = actual[table];
  for (const [k, v] of exp) {
    if (!act.has(k)) { if (bad++ < 10) console.error(`[${table}] missing: ${k} = ${v}`); }
    else if (!Object.is(act.get(k), v)) { if (bad++ < 10) console.error(`[${table}] value: ${k} = ${act.get(k)} (expected ${v})`); }
  }
  for (const k of act.keys()) if (!exp.has(k)) { if (bad++ < 10) console.error(`[${table}] extra: ${k}`); }
  console.log(`[${table}] expected ${exp.size}, imported ${act.size}`);
}

// ── pass 2: idempotence — re-import must change nothing ─────────────────────
for (const [file, parser] of SOURCES) {
  const plan = await buildMergePlan(parser(await loadWorkbook(file)));
  for (const [table, s] of Object.entries(plan.stats)) {
    if (s.creates || s.updates) {
      bad++;
      console.error(`[idempotence] ${path.basename(file)} → ${table}: ${s.creates} creates, ${s.updates} updates on re-import`);
    }
  }
}

fs.rmSync(process.env.PGLITE_DATA_DIR!, { recursive: true, force: true });

if (bad) { console.error(`IMPORT EQUIVALENCE FAILED — ${bad} problem(s)`); process.exit(1); }
console.log('IMPORT EQUIVALENCE OK — the importer reproduces the verified extraction and re-imports are no-ops');
process.exit(0);
