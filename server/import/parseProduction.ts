// Parser for the pottery factory's daily production log (data-sources/Daily
// Report.xlsx) - three sheets, all hand-filled daily logs sharing the same
// "blank cell repeats the value above" convention (a stand-in for merged
// cells) for their grouping columns. Row/header positions are fixed (unlike
// parseHr.ts's header-name lookup) since this is a stable hand-built ledger,
// not a form export - headers live on row 2, data from row 3.
//
// Confirmed against the real file before writing this:
//   - Dates are plain text ('26.07.2026') or, for a handful of cells typed
//     without separators, a bare number ('21.082026') - see xlsx.ts's dmy().
//   - Kiln Firing / Glaze Application: Date, Order Name and the
//     Kiln/Firing-Type/Glaze-Type columns genuinely repeat down blank cells
//     within and across groups - forward-filled.
//   - Green Production is two independent, side-by-side sub-tables (A-F:
//     throwing/turning by potter; H-L: finishing by finisher), each with its
//     own Date column. The throwing side's Order Name (F) does NOT repeat -
//     only 63 of 299 rows have one, scattered singly; blank there means "no
//     order," not "same as above." It is read as-is, never forward-filled.
//   - One Qty cell is the non-numeric '4 pcs' - tolerated via parseQty below,
//     not rejected.
//   - Kiln/Firing-Type/Glaze-Type values are inconsistently padded/cased
//     ('  EK1', 'Ek2   ', 'bisque', 'Egove') - normalized below; anything
//     unrecognised is a warning, imported as-is (mirrors parseHr.ts).
import type ExcelJS from 'exceljs';
import { str, num, dmy, makeForwardFill } from './xlsx.ts';
import type { Issue, ParsedProductionLogRecord, ParsedWorkbook } from './types.ts';

const KILN_SHEET = 'Kiln Firing ';
const GLAZE_SHEET = 'Glaze Application';
const GREEN_SHEET = 'Green Production';

const KILNS = ['EK1', 'EK2', 'EK3', 'GK1', 'GK2'];
const FIRING_TYPES_BY_LOWER = new Map([['bisque', 'Bisque'], ['glaze', 'Glaze'], ['decal', 'Decal']]);
// 'Egove'/'Engove' are real typos in the source for what is clearly "Engobe".
const GLAZE_TYPES_BY_LOWER = new Map([['glaze', 'Glaze'], ['engobe', 'Engobe'], ['engove', 'Engobe'], ['egove', 'Engobe']]);

export function findProductionSheets(wb: ExcelJS.Workbook): { kiln: ExcelJS.Worksheet; glaze: ExcelJS.Worksheet; green: ExcelJS.Worksheet } | null {
  const kiln = wb.worksheets.find((w) => w.name === KILN_SHEET);
  const glaze = wb.worksheets.find((w) => w.name === GLAZE_SHEET);
  const green = wb.worksheets.find((w) => w.name === GREEN_SHEET);
  return kiln && glaze && green ? { kiln, glaze, green } : null;
}

function normalize(raw: string, byLower: Map<string, string>, label: string, sheet: string, rowNum: number, issues: Issue[]): string {
  const canonical = byLower.get(raw.trim().toLowerCase());
  if (canonical) return canonical;
  issues.push({ level: 'warning', sheet, message: `row ${rowNum}: unrecognised ${label} "${raw}" - imported as-is` });
  return raw;
}

function normalizeKiln(raw: string, sheet: string, rowNum: number, issues: Issue[]): string {
  const cleaned = raw.trim().toUpperCase();
  if (KILNS.includes(cleaned)) return cleaned;
  issues.push({ level: 'warning', sheet, message: `row ${rowNum}: unrecognised kiln "${raw}" - imported as-is` });
  return raw;
}

/** Numeric parse first; on failure, extract a leading numeric substring
 *  (handles "4 pcs"); on total failure, qty stays null. qtyRaw preserves the
 *  original text whenever the cell wasn't a clean number, so nothing is lost
 *  even when a partial number was recovered. */
function parseQty(v: ExcelJS.CellValue): { qty: number | null; qtyRaw: string | null } {
  const n = num(v);
  if (n != null) return { qty: n, qtyRaw: null };
  const s = str(v);
  if (!s) return { qty: null, qtyRaw: null };
  const m = s.match(/^(\d+(?:\.\d+)?)/);
  return { qty: m ? Number(m[1]) : null, qtyRaw: s };
}

function warnIfUnparseableQty(qty: number | null, qtyRaw: string | null, rawCell: ExcelJS.CellValue, sheet: string, rowNum: number, issues: Issue[]) {
  if (qty === null && qtyRaw === null && rawCell != null) {
    issues.push({ level: 'warning', sheet, message: `row ${rowNum}: unparseable Qty - imported with qty left blank` });
  }
}

function parseKilnFiring(ws: ExcelJS.Worksheet, issues: Issue[]): ParsedProductionLogRecord[] {
  const records: ParsedProductionLogRecord[] = [];
  const fillDate = makeForwardFill<string>();
  const fillOrder = makeForwardFill<string>();
  const fillKiln = makeForwardFill<string>();
  const fillFiringType = makeForwardFill<string>();

  for (let r = 3; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const date = fillDate(dmy(row.getCell(1).value));
    const orderName = fillOrder(str(row.getCell(2).value));
    const rawProduct = str(row.getCell(3).value);
    const rawQtyCell = row.getCell(4).value;
    const kilnRaw = fillKiln(str(row.getCell(5).value));
    const firingTypeRaw = fillFiringType(str(row.getCell(6).value));

    if (rawProduct === null && (rawQtyCell === null || rawQtyCell === undefined)) continue;

    const { qty, qtyRaw } = parseQty(rawQtyCell);
    warnIfUnparseableQty(qty, qtyRaw, rawQtyCell, ws.name, r, issues);

    records.push({
      stage: 'firing',
      date, orderName, productName: rawProduct, qty, qtyRaw,
      throwingQty: null, turningQty: null, potterName: null, finisherName: null, glazeType: null,
      kiln: kilnRaw ? normalizeKiln(kilnRaw, ws.name, r, issues) : null,
      firingType: firingTypeRaw ? normalize(firingTypeRaw, FIRING_TYPES_BY_LOWER, 'firing type', ws.name, r, issues) : null,
      remarks: null,
      sourceSheet: ws.name, sourceRow: r,
    });
  }
  return records;
}

function parseGlazeApplication(ws: ExcelJS.Worksheet, issues: Issue[]): ParsedProductionLogRecord[] {
  const records: ParsedProductionLogRecord[] = [];
  const fillDate = makeForwardFill<string>();
  const fillOrder = makeForwardFill<string>();
  const fillGlaze = makeForwardFill<string>();

  for (let r = 3; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const date = fillDate(dmy(row.getCell(1).value));
    const orderName = fillOrder(str(row.getCell(2).value));
    const rawProduct = str(row.getCell(3).value);
    const rawQtyCell = row.getCell(4).value;
    const glazeRaw = fillGlaze(str(row.getCell(5).value));
    const remarks = str(row.getCell(6).value);

    if (rawProduct === null && (rawQtyCell === null || rawQtyCell === undefined)) continue;

    const { qty, qtyRaw } = parseQty(rawQtyCell);
    warnIfUnparseableQty(qty, qtyRaw, rawQtyCell, ws.name, r, issues);

    records.push({
      stage: 'glazing',
      date, orderName, productName: rawProduct, qty, qtyRaw,
      throwingQty: null, turningQty: null, potterName: null, finisherName: null,
      glazeType: glazeRaw ? normalize(glazeRaw, GLAZE_TYPES_BY_LOWER, 'glaze type', ws.name, r, issues) : null,
      kiln: null, firingType: null,
      remarks,
      sourceSheet: ws.name, sourceRow: r,
    });
  }
  return records;
}

function parseGreenProduction(ws: ExcelJS.Worksheet, issues: Issue[]): ParsedProductionLogRecord[] {
  const records: ParsedProductionLogRecord[] = [];

  // Throwing/turning side (A-F). Order Name (F) is deliberately raw, never
  // forward-filled - see the file-level comment above.
  const fillThrowDate = makeForwardFill<string>();
  const fillPotter = makeForwardFill<string>();
  for (let r = 3; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const date = fillThrowDate(dmy(row.getCell(1).value));
    const potterName = fillPotter(str(row.getCell(2).value));
    const rawProduct = str(row.getCell(3).value);
    const rawThrowingQty = row.getCell(4).value;
    const rawTurningQty = row.getCell(5).value;
    const orderName = str(row.getCell(6).value);

    if (rawProduct === null && rawThrowingQty == null && rawTurningQty == null) continue;

    const throwing = parseQty(rawThrowingQty);
    const turning = parseQty(rawTurningQty);

    records.push({
      stage: 'throwing',
      date, orderName, productName: rawProduct,
      qty: null, qtyRaw: null,
      throwingQty: throwing.qty, turningQty: turning.qty,
      potterName, finisherName: null, glazeType: null, kiln: null, firingType: null, remarks: null,
      sourceSheet: ws.name, sourceRow: r,
    });
  }

  // Finishing side (H-L), a fully independent scan over the same row range -
  // a distinct sourceSheet label so its sourceRow doesn't collide with the
  // throwing side's identically-numbered rows in the unique re-import key.
  const fillFinishDate = makeForwardFill<string>();
  const fillFinisher = makeForwardFill<string>();
  for (let r = 3; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const date = fillFinishDate(dmy(row.getCell(8).value));
    const finisherName = fillFinisher(str(row.getCell(9).value));
    const rawProduct = str(row.getCell(10).value);
    const rawQtyCell = row.getCell(11).value;
    const remarks = str(row.getCell(12).value);

    if (rawProduct === null && (rawQtyCell === null || rawQtyCell === undefined)) continue;

    const { qty, qtyRaw } = parseQty(rawQtyCell);
    warnIfUnparseableQty(qty, qtyRaw, rawQtyCell, ws.name, r, issues);

    records.push({
      stage: 'finishing',
      date, orderName: null, productName: rawProduct, qty, qtyRaw,
      throwingQty: null, turningQty: null, potterName: null, finisherName, glazeType: null, kiln: null, firingType: null,
      remarks,
      sourceSheet: `${ws.name} (Finishing)`, sourceRow: r,
    });
  }

  return records;
}

export function parseProduction(wb: ExcelJS.Workbook): ParsedWorkbook {
  const issues: Issue[] = [];
  const sheets = findProductionSheets(wb);
  if (!sheets) {
    issues.push({ level: 'error', sheet: wb.worksheets[0]?.name ?? '(none)', message: 'expected sheets "Kiln Firing ", "Glaze Application" and "Green Production" not all found' });
    return {
      kind: 'potteryProduction', businessName: '', periods: [], financialRecords: [], salesRecords: [],
      consignmentRecords: [], employeeRecords: [], targetRecords: [], productionLogRecords: [], shiftRosterRecords: [], orderRecords: [], issues,
    };
  }

  const kilnRecords = parseKilnFiring(sheets.kiln, issues);
  const glazeRecords = parseGlazeApplication(sheets.glaze, issues);
  const greenRecords = parseGreenProduction(sheets.green, issues);

  return {
    kind: 'potteryProduction',
    businessName: '',
    periods: [],
    financialRecords: [],
    salesRecords: [],
    consignmentRecords: [],
    employeeRecords: [],
    targetRecords: [],
    productionLogRecords: [...greenRecords, ...glazeRecords, ...kilnRecords],
    shiftRosterRecords: [], orderRecords: [],
    issues,
  };
}
