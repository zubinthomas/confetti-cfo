// Detect which of the known workbook types an upload is, by its sheets.
import type ExcelJS from 'exceljs';
import { str } from './xlsx.ts';
import { parseCepl } from './parseCepl.ts';
import { parseCafe } from './parseCafe.ts';
import { parseSienna } from './parseSienna.ts';
import { parseHr } from './parseHr.ts';
import type { ParsedWorkbook } from './types.ts';

export type WorkbookKind = ParsedWorkbook['kind'];

// The HR Mastersheet's sheet is just "Sheet1" (ExcelJS's default) - no
// usable sheet-name signal like the other three kinds have, so this
// matches on its header row instead. Checked last since it's a weaker
// signal than an exact sheet-name match.
const HR_HEADER_SIGNATURE = ['Full Name*', 'Department*', 'Aadhaar'];

function looksLikeHrMastersheet(wb: ExcelJS.Workbook): boolean {
  return wb.worksheets.some((ws) => {
    const headerCells = new Set<string>();
    ws.getRow(1).eachCell({ includeEmpty: false }, (cell) => {
      const v = str(cell.value);
      if (v) headerCells.add(v);
    });
    return HR_HEADER_SIGNATURE.every((h) => headerCells.has(h));
  });
}

export function detectKind(wb: ExcelJS.Workbook): WorkbookKind | null {
  const names = new Set(wb.worksheets.map((w) => w.name));
  if (names.has('Overview') && names.has('F&B')) return 'cepl';
  if (names.has('Overall sales')) return 'sienna';
  if ([...names].some((n) => /^\d{2}-\d{2}-\d{4} to \d{2}-\d{2}-\d{4}$/.test(n))) return 'cafe';
  if (looksLikeHrMastersheet(wb)) return 'hr';
  return null;
}

export const PARSERS: Record<WorkbookKind, (wb: ExcelJS.Workbook) => ParsedWorkbook> = {
  cepl: parseCepl,
  cafe: parseCafe,
  sienna: parseSienna,
  hr: parseHr,
};
