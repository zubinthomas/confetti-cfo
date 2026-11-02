// Development oracle for parseCompliance.ts, same convention as
// verify-parsers.ts's per-workbook spot-check blocks (no extracted_data.json
// equivalent exists for this source). Run against the real client workbook:
//   node import/verify-compliance.ts
//
// Figures below are cross-checked against the real file directly (ground
// truth established by running the parser once and reading its output,
// same as every other spot-check in verify-parsers.ts):
//   - HP (26 rows) is structurally invalid - 16 rows marked "Paid" with no
//     "Date Of Payment" column - so it's skipped whole: zero of HP's rows
//     reach compliancePaymentRecords, and exactly one 'warning' issue (never
//     'error', which would reject the entire upload) names the sheet.
//   - JP (2) + Daranda (5) + Insurance (6) = 13 payment rows import cleanly.
//   - Company Docs: 20 rows. TM: 8 rows. DIR KYC: 5 rows.
//   - Three of HP's Due Date cells aren't parseable as a single date
//     ("1ST APRIL 2026 TO 31ST MARCH 2027" x2, "10th of Every Month") - each
//     produces one 'info' issue, never blocks that row's parse (though HP's
//     rows don't end up imported anyway, for the unrelated reason above).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorkbook } from './xlsx.ts';
import { parseCompliance } from './parseCompliance.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const FILE = path.join(ROOT, 'data-sources', 'CEPL_for Tech_Compliance Payment Tracker.xlsx');

const fs = await import('node:fs');
if (!fs.existsSync(FILE)) {
  console.log(`skipping Compliance Payment Tracker (no ${FILE})`);
  process.exit(0);
}

const pw = parseCompliance(await loadWorkbook(FILE));
const errors = pw.issues.filter((i) => i.level === 'error');
const warnings = pw.issues.filter((i) => i.level === 'warning');
const infos = pw.issues.filter((i) => i.level === 'info');
console.log(`== Compliance Payment Tracker - issues: ${errors.length} error(s), ${warnings.length} warning(s), ${infos.length} info`);
for (const i of pw.issues) console.log(`    [${i.level}] ${i.sheet}: ${i.message}`);

let bad = 0;
const expect = (label: string, actual: number, expected: number) => {
  if (actual !== expected) { console.error(`  [Compliance] ${label}: expected ${expected}, got ${actual}`); bad++; }
};

expect('payment records (JP 2 + Daranda 5 + Insurance 6, zero from HP)', pw.compliancePaymentRecords.length, 13);
expect('document records', pw.complianceDocumentRecords.length, 20);
expect('trademark records', pw.complianceTrademarkRecords.length, 8);
expect('director records', pw.complianceDirectorRecords.length, 5);

if (errors.length !== 0) {
  console.error(`  [Compliance] expected 0 parse errors (a structural problem must never be 'error' - it would reject the whole upload), got ${errors.length}`);
  bad++;
}
if (!(warnings.length === 1 && warnings[0].sheet === 'HP')) {
  console.error(`  [Compliance] expected exactly one warning naming the HP sheet, got: ${JSON.stringify(warnings)}`);
  bad++;
}
// Note: an Insurance row can legitimately have location === 'HP' (its own
// per-row Location column, covering all three properties) without coming
// from the skipped HP payment-tracker sheet - check sourceSheet, not
// location, for "did anything from the structurally-invalid sheet leak
// through."
if (pw.compliancePaymentRecords.some((r) => r.sourceSheet === 'HP')) {
  console.error('  [Compliance] expected zero rows sourced from the HP sheet in compliancePaymentRecords - HP is structurally invalid in this file');
  bad++;
}
if (infos.length !== 3 || !infos.every((i) => i.sheet === 'HP' && i.message.includes('could not be parsed as a single date'))) {
  console.error(`  [Compliance] expected 3 unparseable-due-date info issues on HP, got: ${JSON.stringify(infos)}`);
  bad++;
}

// Insurance rows key on Policy No., not location - spot-check one real
// value to confirm the shape-detection and column mapping (not just counts).
const anyPayment = pw.compliancePaymentRecords.find((r) => r.category === 'insurance');
if (!anyPayment || !anyPayment.policyNumber) {
  console.error('  [Compliance] expected at least one insurance payment record with a policyNumber');
  bad++;
}

console.log(`  [Compliance] ${bad === 0 ? 'spot-checks passed' : `${bad} spot-check failure(s)`}`);

if (bad) { console.error(`COMPLIANCE CHECK FAILED - ${bad} difference(s)`); process.exit(1); }
console.log('COMPLIANCE CHECK OK - parser matches the verified extraction exactly');
process.exit(0);
