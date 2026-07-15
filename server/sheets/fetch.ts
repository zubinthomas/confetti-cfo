// Fetch a Google Sheet as an xlsx buffer, so the existing exceljs import
// pipeline (detect → parse → merge) works unchanged regardless of source.
// Two access methods:
//   link            - the sheet is shared "Anyone with the link can view";
//                     the public export endpoint needs no credentials.
//   service_account - private sheets shared with the service account's
//                     client_email; exported via the Drive API.
import { readFileSync } from 'fs';
import { JWT } from 'google-auth-library';

export const MAX_SHEET_BYTES = 25 * 1024 * 1024; // same cap as the multer upload
const FETCH_TIMEOUT_MS = 30_000;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type SheetAccessMethod = 'link' | 'service_account';

export class SheetAccessError extends Error {
  code: 'not_public' | 'no_service_account' | 'not_shared' | 'access_denied' | 'bad_response';
  constructor(code: SheetAccessError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

/** Pull the spreadsheet/file id out of a pasted URL (or accept a bare id).
 *  Handles docs.google.com/spreadsheets/d/… and drive.google.com/file/d/… */
export function extractSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  const m = trimmed.match(/(?:spreadsheets|file)(?:\/u\/\d+)?\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{25,}$/.test(trimmed)) return trimmed;
  return null;
}

// Test hook: SHEETS_EXPORT_BASE_URL reroutes both export endpoints to a local
// fixture server (which just needs to serve an .xlsx at the same paths).
const baseUrl = (real: string) => process.env.SHEETS_EXPORT_BASE_URL || real;

const linkExportUrl = (id: string) =>
  `${baseUrl('https://docs.google.com')}/spreadsheets/d/${id}/export?format=xlsx`;
const driveExportUrl = (id: string) =>
  `${baseUrl('https://www.googleapis.com')}/drive/v3/files/${id}/export?mimeType=${encodeURIComponent(XLSX_MIME)}&supportsAllDrives=true`;
const driveDownloadUrl = (id: string) =>
  `${baseUrl('https://www.googleapis.com')}/drive/v3/files/${id}?alt=media&supportsAllDrives=true`;
const driveMetadataUrl = (id: string) =>
  `${baseUrl('https://www.googleapis.com')}/drive/v3/files/${id}?fields=mimeType&supportsAllDrives=true`;
const driveListUrl = () => {
  const q = `(mimeType='application/vnd.google-apps.spreadsheet' or mimeType='${XLSX_MIME}') and trashed=false`;
  const params = new URLSearchParams({
    q,
    orderBy: 'modifiedTime desc',
    pageSize: '100',
    fields: 'files(id,name,mimeType,modifiedTime,webViewLink)',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    corpora: 'allDrives',
  });
  return `${baseUrl('https://www.googleapis.com')}/drive/v3/files?${params}`;
};

async function readBody(res: Response): Promise<Buffer> {
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > MAX_SHEET_BYTES) {
    throw new SheetAccessError('bad_response', `Sheet export exceeds the ${MAX_SHEET_BYTES / (1024 * 1024)} MB limit`);
  }
  return buf;
}

/** Public export endpoint. Private sheets answer with an HTML login page. */
export async function fetchViaLink(spreadsheetId: string): Promise<Buffer> {
  let res: Response;
  try {
    res = await fetch(linkExportUrl(spreadsheetId), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (err) {
    throw new SheetAccessError('bad_response', `Could not reach Google Sheets: ${err instanceof Error ? err.message : String(err)}`);
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (!res.ok || contentType.includes('text/html')) {
    throw new SheetAccessError('not_public', 'Sheet is not link-shared (Google returned a sign-in page)');
  }
  const buf = await readBody(res);
  if (buf.length === 0 || buf[0] === 0x3c /* '<' */) {
    throw new SheetAccessError('not_public', 'Sheet is not link-shared (Google returned a sign-in page)');
  }
  return buf;
}

// ── Service account ───────────────────────────────────────────────────────────

interface ServiceAccount { client: JWT; email: string }
let cachedSA: ServiceAccount | null | undefined; // undefined = not yet resolved

function loadServiceAccount(): ServiceAccount | null {
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  let raw = file ? readFileSync(file, 'utf-8') : process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  let creds: { client_email?: string; private_key?: string };
  try {
    creds = JSON.parse(raw);
  } catch {
    raw = Buffer.from(raw, 'base64').toString('utf-8');
    creds = JSON.parse(raw); // let a second failure propagate - misconfiguration
  }
  if (!creds.client_email || !creds.private_key) {
    throw new Error('Service account JSON is missing client_email/private_key');
  }
  const client = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return { client, email: creds.client_email };
}

export function getServiceAccount(): ServiceAccount | null {
  if (cachedSA === undefined) {
    try {
      cachedSA = loadServiceAccount();
    } catch (err) {
      console.error('sheets: invalid service account config:', err instanceof Error ? err.message : err);
      cachedSA = null;
    }
  }
  return cachedSA;
}

export function serviceAccountEmail(): string | null {
  return getServiceAccount()?.email ?? null;
}

function requireServiceAccount(): ServiceAccount {
  const sa = getServiceAccount();
  if (!sa) {
    throw new SheetAccessError('no_service_account',
      'No service account is configured (set GOOGLE_SERVICE_ACCOUNT_FILE or GOOGLE_SERVICE_ACCOUNT_JSON)');
  }
  return sa;
}

async function driveFetch(sa: ServiceAccount, url: string): Promise<Response> {
  const { token } = await sa.client.getAccessToken();
  try {
    return await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    throw new SheetAccessError('bad_response', `Could not reach the Drive API: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Fetch a spreadsheet the service account can read, as xlsx bytes.
 * Native Google Sheets are exported (files.export); plain .xlsx files stored
 * in Drive are downloaded as-is (alt=media).
 */
export async function fetchViaServiceAccount(spreadsheetId: string): Promise<Buffer> {
  const sa = requireServiceAccount();

  const metaRes = await driveFetch(sa, driveMetadataUrl(spreadsheetId));
  let isNativeSheet = true;
  if (metaRes.ok) {
    try {
      const meta = (await metaRes.json()) as { mimeType?: string };
      isNativeSheet = meta.mimeType === 'application/vnd.google-apps.spreadsheet';
    } catch { /* unexpected body - fall through to the export attempt */ }
  } else {
    metaRes.body?.cancel();
    // let the export call below produce the proper 403/404 error mapping
  }

  const res = await driveFetch(sa, isNativeSheet ? driveExportUrl(spreadsheetId) : driveDownloadUrl(spreadsheetId));
  if (res.status === 404) {
    throw new SheetAccessError('not_shared', `Sheet not found - make sure it is shared with ${sa.email}`);
  }
  if (res.status === 403) {
    // Google's message distinguishes "Drive API disabled on the project" from
    // "this file isn't shared with the service account" - pass it through.
    let detail: string | undefined;
    try {
      detail = ((await res.json()) as { error?: { message?: string } }).error?.message;
    } catch { /* non-JSON error body */ }
    throw new SheetAccessError('access_denied',
      detail ?? `Drive API access denied for ${sa.email} - check the sheet is shared with it and the Drive API is enabled`);
  }
  if (!res.ok) {
    throw new SheetAccessError('bad_response', `Drive export failed with HTTP ${res.status}`);
  }
  return readBody(res);
}

export interface DriveSpreadsheet {
  id: string;
  name: string;
  mimeType: string;       // native Google Sheet or xlsx blob
  modifiedTime: string;
  webViewLink: string;
}

/**
 * Every spreadsheet the service account can see (shared with it directly or
 * via a shared drive) - native Google Sheets and plain .xlsx files.
 */
export async function listAccessibleSpreadsheets(): Promise<DriveSpreadsheet[]> {
  const sa = requireServiceAccount();
  const res = await driveFetch(sa, driveListUrl());
  if (!res.ok) {
    let detail: string | undefined;
    try {
      detail = ((await res.json()) as { error?: { message?: string } }).error?.message;
    } catch { /* non-JSON error body */ }
    throw new SheetAccessError('access_denied',
      detail ?? `Drive file listing failed with HTTP ${res.status}`);
  }
  const json = (await res.json()) as { files?: DriveSpreadsheet[] };
  return json.files ?? [];
}

/** Fetch using a source's stored access method. */
export function fetchSheetXlsx(source: { spreadsheetId: string; accessMethod: SheetAccessMethod }): Promise<Buffer> {
  return source.accessMethod === 'link'
    ? fetchViaLink(source.spreadsheetId)
    : fetchViaServiceAccount(source.spreadsheetId);
}

/**
 * At add time: try the public link first, fall back to the service account.
 * Returns the method that worked plus the already-fetched buffer.
 */
export async function resolveAccessMethod(spreadsheetId: string):
  Promise<{ method: SheetAccessMethod; buffer: Buffer }> {
  try {
    return { method: 'link', buffer: await fetchViaLink(spreadsheetId) };
  } catch (err) {
    if (!(err instanceof SheetAccessError) || err.code !== 'not_public') throw err;
  }
  const sa = getServiceAccount();
  if (!sa) {
    throw new SheetAccessError('not_public',
      "Sheet is not link-shared. Share it as 'Anyone with the link can view', or configure a service account for private sheets");
  }
  try {
    return { method: 'service_account', buffer: await fetchViaServiceAccount(spreadsheetId) };
  } catch (err) {
    if (err instanceof SheetAccessError && (err.code === 'not_shared' || err.code === 'access_denied')) {
      throw new SheetAccessError(err.code,
        `Sheet is not link-shared and the service account cannot read it. Share it as 'Anyone with the link can view', or share it with ${sa.email}`);
    }
    throw err;
  }
}
