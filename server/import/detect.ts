// Detect which of the three known workbook types an upload is, by its sheets.
import type ExcelJS from 'exceljs';
import { parseCepl } from './parseCepl.ts';
import { parseCafe } from './parseCafe.ts';
import { parseSienna } from './parseSienna.ts';
import type { ParsedWorkbook } from './types.ts';

export type WorkbookKind = ParsedWorkbook['kind'];

export function detectKind(wb: ExcelJS.Workbook): WorkbookKind | null {
  const names = new Set(wb.worksheets.map((w) => w.name));
  if (names.has('Overview') && names.has('F&B')) return 'cepl';
  if (names.has('Overall sales')) return 'sienna';
  if ([...names].some((n) => /^\d{2}-\d{2}-\d{4} to \d{2}-\d{2}-\d{4}$/.test(n))) return 'cafe';
  return null;
}

export const PARSERS: Record<WorkbookKind, (wb: ExcelJS.Workbook) => ParsedWorkbook> = {
  cepl: parseCepl,
  cafe: parseCafe,
  sienna: parseSienna,
};
