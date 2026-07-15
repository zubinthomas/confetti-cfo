// Offline proof of the Google Sheets sync path — no Google account needed.
// A local HTTP fixture server stands in for the export endpoints (via
// SHEETS_EXPORT_BASE_URL), serving a real source workbook, an HTML "sign-in"
// page and a junk workbook. Verifies:
//   - extractSpreadsheetId handles the URL shapes users paste
//   - sync creates a preview batch, supersedes stale previews, records
//     no_changes after commit, and records errors on the source row
//   node sheets/verify-sheets.ts     (requires data-sources/)
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

// Point the db client at a throwaway PGlite dir BEFORE importing it.
process.env.PGLITE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sheets-verify-pg-'));
delete process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

const { extractSpreadsheetId, resolveAccessMethod, SheetAccessError } = await import('./fetch.ts');
const { syncSource } = await import('./sync.ts');
const { commitMergePlan, buildMergePlan } = await import('../import/merge.ts');
const { db, ready, schema } = await import('../db/client.ts');
const { eq } = await import('drizzle-orm');

let bad = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'ok   ' : 'FAIL '} ${what}`);
  if (!ok) bad++;
};

// ── 1. spreadsheet id extraction ─────────────────────────────────────────────
const ID = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
for (const [input, expected] of [
  [`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`, ID],
  [`https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`, ID],
  [`https://docs.google.com/spreadsheets/u/0/d/${ID}/htmlview`, ID],
  [`https://docs.google.com/spreadsheets/d/${ID}/export?format=xlsx`, ID],
  [`  ${ID}  `, ID],                       // bare id, whitespace
  ['https://docs.google.com/document/d/abc123/edit', null],
  ['not a url at all', null],
] as const) {
  check(extractSpreadsheetId(input) === expected, `extractSpreadsheetId(${JSON.stringify(input.trim().slice(0, 60))})`);
}

// ── 2. fixture server standing in for the export endpoints ──────────────────
const SOURCE_XLSX = path.join(ROOT, 'data-sources', 'Store sales', 'Sienna Store Sales Analysis FINAL.xlsx');
// the cafe workbook parses with zero warnings — used to test auto-commit
const CLEAN_XLSX = path.join(ROOT, 'data-sources', 'P&L', 'Cafe Weekly P&L - 2025 -2026.xlsx');
if (!fs.existsSync(SOURCE_XLSX) || !fs.existsSync(CLEAN_XLSX)) {
  console.log(`SKIPPED — source workbooks not present in data-sources/`);
  process.exit(bad ? 1 : 0);
}
const workbookXlsx = fs.readFileSync(SOURCE_XLSX);
const cleanXlsx = fs.readFileSync(CLEAN_XLSX);

const junkWb = new ExcelJS.Workbook();
junkWb.addWorksheet('Nothing Recognisable').getCell('A1').value = 'hello';
const junkXlsx = Buffer.from(await junkWb.xlsx.writeBuffer());

const fixtures = http.createServer((req, res) => {
  const url = req.url ?? '';
  if (url.includes('/d/goodsheet') || url.includes('/files/goodsheet')) {
    res.writeHead(200, { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    res.end(workbookXlsx);
  } else if (url.includes('/d/cleansheet')) {
    res.writeHead(200, { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    res.end(cleanXlsx);
  } else if (url.includes('/d/junksheet')) {
    res.writeHead(200, { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    res.end(junkXlsx);
  } else {
    // Google answers private/unknown sheets with an HTML sign-in page
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html><body>Sign in</body></html>');
  }
});
await new Promise<void>((r) => fixtures.listen(0, r));
const port = (fixtures.address() as { port: number }).port;
process.env.SHEETS_EXPORT_BASE_URL = `http://127.0.0.1:${port}`;

await ready();

const mkSource = async (spreadsheetId: string, label: string, syncMode: 'auto' | 'manual' | 'paused' = 'manual') => {
  const [s] = await db.insert(schema.sheetSources).values({
    label, spreadsheetId, sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    accessMethod: 'link', syncMode, createdAt: new Date().toISOString(),
  }).returning();
  return s;
};

// ── 3. sync lifecycle ────────────────────────────────────────────────────────
const good = await mkSource('goodsheet', 'Sienna (fixture)');

const first = await syncSource(good);
check(first.status === 'preview_created' && first.batch != null, 'first sync creates a preview batch');
check(first.source.lastSyncStatus === 'preview_created', 'source records preview_created');

// second sync before commit: supersedes the stale preview, creates a fresh one
const second = await syncSource(first.source);
const firstAgain = first.batch
  ? (await db.select().from(schema.importBatches).where(eq(schema.importBatches.id, first.batch.id)))[0]
  : undefined;
check(second.status === 'preview_created' && second.batch?.id !== first.batch?.id, 're-sync creates a fresh preview');
check(firstAgain?.status === 'discarded', 're-sync discards the superseded preview');

// auto mode must NOT commit while the parse has warnings (sienna has 7):
// run before the sienna data is committed below, so real changes are pending
const autoWarn = await mkSource('goodsheetB', 'Sienna (auto, warns)', 'auto');
const autoWarnResult = await syncSource(autoWarn);
check(autoWarnResult.status === 'preview_created' && autoWarnResult.batch?.status === 'preview',
  'auto mode with warnings stays a preview');

// commit, then a third sync must be a clean no-op with no new batch
await commitMergePlan(await buildMergePlan(second.batch!.payload as never));
await db.update(schema.importBatches).set({ status: 'committed' }).where(eq(schema.importBatches.id, second.batch!.id));
const third = await syncSource(second.source);
check(third.status === 'no_changes' && third.batch == null, 'post-commit sync records no_changes, no batch');

// ── auto mode ────────────────────────────────────────────────────────────────
// clean parse (no warnings/errors) → committed without human intervention
const auto = await mkSource('cleansheet', 'Cafe (auto)', 'auto');
const autoResult = await syncSource(auto);
check(autoResult.status === 'auto_committed' && autoResult.batch?.status === 'committed',
  'auto mode commits a clean sync');
check(autoResult.source.lastSyncStatus === 'auto_committed', 'source records auto_committed');
const afterAuto = await syncSource(autoResult.source);
check(afterAuto.status === 'no_changes', 'auto-committed data re-syncs as no_changes');

// unrecognised workbook shape → error on the source, no batch
const junk = await mkSource('junksheet', 'Junk (fixture)');
const junkResult = await syncSource(junk);
check(junkResult.status === 'error' && /Unrecognised workbook/.test(junkResult.source.lastSyncError ?? ''),
  'unrecognised workbook recorded as source error');

// private sheet (HTML sign-in answer) → not_public error, and resolveAccessMethod
// explains what to do since no service account is configured
const priv = await mkSource('privatesheet', 'Private (fixture)');
const privResult = await syncSource(priv);
check(privResult.status === 'error' && /not link-shared/.test(privResult.source.lastSyncError ?? ''),
  'private sheet recorded as source error');
let resolveErr: unknown = null;
try { await resolveAccessMethod('privatesheet'); } catch (e) { resolveErr = e; }
check(resolveErr instanceof SheetAccessError && /configure a service account/.test(resolveErr.message),
  'resolveAccessMethod explains link-sharing + service account');
const resolved = await resolveAccessMethod('goodsheet');
check(resolved.method === 'link' && resolved.buffer.length > 0, 'resolveAccessMethod picks link for public sheets');

// ── done ─────────────────────────────────────────────────────────────────────
fixtures.close();
fs.rmSync(process.env.PGLITE_DATA_DIR!, { recursive: true, force: true });
if (bad) { console.error(`SHEETS SYNC VERIFY FAILED — ${bad} problem(s)`); process.exit(1); }
console.log('SHEETS SYNC OK — id extraction, preview/supersede/no-change lifecycle and error paths all behave');
process.exit(0);
