// Parser for client order/dispatch status workbooks (one per client
// relationship - Rannaghor, Sienna x Buco, Sienna x Dubai, Sienna x WOV -
// each its own recurring Google Sheet). Every row is one SKU's current
// position in the shared production pipeline: Green -> Drawing [Dubai
// only] -> Bisque -> Glaze Application -> Glaze Firing -> Ready, plus a
// planned dispatch date.
//
// Confirmed against the four real files before writing this:
//   - Sheet names are generic ("Sheet1" x3, "Order Tracking") and differ
//     per client, so the sheet can't be found by name - detection instead
//     scans header rows by content (a mix of stage-name columns, an order
//     qty column, and a dispatch column), same technique as parseCepl.ts's
//     headerMonths().
//   - Columns are NOT at fixed positions across clients (Photo/Price/MOQ/
//     Sample Status appear at different offsets) - every column is
//     resolved by keyword match against the header row, never by index.
//   - The client name isn't in the filename the parser ever sees (only an
//     ExcelJS Workbook is passed in) - it's read from the sheet's own
//     title row(s) above the header instead.
//   - Only one stage column is normally filled per row (the item's current
//     stage), not cumulative through the pipeline - confirmed with the
//     user. WOV writes 0 instead of leaving not-yet-reached stages blank;
//     0 is treated the same as blank everywhere.
//   - Dates are typed as text ('DD.MM.YYYY'), handled by xlsx.ts's dmy().
//   - No stable per-row id exists across all four sheets (row numbering
//     can shift as orders complete) - matching is done downstream in
//     mergeOrders.ts by client + normalized item name/size/colour.
import type ExcelJS from 'exceljs';
import { str, num, dmy } from './xlsx.ts';
import type { Issue, ParsedOrderRecord, ParsedWorkbook } from './types.ts';

const MAX_HEADER_SCAN_ROW = 8;
const MAX_HEADER_SCAN_COL = 20;

const STAGE_FIELDS = ['green', 'drawing', 'bisque', 'glazeApp', 'glazeFiring', 'ready'] as const;
type StageField = typeof STAGE_FIELDS[number];

const STAGE_PATTERNS: [StageField, RegExp][] = [
  ['green', /green/i],
  ['drawing', /drawing/i],
  ['bisque', /bisque/i],
  ['glazeApp', /glaze.*app/i],
  ['glazeFiring', /glaze.*fir/i],
  ['ready', /^ready/i],
];

const CLIENT_PATTERNS: [RegExp, string][] = [
  [/rannaghor/i, 'Rannaghor'],
  [/buco/i, 'Sienna x Buco'],
  [/dubai/i, 'Sienna x Dubai'],
  [/wov/i, 'Sienna x WOV'],
];

interface ColumnMap {
  itemName: number;
  size: number | null;
  colour: number | null;
  orderQty: number | null;
  dispatch: number | null;
  remarks: number | null;
  sampleStatus: number | null;
  stages: Partial<Record<StageField, number>>;
}

export interface OrdersSheetMatch {
  sheet: ExcelJS.Worksheet;
  headerRow: number;
  columns: ColumnMap;
  client: string; // 'Unknown' when the title text matches no known client
}

function headerTexts(ws: ExcelJS.Worksheet, row: number): (string | null)[] {
  const out: (string | null)[] = [null]; // 1-indexed, so out[0] is unused
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

function resolveColumns(texts: (string | null)[]): ColumnMap | null {
  const itemName = findCol(texts, /^(name|item description)$/i);
  if (itemName == null) return null;
  const stages: Partial<Record<StageField, number>> = {};
  for (const [field, re] of STAGE_PATTERNS) {
    const col = findCol(texts, re);
    if (col != null) stages[field] = col;
  }
  return {
    itemName,
    size: findCol(texts, /size/i),
    colour: findCol(texts, /^colou?r$|approved colou?r/i),
    orderQty: findCol(texts, /order\s*qty|^moq/i), // WOV uses "MOQ" in place of "Order Qty"
    dispatch: findCol(texts, /dispatch/i),
    remarks: findCol(texts, /remarks|edits\s*&?\s*notes/i),
    sampleStatus: findCol(texts, /sample\s*status/i),
    stages,
  };
}

function extractClient(ws: ExcelJS.Worksheet, headerRow: number): string {
  const titleParts: string[] = [];
  for (let r = 1; r < headerRow; r++) {
    const t = str(ws.getRow(r).getCell(1).value);
    if (t) titleParts.push(t);
  }
  const title = titleParts.join(' ');
  for (const [re, name] of CLIENT_PATTERNS) {
    if (re.test(title)) return name;
  }
  return 'Unknown';
}

/** Whether `columns` looks like a real order-status header, not a
 *  coincidental partial match against some other kind of workbook. */
function isOrdersHeader(columns: ColumnMap): boolean {
  return Object.keys(columns.stages).length >= 4 && columns.orderQty != null && columns.dispatch != null;
}

export function findOrdersSheet(wb: ExcelJS.Workbook): OrdersSheetMatch | null {
  for (const ws of wb.worksheets) {
    for (let r = 1; r <= Math.min(MAX_HEADER_SCAN_ROW, ws.rowCount); r++) {
      const texts = headerTexts(ws, r);
      const columns = resolveColumns(texts);
      if (columns && isOrdersHeader(columns)) {
        return { sheet: ws, headerRow: r, columns, client: extractClient(ws, r) };
      }
    }
  }
  return null;
}

/** A row's stage cell reads as "not yet reached" whether it's blank or a
 *  literal 0 - WOV writes 0 for every not-yet-reached stage instead of
 *  leaving the cell blank, so both must mean the same thing here. */
function stageVal(v: ExcelJS.CellValue): number | null {
  const n = num(v);
  return n === 0 ? null : n;
}

const norm = (s: string | null) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** The natural key mergeOrders.ts matches rows on - client + normalized
 *  item name/size/colour. Exported so both parse-time dedup below and
 *  mergeOrders.ts compute it identically. */
export function orderMatchKey(r: Pick<ParsedOrderRecord, 'client' | 'itemName' | 'size' | 'colour'>): string {
  return `${norm(r.client)}|${norm(r.itemName)}|${norm(r.size)}|${norm(r.colour)}`;
}

export function parseOrders(wb: ExcelJS.Workbook): ParsedWorkbook {
  const issues: Issue[] = [];
  const records: ParsedOrderRecord[] = [];
  const result = (): ParsedWorkbook => ({
    kind: 'orders', businessName: '', periods: [], financialRecords: [], salesRecords: [],
    consignmentRecords: [], employeeRecords: [], targetRecords: [], productionLogRecords: [],
    shiftRosterRecords: [], orderRecords: records, issues,
  });

  const match = findOrdersSheet(wb);
  if (!match) {
    issues.push({
      level: 'error', sheet: wb.worksheets[0]?.name ?? '(none)',
      message: 'no order-status sheet found (expected a header row with Order Qty, a Dispatch column, and at least 4 production-stage columns)',
    });
    return result();
  }

  const { sheet, headerRow, columns, client } = match;
  if (client === 'Unknown') {
    issues.push({
      level: 'warning', sheet: sheet.name,
      message: `could not determine the client from the sheet's title row(s) above row ${headerRow} - imported as "Unknown"`,
    });
  }

  let rowCount = 0;
  const seenKeys = new Map<string, number>(); // matchKey -> sourceRow of the row that's kept
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const rowObj = sheet.getRow(r);
    const itemName = str(rowObj.getCell(columns.itemName).value);
    if (!itemName) continue; // blank spacer row
    if (/^total/i.test(itemName)) continue; // a column-sums footer row (e.g. WOV's "TOTAL QUANTITIES"), not an order line

    rowCount++;
    const stageQtys: Record<StageField, number | null> = {
      green: null, drawing: null, bisque: null, glazeApp: null, glazeFiring: null, ready: null,
    };
    for (const field of STAGE_FIELDS) {
      const col = columns.stages[field];
      if (col != null) stageQtys[field] = stageVal(rowObj.getCell(col).value);
    }

    const record: ParsedOrderRecord = {
      client,
      itemName,
      size: columns.size != null ? str(rowObj.getCell(columns.size).value) : null,
      colour: columns.colour != null ? str(rowObj.getCell(columns.colour).value) : null,
      orderQty: columns.orderQty != null ? num(rowObj.getCell(columns.orderQty).value) : null,
      greenQty: stageQtys.green,
      drawingQty: stageQtys.drawing,
      bisqueQty: stageQtys.bisque,
      glazeAppQty: stageQtys.glazeApp,
      glazeFiringQty: stageQtys.glazeFiring,
      readyQty: stageQtys.ready,
      dispatchDate: columns.dispatch != null ? dmy(rowObj.getCell(columns.dispatch).value) : null,
      sampleStatus: columns.sampleStatus != null ? str(rowObj.getCell(columns.sampleStatus).value) : null,
      remarks: columns.remarks != null ? str(rowObj.getCell(columns.remarks).value) : null,
      sourceSheet: sheet.name,
      sourceRow: r,
    };

    // Two rows with the same client + item name/size/colour are
    // indistinguishable to mergeOrders.ts's natural key - keep the first
    // (same "first row wins" convention as parseCepl.ts) and warn, rather
    // than letting a second insert crash on the DB's unique index. This
    // does happen for real: e.g. WOV rows with the same name/size but
    // different glaze variants, since there's no glaze/finish column in
    // the matching key.
    const key = orderMatchKey(record);
    const firstRow = seenKeys.get(key);
    if (firstRow != null) {
      issues.push({
        level: 'warning', sheet: sheet.name,
        message: `row ${r}: same client/item name/size/colour as row ${firstRow} ("${itemName}") - only row ${firstRow} was imported. If these are actually different items, add a distinguishing detail (e.g. colour) in the source sheet.`,
      });
      continue;
    }
    seenKeys.set(key, r);
    records.push(record);
  }

  if (rowCount === 0) {
    issues.push({ level: 'warning', sheet: sheet.name, message: 'no order-line rows found below the header' });
  }

  return result();
}
