// Development spot-check for parseProduction.ts / parseRoster.ts. Unlike
// verify-parsers.ts, these two sources have no extracted_data.json-style
// oracle to diff against - this asserts zero parse errors, expected row
// counts, and a handful of hand-verified values instead.
//   node import/verify-production-roster.ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorkbook } from './xlsx.ts';
import { parseProduction } from './parseProduction.ts';
import { parseRoster } from './parseRoster.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

let total = 0;

{
  const FILE = path.join(ROOT, 'data-sources', 'Daily Report.xlsx');
  const pw = parseProduction(await loadWorkbook(FILE));
  const errors = pw.issues.filter((i) => i.level === 'error').length;
  const warnings = pw.issues.filter((i) => i.level === 'warning').length;
  console.log(`== Daily Report - issues: ${errors} error(s), ${warnings} warning(s)`);
  for (const i of pw.issues) console.log(`    [${i.level}] ${i.sheet}: ${i.message}`);

  let bad = 0;
  if (errors > 0) {
    console.error(`  [Production] expected 0 parse errors, got ${errors}`);
    bad++;
  }
  const byStage = new Map<string, number>();
  for (const r of pw.productionLogRecords) byStage.set(r.stage, (byStage.get(r.stage) ?? 0) + 1);
  const expected: Record<string, number> = { throwing: 244, finishing: 157, glazing: 113, firing: 265 };
  for (const [stage, count] of Object.entries(expected)) {
    if (byStage.get(stage) !== count) {
      console.error(`  [Production] expected ${count} ${stage} records, got ${byStage.get(stage) ?? 0}`);
      bad++;
    }
  }
  if (pw.productionLogRecords.length !== 779) {
    console.error(`  [Production] expected 779 total records, got ${pw.productionLogRecords.length}`);
    bad++;
  }
  // Kiln Firing row 22: qty cell is the non-numeric "4 pcs" - parseQty
  // recovers the leading number (4) while keeping qtyRaw as the original
  // text, so nothing is silently dropped.
  const row22 = pw.productionLogRecords.find((r) => r.sourceSheet === 'Kiln Firing ' && r.sourceRow === 22);
  if (!row22 || row22.qty !== 4 || row22.qtyRaw !== '4 pcs') {
    console.error(`  [Production] Kiln Firing row 22 expected qty=4 qtyRaw="4 pcs", got ${JSON.stringify(row22 && { qty: row22.qty, qtyRaw: row22.qtyRaw })}`);
    bad++;
  }
  // A numeric-encoded date (typed without separators, e.g. "21.082026")
  // should still decode via dmy()'s fallback, not come through null.
  const numericDateRows = pw.productionLogRecords.filter((r) => r.date === '2026-08-21' || r.date === '2026-08-25');
  if (numericDateRows.length === 0) {
    console.error('  [Production] expected at least one record with a numeric-encoded date (21.082026/25.082026) to decode correctly');
    bad++;
  }
  console.log(`  [Production] ${bad === 0 ? 'spot-checks passed' : `${bad} spot-check failure(s)`}`);
  total += bad;
}

{
  const FILE = path.join(ROOT, 'data-sources', 'Daronda_7day_Roster.xlsx');
  const pw = parseRoster(await loadWorkbook(FILE));
  const errors = pw.issues.filter((i) => i.level === 'error').length;
  const warnings = pw.issues.filter((i) => i.level === 'warning').length;
  console.log(`== Daronda_7day_Roster - issues: ${errors} error(s), ${warnings} warning(s)`);
  for (const i of pw.issues) console.log(`    [${i.level}] ${i.sheet}: ${i.message}`);

  let bad = 0;
  if (errors > 0) {
    console.error(`  [Roster] expected 0 parse errors, got ${errors}`);
    bad++;
  }
  if (pw.shiftRosterRecords.length !== 1036) {
    console.error(`  [Roster] expected 1036 total records (37 employees x 4 weeks x 7 days), got ${pw.shiftRosterRecords.length}`);
    bad++;
  }
  const weekStarts = new Set(pw.shiftRosterRecords.map((r) => r.weekStart));
  const expectedWeeks = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'];
  for (const w of expectedWeeks) {
    if (!weekStarts.has(w)) {
      console.error(`  [Roster] expected week starting ${w}, not found`);
      bad++;
    }
  }
  if (weekStarts.size !== 4) {
    console.error(`  [Roster] expected exactly 4 distinct week-blocks, got ${weekStarts.size}`);
    bad++;
  }
  // Every employee row is fully populated (no forward-fill), so every date
  // within a week should carry the same headcount.
  const namesInWeek1 = new Set(pw.shiftRosterRecords.filter((r) => r.weekStart === '2026-09-07').map((r) => r.employeeName));
  if (namesInWeek1.size !== 37) {
    console.error(`  [Roster] expected 37 distinct employees in the first week, got ${namesInWeek1.size}`);
    bad++;
  }
  // "Security" department is real data, not in hrDivisions.ts's DIVISIONS -
  // should surface as a warning, never dropped.
  const securityWarning = pw.issues.some((i) => i.level === 'warning' && i.message.includes('Security'));
  if (!securityWarning) {
    console.error('  [Roster] expected a warning for the unrecognised "Security" department, none found');
    bad++;
  }
  // Coverage Summary / Operating Notes should be seen and explicitly skipped
  // (info-level), not silently ignored.
  const infoSkips = pw.issues.filter((i) => i.level === 'info').length;
  if (infoSkips < 1) {
    console.error('  [Roster] expected at least one info-level issue noting a skipped sheet');
    bad++;
  }
  console.log(`  [Roster] ${bad === 0 ? 'spot-checks passed' : `${bad} spot-check failure(s)`}`);
  total += bad;
}

if (total) { console.error(`PARSER CHECK FAILED - ${total} difference(s)`); process.exit(1); }
console.log('PARSER CHECK OK - production/roster parsers match hand-verified expectations');
process.exit(0);
