// Parser for the client's "Compliance Payment Tracker" workbook
// (CEPL_for Tech_Compliance Payment Tracker.xlsx, data-sources/) - a
// hand-maintained Excel file tracking licence/tax payments and insurance
// premiums across three properties (HP = Hindustan Park, JP = JP Office,
// Daranda), plus trademark applications, statutory company documents, and
// a director KYC register. One `kind: 'compliance'` batch covers all of
// it, same precedent as the generic financial importer touching multiple
// tables under one kind - the workbook is one file the client maintains as
// a unit.
//
// Sheets are detected by header shape, not sheet name (same technique as
// parseOrders.ts's resolveColumns) - robust to the client reordering or
// renaming tabs. Confirmed against the real file before writing this:
//   - HP/JP/Daranda share near-identical columns (Licenses/Taxes, Other
//     Details, Due Date, Amount, Payment Status) but differ in which date
//     column(s) they have: HP has only an ambiguous "Date of Payment
//     Scheduled" (no real actual-payment-date column at all); JP/Daranda
//     each have a real "Date Of Payment" column. Insurance shares the same
//     payment-tracker shape (Policy Name standing in for Licenses/Taxes,
//     Policy No. as a clean natural key, Location as its own column) but
//     has no Payment Status column at all - purely forward-looking renewal
//     reminders.
//   - Per the client's explicit decision: the actual payment date must
//     come from an explicit "Date Of Payment" column, never inferred from
//     "Date of Payment Scheduled". A sheet with Paid-status rows and no
//     such column is a structural problem for THAT SHEET - skipped
//     entirely (zero rows imported from it) with one warning issue, never
//     blocking the rest of the batch (server/routes/import.ts's
//     hasErrors() only rejects the whole upload on a 'error'-level issue,
//     so this must stay 'warning'). As the real file stands today, this
//     skips HP's 16+ "Paid" rows.
//   - `Sl No.` is unreliable (merged Excel cells leave it blank on rows
//     that share a serial number with the row above) - never used as a key.
//   - `Amount` is a float in HP, a numeric-looking string in JP/Daranda -
//     looseNum() below handles both.
//   - A few Due Date / "Date of Payment Scheduled" cells aren't parseable
//     as a single date at all (a quarter/annual-period label, a recurring
//     monthly cadence description) - looseDate() preserves the raw text
//     and the row still imports, flagged with an 'info' issue, never
//     blocked.
//   - The TM sheet's application 3160344 also appears in Company Docs
//     ("Registration of Trade Mark") - an intentional cross-reference by
//     the sheet's maintainer (a live filing-status pipeline vs. a
//     permanent document register), not a bug to deduplicate away. The two
//     sheets are parsed completely independently.
import type ExcelJS from 'exceljs';
import { str, num, dateVal, iso } from './xlsx.ts';
import type {
  Issue, ParsedWorkbook,
  ParsedCompliancePaymentRecord, ParsedComplianceDocumentRecord,
  ParsedComplianceTrademarkRecord, ParsedComplianceDirectorRecord,
} from './types.ts';

const MAX_HEADER_SCAN_ROW = 3;
const MAX_HEADER_SCAN_COL = 15;

// Cells that mean "intentionally not applicable", not "a date parse
// failure worth flagging" - Company Docs uses "N/A" freely for rows with
// no real issue/filing/expiry date.
const BLANK_DATE_MARKERS = new Set(['n/a', 'na', '-']);

const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

/** Real Excel date cells go through dateVal/iso directly (every source
 *  sheet mostly uses these). A handful of cells are typed as free text in
 *  non-standard formats ("02-Sept-2026") - matched against a loose
 *  day-month(name)-year pattern. Anything else (a date range, "10th of
 *  Every Month", "by End of the Month any day") can't be parsed as a
 *  single date at all and is kept as raw text only. */
function looseDate(v: ExcelJS.CellValue): { raw: string | null; date: string | null } {
  const d = dateVal(v);
  if (d) return { raw: iso(d), date: iso(d) };
  const s = str(v);
  if (!s) return { raw: null, date: null };
  const m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s.-]+([A-Za-z]+)[\s.-]+(\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = MONTH_MAP[m[2].toLowerCase()];
    const year = Number(m[3]);
    if (month && day >= 1 && day <= 31) {
      return { raw: s, date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
    }
  }
  return { raw: s, date: null };
}

/** HP stores Amount as a float, JP/Daranda as a numeric-looking string
 *  ("2800") - num() alone only handles the former. */
function looseNum(v: ExcelJS.CellValue): number | null {
  const n = num(v);
  if (n != null) return n;
  const s = str(v);
  if (s && /^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return null;
}

/** A numeric-looking id cell (TM Application No., Document No.) rendered
 *  without a trailing ".0" - exceljs/openpyxl both surface these as floats
 *  when Excel stored them as plain numbers. */
function idText(v: ExcelJS.CellValue): string | null {
  const n = num(v);
  if (n != null && Number.isInteger(n)) return String(n);
  return str(v);
}

function headerTexts(ws: ExcelJS.Worksheet, row: number): (string | null)[] {
  const out: (string | null)[] = [null]; // 1-indexed, out[0] unused
  const rowObj = ws.getRow(row);
  for (let c = 1; c <= MAX_HEADER_SCAN_COL; c++) out.push(str(rowObj.getCell(c).value));
  return out;
}

function findCol(texts: (string | null)[], re: RegExp): number | null {
  for (let c = 1; c < texts.length; c++) {
    if (texts[c] && re.test(texts[c] as string)) return c;
  }
  return null;
}

// ── Column shapes per sheet kind ─────────────────────────────────────────────

interface PaymentColumns {
  itemName: number;
  detail: number | null;        // "Other Details" - licence_tax sheets only
  policyNumber: number | null;  // "Policy No." - insurance sheets only
  locationCol: number | null;   // "Location" column - insurance only (licence_tax sheets use the sheet's own name)
  dueDate: number;
  amount: number;
  paymentStatus: number | null;
  actualPaymentDate: number | null; // "Date Of Payment" - exact match only, never "...Scheduled"
  scheduledDate: number | null;     // "Date of Payment Scheduled" / next renewal reminder
  remarks: number | null;
}
interface PaymentSheetMatch {
  sheet: ExcelJS.Worksheet;
  headerRow: number;
  category: 'licence_tax' | 'insurance';
  columns: PaymentColumns;
}

interface TrademarkColumns {
  applicationNo: number;
  niceClass: number | null;
  dateOfApplication: number | null;
  markName: number | null;
  tmType: number | null;
  status: number | null;
  remarks: number | null;
}
interface DocumentColumns {
  documentName: number;
  documentType: number | null;
  documentNumber: number | null;
  issueDate: number | null;
  filingDate: number | null;
  expiryDate: number | null;
  status: number | null;
  remarks: number | null;
}
interface DirectorColumns {
  din: number;
  name: number | null;
  designation: number | null;
  dateOfAppointment: number | null;
  aadhaar: number | null;
  pan: number | null;
  email: number | null;
  contact: number | null;
}

export interface ComplianceSheets {
  paymentSheets: PaymentSheetMatch[];
  trademarkSheets: { sheet: ExcelJS.Worksheet; headerRow: number; columns: TrademarkColumns }[];
  documentSheets: { sheet: ExcelJS.Worksheet; headerRow: number; columns: DocumentColumns }[];
  directorSheets: { sheet: ExcelJS.Worksheet; headerRow: number; columns: DirectorColumns }[];
}

/** Classifies one header row by its most specific anchor columns, checked
 *  in an order chosen so none of the five shapes can coincidentally match
 *  another's header (each anchor pair/triple below is unique to its shape
 *  in the real workbook). A sheet matching none of these is ignored, not
 *  an error - e.g. a client-added cover/notes sheet. */
function classify(texts: (string | null)[]):
  | { shape: 'directors'; columns: DirectorColumns }
  | { shape: 'trademark'; columns: TrademarkColumns }
  | { shape: 'insurance' | 'paymentSheet'; columns: PaymentColumns; category: 'licence_tax' | 'insurance' }
  | { shape: 'documents'; columns: DocumentColumns }
  | null {
  const din = findCol(texts, /^din\s*no\.?$/i);
  const aadhaar = findCol(texts, /aadhaar/i);
  if (din != null && aadhaar != null) {
    return {
      shape: 'directors',
      columns: {
        din, name: findCol(texts, /^name$/i), designation: findCol(texts, /^designation$/i),
        dateOfAppointment: findCol(texts, /^date of appointment$/i), aadhaar,
        pan: findCol(texts, /^pan card$/i), email: findCol(texts, /email/i), contact: findCol(texts, /contact/i),
      },
    };
  }

  const tmAppNo = findCol(texts, /^tm\s*application\s*no\.?$/i);
  if (tmAppNo != null) {
    return {
      shape: 'trademark',
      columns: {
        applicationNo: tmAppNo, niceClass: findCol(texts, /^class$/i),
        dateOfApplication: findCol(texts, /^date of application$/i),
        markName: findCol(texts, /^tm applied for$/i), tmType: findCol(texts, /^tm type$/i),
        status: findCol(texts, /^status$/i), remarks: findCol(texts, /^remarks$/i),
      },
    };
  }

  const policyName = findCol(texts, /^policy name$/i);
  const policyNo = findCol(texts, /^policy no\.?$/i);
  if (policyName != null && policyNo != null) {
    return {
      shape: 'insurance', category: 'insurance',
      columns: {
        itemName: policyName, detail: null, policyNumber: policyNo, locationCol: findCol(texts, /^location$/i),
        dueDate: findCol(texts, /^due date$/i) ?? -1, amount: findCol(texts, /^amount$/i) ?? -1,
        paymentStatus: findCol(texts, /^payment status$/i),
        actualPaymentDate: findCol(texts, /^date\s*of\s*payment$/i),
        scheduledDate: findCol(texts, /scheduled/i), remarks: findCol(texts, /^remarks$/i),
      },
    };
  }

  const docName = findCol(texts, /^document name$/i);
  const docType = findCol(texts, /^document type$/i);
  if (docName != null && docType != null) {
    return {
      shape: 'documents',
      columns: {
        documentName: docName, documentType: docType, documentNumber: findCol(texts, /^document no\.?$/i),
        issueDate: findCol(texts, /^issue date$/i), filingDate: findCol(texts, /^filing date$/i),
        expiryDate: findCol(texts, /^expiry date$/i), status: findCol(texts, /^status$/i),
        remarks: findCol(texts, /^remarks$/i),
      },
    };
  }

  const licensesTaxes = findCol(texts, /^licen[cs]es?\s*\/\s*taxes?$/i);
  const dueDate = findCol(texts, /^due date$/i);
  const amount = findCol(texts, /^amount$/i);
  if (licensesTaxes != null && dueDate != null && amount != null) {
    return {
      shape: 'paymentSheet', category: 'licence_tax',
      columns: {
        itemName: licensesTaxes, detail: findCol(texts, /^other details$/i), policyNumber: null, locationCol: null,
        dueDate, amount, paymentStatus: findCol(texts, /^payment status$/i),
        actualPaymentDate: findCol(texts, /^date\s*of\s*payment$/i),
        scheduledDate: findCol(texts, /scheduled/i), remarks: findCol(texts, /^remarks$/i),
      },
    };
  }

  return null;
}

export function findComplianceSheets(wb: ExcelJS.Workbook): ComplianceSheets {
  const out: ComplianceSheets = { paymentSheets: [], trademarkSheets: [], documentSheets: [], directorSheets: [] };
  for (const ws of wb.worksheets) {
    for (let r = 1; r <= Math.min(MAX_HEADER_SCAN_ROW, ws.rowCount); r++) {
      const texts = headerTexts(ws, r);
      const match = classify(texts);
      if (!match) continue;
      if (match.shape === 'directors') out.directorSheets.push({ sheet: ws, headerRow: r, columns: match.columns });
      else if (match.shape === 'trademark') out.trademarkSheets.push({ sheet: ws, headerRow: r, columns: match.columns });
      else if (match.shape === 'documents') out.documentSheets.push({ sheet: ws, headerRow: r, columns: match.columns });
      else out.paymentSheets.push({ sheet: ws, headerRow: r, category: match.category, columns: match.columns });
      break; // found this sheet's header row, stop scanning it
    }
  }
  return out;
}

const norm = (s: string | null) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Weakest natural key in this design for category='licence_tax' rows - no
 *  stable per-line id exists in the source. Insurance rows use
 *  policyNumber instead (a clean insurer-assigned identifier). Exported so
 *  parse-time dedup below and mergeCompliance.ts compute it identically. */
export function compliancePaymentMatchKey(
  r: Pick<ParsedCompliancePaymentRecord, 'category' | 'location' | 'itemName' | 'detail' | 'dueDate' | 'dueDateRaw' | 'policyNumber'>,
): string {
  if (r.category === 'insurance' && r.policyNumber) return `policy|${norm(r.policyNumber)}`;
  return `lt|${norm(r.location)}|${norm(r.itemName)}|${norm(r.detail)}|${norm(r.dueDate ?? r.dueDateRaw)}`;
}

export function complianceDocumentMatchKey(r: Pick<ParsedComplianceDocumentRecord, 'documentName' | 'documentType'>): string {
  return `${norm(r.documentName)}|${norm(r.documentType)}`;
}

// ── Row parsing per sheet kind ───────────────────────────────────────────────

/** Parses every candidate row of one payment-shaped sheet (licence_tax or
 *  insurance), then applies the sheet-level structural check before
 *  committing any of them to `out`: if any row's Payment Status reads
 *  "Paid" and the sheet has no actual-payment-date column at all, the
 *  WHOLE sheet is skipped (this is the HP case) with exactly one
 *  `level: 'warning'` issue - never `'error'`, which would reject the
 *  entire upload (server/routes/import.ts's hasErrors()). */
function parsePaymentSheet(
  match: PaymentSheetMatch, out: ParsedCompliancePaymentRecord[], issues: Issue[], seenKeys: Map<string, number>,
) {
  const { sheet, headerRow, category, columns: c } = match;
  const location = category === 'insurance' ? null : sheet.name.trim();
  const rows: ParsedCompliancePaymentRecord[] = [];
  let paidWithoutActualDateCount = 0;

  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const rowObj = sheet.getRow(r);
    const itemName = str(rowObj.getCell(c.itemName).value);
    if (!itemName) continue; // blank spacer row

    const paymentStatus = c.paymentStatus != null ? str(rowObj.getCell(c.paymentStatus).value) : null;
    const isPaid = paymentStatus != null && /paid/i.test(paymentStatus);
    if (isPaid && c.actualPaymentDate == null) paidWithoutActualDateCount++;

    const due = looseDate(c.dueDate >= 0 ? rowObj.getCell(c.dueDate).value : null);
    const scheduled = c.scheduledDate != null ? looseDate(rowObj.getCell(c.scheduledDate).value) : { raw: null, date: null };
    const paidOnRaw = c.actualPaymentDate != null ? looseDate(rowObj.getCell(c.actualPaymentDate).value) : { raw: null, date: null };

    const record: ParsedCompliancePaymentRecord = {
      category,
      location: location ?? (c.locationCol != null ? (str(rowObj.getCell(c.locationCol).value) ?? 'Unknown') : 'Unknown'),
      itemName,
      detail: c.detail != null ? str(rowObj.getCell(c.detail).value) : null,
      policyNumber: c.policyNumber != null ? str(rowObj.getCell(c.policyNumber).value) : null,
      dueDateRaw: due.raw,
      dueDate: due.date,
      amount: c.amount >= 0 ? looseNum(rowObj.getCell(c.amount).value) : null,
      paymentStatus,
      paidOn: paidOnRaw.date,
      scheduledFollowUpRaw: scheduled.raw,
      scheduledFollowUp: scheduled.date,
      remarks: c.remarks != null ? str(rowObj.getCell(c.remarks).value) : null,
      sourceSheet: sheet.name,
      sourceRow: r,
    };

    if (due.raw && !due.date && !BLANK_DATE_MARKERS.has(due.raw.toLowerCase())) {
      issues.push({ level: 'info', sheet: sheet.name, message: `row ${r}: Due Date "${due.raw}" could not be parsed as a single date - kept as text` });
    }
    rows.push(record);
  }

  if (paidWithoutActualDateCount > 0) {
    issues.push({
      level: 'warning', sheet: sheet.name,
      message: `${sheet.name} sheet skipped: ${paidWithoutActualDateCount} row(s) are marked "Paid" but this sheet has no "Date Of Payment" column - add real payment dates (matching JP/Daranda's shape) before this sheet can be imported.`,
    });
    return;
  }

  for (const record of rows) {
    const key = compliancePaymentMatchKey(record);
    const firstRow = seenKeys.get(key);
    if (firstRow != null) {
      issues.push({
        level: 'warning', sheet: sheet.name,
        message: `row ${record.sourceRow}: same location/item/detail/due-date as row ${firstRow} - only row ${firstRow} was imported.`,
      });
      continue;
    }
    seenKeys.set(key, record.sourceRow);
    out.push(record);
  }
}

function parseTrademarkSheet(
  match: { sheet: ExcelJS.Worksheet; headerRow: number; columns: TrademarkColumns },
  out: ParsedComplianceTrademarkRecord[], issues: Issue[],
) {
  const { sheet, headerRow, columns: c } = match;
  const seenKeys = new Map<string, number>();
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const rowObj = sheet.getRow(r);
    const applicationNo = idText(rowObj.getCell(c.applicationNo).value);
    if (!applicationNo) continue;
    const dateOfApplication = c.dateOfApplication != null ? looseDate(rowObj.getCell(c.dateOfApplication).value) : { raw: null, date: null };
    const record: ParsedComplianceTrademarkRecord = {
      applicationNo,
      niceClass: c.niceClass != null ? num(rowObj.getCell(c.niceClass).value) : null,
      dateOfApplicationRaw: dateOfApplication.raw,
      dateOfApplication: dateOfApplication.date,
      markName: c.markName != null ? str(rowObj.getCell(c.markName).value) : null,
      tmType: c.tmType != null ? str(rowObj.getCell(c.tmType).value) : null,
      status: c.status != null ? str(rowObj.getCell(c.status).value) : null,
      remarks: c.remarks != null ? str(rowObj.getCell(c.remarks).value) : null,
    };
    const firstRow = seenKeys.get(applicationNo);
    if (firstRow != null) {
      issues.push({ level: 'warning', sheet: sheet.name, message: `row ${r}: duplicate TM Application No. "${applicationNo}" (first seen row ${firstRow}) - only the first was imported.` });
      continue;
    }
    seenKeys.set(applicationNo, r);
    out.push(record);
  }
}

function parseDocumentsSheet(
  match: { sheet: ExcelJS.Worksheet; headerRow: number; columns: DocumentColumns },
  out: ParsedComplianceDocumentRecord[], issues: Issue[],
) {
  const { sheet, headerRow, columns: c } = match;
  const seenKeys = new Map<string, number>();
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const rowObj = sheet.getRow(r);
    const documentName = str(rowObj.getCell(c.documentName).value);
    if (!documentName) continue;
    const documentType = c.documentType != null ? str(rowObj.getCell(c.documentType).value) : null;
    const issue = c.issueDate != null ? looseDate(rowObj.getCell(c.issueDate).value) : { raw: null, date: null };
    const filing = c.filingDate != null ? looseDate(rowObj.getCell(c.filingDate).value) : { raw: null, date: null };
    const expiry = c.expiryDate != null ? looseDate(rowObj.getCell(c.expiryDate).value) : { raw: null, date: null };
    const record: ParsedComplianceDocumentRecord = {
      documentName, documentType,
      documentNumber: c.documentNumber != null ? idText(rowObj.getCell(c.documentNumber).value) : null,
      issueDateRaw: issue.raw, issueDate: issue.date,
      filingDateRaw: filing.raw, filingDate: filing.date,
      expiryDateRaw: expiry.raw, expiryDate: expiry.date,
      status: c.status != null ? str(rowObj.getCell(c.status).value) : null,
      remarks: c.remarks != null ? str(rowObj.getCell(c.remarks).value) : null,
    };
    const key = complianceDocumentMatchKey(record);
    const firstRow = seenKeys.get(key);
    if (firstRow != null) {
      issues.push({ level: 'warning', sheet: sheet.name, message: `row ${r}: same document name/type as row ${firstRow} ("${documentName}") - only row ${firstRow} was imported.` });
      continue;
    }
    seenKeys.set(key, r);
    out.push(record);
  }
}

function parseDirectorsSheet(
  match: { sheet: ExcelJS.Worksheet; headerRow: number; columns: DirectorColumns },
  out: ParsedComplianceDirectorRecord[], issues: Issue[],
) {
  const { sheet, headerRow, columns: c } = match;
  const seenKeys = new Map<string, number>();
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const rowObj = sheet.getRow(r);
    const din = str(rowObj.getCell(c.din).value);
    const name = c.name != null ? str(rowObj.getCell(c.name).value) : null;
    if (!din) {
      if (name) issues.push({ level: 'warning', sheet: sheet.name, message: `row ${r}: "${name}" has no DIN No. - skipped (DIN is the only reliable natural key for this table).` });
      continue;
    }
    const appointment = c.dateOfAppointment != null ? looseDate(rowObj.getCell(c.dateOfAppointment).value) : { raw: null, date: null };
    const record: ParsedComplianceDirectorRecord = {
      din, name, designation: c.designation != null ? str(rowObj.getCell(c.designation).value) : null,
      dateOfAppointmentRaw: appointment.raw, dateOfAppointment: appointment.date,
      aadhaarNumber: c.aadhaar != null ? str(rowObj.getCell(c.aadhaar).value) : null,
      panNumber: c.pan != null ? str(rowObj.getCell(c.pan).value) : null,
      email: c.email != null ? str(rowObj.getCell(c.email).value) : null,
      contactNumber: c.contact != null ? str(rowObj.getCell(c.contact).value) : null,
    };
    const firstRow = seenKeys.get(din);
    if (firstRow != null) {
      issues.push({ level: 'warning', sheet: sheet.name, message: `row ${r}: duplicate DIN No. "${din}" (first seen row ${firstRow}) - only the first was imported.` });
      continue;
    }
    seenKeys.set(din, r);
    out.push(record);
  }
}

export function parseCompliance(wb: ExcelJS.Workbook): ParsedWorkbook {
  const issues: Issue[] = [];
  const paymentRecords: ParsedCompliancePaymentRecord[] = [];
  const documentRecords: ParsedComplianceDocumentRecord[] = [];
  const trademarkRecords: ParsedComplianceTrademarkRecord[] = [];
  const directorRecords: ParsedComplianceDirectorRecord[] = [];
  const result = (): ParsedWorkbook => ({
    kind: 'compliance', businessName: '', periods: [], financialRecords: [], salesRecords: [],
    consignmentRecords: [], employeeRecords: [], targetRecords: [], productionLogRecords: [],
    shiftRosterRecords: [], orderRecords: [], billRecords: [], petpoojaSalesRecords: [], petpoojaMenuPayload: null, petpoojaStockPayload: null, petpoojaOrderCallbackPayload: null,
    compliancePaymentRecords: paymentRecords, complianceDocumentRecords: documentRecords,
    complianceTrademarkRecords: trademarkRecords, complianceDirectorRecords: directorRecords,
    issues,
  });

  const sheets = findComplianceSheets(wb);
  const totalSheets = sheets.paymentSheets.length + sheets.trademarkSheets.length + sheets.documentSheets.length + sheets.directorSheets.length;
  if (totalSheets === 0) {
    issues.push({
      level: 'error', sheet: wb.worksheets[0]?.name ?? '(none)',
      message: 'no compliance-tracker sheet found (expected a Licenses/Taxes, Policy Name, Document Name, TM Application No., or DIN No. header)',
    });
    return result();
  }

  const paymentKeys = new Map<string, number>();
  for (const m of sheets.paymentSheets) parsePaymentSheet(m, paymentRecords, issues, paymentKeys);
  for (const m of sheets.trademarkSheets) parseTrademarkSheet(m, trademarkRecords, issues);
  for (const m of sheets.documentSheets) parseDocumentsSheet(m, documentRecords, issues);
  for (const m of sheets.directorSheets) parseDirectorsSheet(m, directorRecords, issues);

  return result();
}
