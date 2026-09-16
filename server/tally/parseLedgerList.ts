// Parses a Tally "List of Ledgers" export (Gateway of Tally -> Chart of
// Accounts -> Export, or the older Display -> List of Accounts menu) - the
// answer to the integration checklist's chart-of-accounts item. Tally prints
// this as one flat sheet: group headers in bold, ledgers as plain rows, and
// a ledger's group is whichever bold row most recently preceded it - there's
// no explicit parent-group column in this export. This is a first-pass
// mapping, not guaranteed correct for deeply nested/ambiguous groups (see the
// integration plan's caveat on this exact export shape).
import type ExcelJS from 'exceljs';
import { str } from '../import/xlsx.ts';

export interface ParsedLedgerRow {
  ledgerName: string;
  groupName: string | null;
}

const LEDGER_SHEET_RE = /list of ledgers/i;
const TITLE_RE = /^list of ledgers$/i;
// e.g. "90 Group(s)" / "and" / "2712 Ledger(s)" - the sheet's trailing count row
const TRAILING_SUMMARY_RE = /^\d+\s+group\(s\)/i;

export function findLedgerListSheet(wb: ExcelJS.Workbook): ExcelJS.Worksheet | null {
  for (const ws of wb.worksheets) {
    if (LEDGER_SHEET_RE.test(ws.name)) return ws;
  }
  return null;
}

/** Returns [] if no "List of Ledgers" sheet is found, or its title row isn't -
 *  callers report that as "nothing to import" rather than a parse crash. */
export function parseLedgerList(wb: ExcelJS.Workbook): ParsedLedgerRow[] {
  const ws = findLedgerListSheet(wb);
  if (!ws) return [];

  // Skip the report's title block (company name/address/"List of Ledgers"/
  // date range) - only rows after the title line are actual ledger data.
  let titleRow = -1;
  ws.eachRow((row, rowNumber) => {
    if (titleRow < 0 && TITLE_RE.test(str(row.getCell(1).value) ?? '')) titleRow = rowNumber;
  });
  if (titleRow < 0) return [];

  const rows: ParsedLedgerRow[] = [];
  let currentGroup: string | null = null;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= titleRow + 1) return; // the title row itself, plus the date-range row right after it
    const cell = row.getCell(1);
    const name = str(cell.value);
    if (!name || TRAILING_SUMMARY_RE.test(name)) return;
    if (cell.font?.bold === true) { currentGroup = name; return; }
    rows.push({ ledgerName: name, groupName: currentGroup });
  });
  return rows;
}
