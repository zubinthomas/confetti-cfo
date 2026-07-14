// Live diagnostic for the service-account path (needs real credentials in
// .env): proves the key loads, a Drive token can be minted, lists everything
// the service account can see, and fetches + shape-detects one spreadsheet.
//   node sheets/sa-live-test.ts [spreadsheet-id-or-url]
import 'dotenv/config';
import {
  extractSpreadsheetId, serviceAccountEmail, fetchViaServiceAccount, listAccessibleSpreadsheets,
} from './fetch.ts';
import { loadWorkbook } from '../import/xlsx.ts';
import { detectKind } from '../import/detect.ts';

const email = serviceAccountEmail();
console.log('service account:', email ?? 'NOT CONFIGURED');
if (!email) process.exit(1);

const files = await listAccessibleSpreadsheets();
console.log(`accessible spreadsheets: ${files.length}`);
for (const f of files) console.log(` - ${f.name} [${f.mimeType}] ${f.id}`);

// default: Google's public Sheets-API sample sheet (readable by any authed principal)
const arg = process.argv[2] ?? '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
const id = extractSpreadsheetId(arg);
if (!id) { console.error('could not extract a spreadsheet id from:', arg); process.exit(1); }

try {
  const buf = await fetchViaServiceAccount(id);
  console.log(`export ok — ${buf.length} bytes, xlsx magic: ${buf.subarray(0, 2).toString() === 'PK'}`);
  const wb = await loadWorkbook(buf);
  console.log('worksheets:', wb.worksheets.map((w) => w.name).join(', '));
  console.log('detected workbook kind:', detectKind(wb) ?? '(not one of the three known shapes)');
} catch (err) {
  console.error('FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
}
