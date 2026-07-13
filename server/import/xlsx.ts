// Thin exceljs helpers shared by the workbook parsers.
import ExcelJS from 'exceljs';

export async function loadWorkbook(input: string | Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  if (typeof input === 'string') await wb.xlsx.readFile(input);
  else await wb.xlsx.load(input as unknown as ExcelJS.Buffer);
  return wb;
}

/** Unwrap a cell value to a finite number (formula results included), else null. */
export function num(v: ExcelJS.CellValue): number | null {
  if (v && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v)) {
    if ('result' in v) {
      const r = (v as { result: ExcelJS.CellValue }).result;
      return typeof r === 'number' && Number.isFinite(r) ? r : null;
    }
    // exceljs omits the cached result of (shared-)formula cells when it is 0
    return 0;
  }
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Unwrap a cell value to a trimmed non-empty string, else null. */
export function str(v: ExcelJS.CellValue): string | null {
  if (v && typeof v === 'object' && 'result' in v) v = (v as { result: ExcelJS.CellValue }).result;
  if (v && typeof v === 'object' && 'richText' in v) {
    v = (v as { richText: { text: string }[] }).richText.map((r) => r.text).join('');
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length ? s : null;
}

/** Unwrap a cell value to a Date (exceljs parses date cells as Date), else null. */
export function dateVal(v: ExcelJS.CellValue): Date | null {
  if (v && typeof v === 'object' && 'result' in v) v = (v as { result: ExcelJS.CellValue }).result;
  return v instanceof Date ? v : null;
}

export function iso(d: Date): string {
  // exceljs date cells are UTC-based
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
