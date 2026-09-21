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

/** A hand-typed finite number (formula cells excluded), else null. Unlabeled
 *  rows holding literals are someone's data missing its label and must be
 *  flagged; unlabeled formula rows are derivable scratch and can be skipped. */
export function literalNum(v: ExcelJS.CellValue): number | null {
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

/** Parses a 'DD.MM.YYYY' or 'DD.MM.YY' text cell into 'YYYY-MM-DD', else null.
 *  Some workbooks (parseProduction/parseRoster's sources) hold dates as plain
 *  text rather than real Excel date cells, so dateVal/iso don't apply - this
 *  tries dateVal first in case the cell really is a date, then falls back to
 *  parsing the string. A few cells in the real Daily Report.xlsx were typed
 *  as "21.082026" with no thousands/date formatting applied, so Excel stored
 *  them as the plain number 21.082026 (day 21, then MMYYYY packed into the
 *  fractional part) rather than text - handled as a third fallback. */
export function dmy(v: ExcelJS.CellValue): string | null {
  const d = dateVal(v);
  if (d) return iso(d);
  if (typeof v === 'number' && Number.isFinite(v)) {
    const day = Math.trunc(v);
    const frac = Math.round((v - day) * 1e6);
    const month = Math.trunc(frac / 10000);
    const year = frac % 10000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1950 && year <= 2100) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return null;
  }
  const s = str(v);
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** A per-column forward-fill closure: remembers the last non-null value seen
 *  and returns it when the current cell is blank. Instantiate one per column
 *  that actually repeats-down-until-next-value in its source sheet - not
 *  every column does (see parseProduction.ts's Green Production Order Name,
 *  which must NOT be filled), so this is opt-in per column rather than a
 *  blanket "fill everything" pass. */
export function makeForwardFill<T>(): (v: T | null) => T | null {
  let last: T | null = null;
  return (v: T | null) => {
    if (v !== null) last = v;
    return last;
  };
}
