// Parser for the "Monthly F&B P&L (<FY>).xlsx" workbook - CEPL's F&B
// department, one sheet per calendar month ("April 2026", "May 2026", ...).
//
// Unlike parseCepl.ts's single wide F&B sheet (months as columns, fixed row
// positions), this format inserts/removes cost sub-rows between months, so
// row numbers drift from sheet to sheet (e.g. "Total F&B Sales" is row 40 in
// April but row 41 in July, which also drops the "Bar Find" venue column
// entirely) - so nothing here is found by a fixed row/column number, only by
// matching each row's own label text and the header row's "Total" column,
// per sheet.
//
// The handful of headline rows this parser reads are remapped from the
// sheet's own labels onto the EXACT line-item names the existing CEPL F&B
// sheet already uses (see LI below) so they resolve to the very same
// line_items rows/ids fabData.ts's hardcoded LI map already reads by id -
// confirmed against the live dataset before writing this. That's what makes
// this a drop-in continuation of the existing /fnb data instead of a
// parallel, disconnected dataset. The revenue split (product/retail-bar/
// event) is a best-effort remap - this sheet itemizes revenue differently
// (Inhouse Product Sales / Sales from Liquor / Sales from Events / Sales
// from Outside Products) - but the four rows sum exactly to "Total F&B
// Sales" in every month checked, so the total itself is exact even where the
// three-way split is an approximation.
//
// Percentages (COGS %, HR Cost Percentage, Profit & Loss %) are computed
// here from the amount rows rather than read from the sheet's own ratio
// rows, which are sometimes blank-labelled or #DIV/0! for a venue with zero
// revenue that month - the amount rows themselves are always clean.
import type ExcelJS from 'exceljs';
import { num, str } from './xlsx.ts';
import {
  type Issue, type ParsedFinancialRecord, type ParsedPeriod, type ParsedWorkbook,
  MONTH_NAMES, monthPeriod,
} from './types.ts';

const BUSINESS = 'CEPL';
const UNIT = 'F&B';
const SHEET_TITLE_SIGNATURE = 'F&B Monthly P & L for the month of';

const SHEET_RE = new RegExp(`^(${MONTH_NAMES.join('|')}) (\\d{4})$`);

// This sheet's own row labels (column A, exact text - confirmed stable
// across every month sheet checked, even as their row numbers shift).
const ROW = {
  inhouseProductSales: 'Inhouse Product Sales',
  salesFromOutsideProducts: 'Sales from Outside Products',
  salesFromLiquor: 'Sales from Liquor',
  salesFromEvents: 'Sales from Events',
  totalFnbSales: 'Total F&B Sales',
  totalRawMaterial: 'Total Raw Material Purchase',
  hr: 'HR',
  siteCost: 'Site Cost (IT, POS, Utilities, Internet, Phones, Electiricity & Similar Costs)',
  marketingPr: 'Marketing & PR',
  commission: 'Commission',
  totalOperationCost: 'Total Operation Cost',
  netPl: 'P+L = Gross Revenue - Operating Costs',
} as const;

// The existing CEPL F&B sheet's canonical line-item names (verified against
// the live line_items table - these are the exact strings fabData.ts's
// hardcoded ids already point at), keyed by valueType.
const LI = {
  productSales:   { name: 'F&B Product Sales', valueType: 'amount' as const },
  retailBarSales: { name: 'F&B Retail & Bar Sales', valueType: 'amount' as const },
  eventCatering:  { name: 'F&B Event & Catering Receipt', valueType: 'amount' as const },
  totalRevenue:   { name: 'Total F&B Sales Monthwise', valueType: 'amount' as const },
  rawMaterial:    { name: 'Raw Material', valueType: 'amount' as const },
  cogsPct:        { name: '% COGS', valueType: 'percentage' as const },
  hrCost:         { name: 'HR Cost', valueType: 'amount' as const },
  hrPct:          { name: 'HR Cost Percentage', valueType: 'percentage' as const },
  siteCost:       { name: 'Site Cost (IT, POS, Utilities, Internet, Phones, Electiricity & Similar Costs)', valueType: 'amount' as const },
  marketingCost:  { name: 'Marketing & PR', valueType: 'amount' as const },
  deliveryComm:   { name: 'Delivery Partner Commission', valueType: 'amount' as const },
  totalExpense:   { name: 'Total F&B Expenses', valueType: 'amount' as const },
  profitLoss:     { name: 'P+L = Gross Revenue - Operating Costs', valueType: 'amount' as const },
  plPct:          { name: 'Profit & Loss %', valueType: 'percentage' as const },
};

export function findFnbMonthlySheets(wb: ExcelJS.Workbook): { ws: ExcelJS.Worksheet; period: ParsedPeriod }[] {
  const out: { ws: ExcelJS.Worksheet; period: ParsedPeriod }[] = [];
  for (const ws of wb.worksheets) {
    const m = ws.name.match(SHEET_RE);
    if (!m) continue;
    if (!str(ws.getRow(1).getCell(1).value)?.includes(SHEET_TITLE_SIGNATURE)) continue;
    const monthIdx = MONTH_NAMES.indexOf(m[1] as (typeof MONTH_NAMES)[number]); // 0=April..11=March
    const month = ((monthIdx + 3) % 12) + 1;
    out.push({ ws, period: monthPeriod(Number(m[2]), month) });
  }
  return out;
}

function findRow(ws: ExcelJS.Worksheet, label: string): number | null {
  for (let r = 1; r <= ws.rowCount; r++) {
    if (str(ws.getRow(r).getCell(1).value) === label) return r;
  }
  return null;
}

function findTotalCol(ws: ExcelJS.Worksheet): number | null {
  const header = ws.getRow(2);
  for (let c = 1; c <= ws.columnCount + 2; c++) {
    if (str(header.getCell(c).value) === 'Total') return c;
  }
  return null;
}

/** Value of `label`'s row in the sheet's Total column, or null with an issue if the row is missing. */
function readAmount(ws: ExcelJS.Worksheet, label: string, totalCol: number, issues: Issue[]): number | null {
  const r = findRow(ws, label);
  if (r == null) {
    issues.push({ level: 'error', sheet: ws.name, message: `row "${label}" not found` });
    return null;
  }
  const v = num(ws.getRow(r).getCell(totalCol).value);
  if (v == null) {
    issues.push({ level: 'error', sheet: ws.name, message: `row "${label}" has no value in the Total column` });
    return null;
  }
  return v;
}

export function parseFnbMonthly(wb: ExcelJS.Workbook): ParsedWorkbook {
  const issues: Issue[] = [];
  const records: ParsedFinancialRecord[] = [];
  const periods = new Map<string, ParsedPeriod>();

  const sheets = findFnbMonthlySheets(wb);
  if (!sheets.length) {
    issues.push({ level: 'error', sheet: '(workbook)', message: 'no month sheets found (expected sheet names like "April 2026")' });
  }

  for (const { ws, period } of sheets) {
    periods.set(period.startDate, period);
    const totalCol = findTotalCol(ws);
    if (totalCol == null) {
      issues.push({ level: 'error', sheet: ws.name, message: 'no "Total" column found in the department header row (row 2)' });
      continue;
    }
    const amount = (label: string) => readAmount(ws, label, totalCol, issues);

    const inhouse = amount(ROW.inhouseProductSales);
    const outside = amount(ROW.salesFromOutsideProducts);
    const productSales = inhouse != null && outside != null ? inhouse + outside : null;
    const retailBarSales = amount(ROW.salesFromLiquor);
    const eventCatering = amount(ROW.salesFromEvents);
    const totalRevenue = amount(ROW.totalFnbSales);
    const rawMaterial = amount(ROW.totalRawMaterial);
    const hrCost = amount(ROW.hr);
    const siteCost = amount(ROW.siteCost);
    const marketingCost = amount(ROW.marketingPr);
    const deliveryComm = amount(ROW.commission);
    const totalExpense = amount(ROW.totalOperationCost);
    const profitLoss = amount(ROW.netPl);

    if (productSales != null && retailBarSales != null && eventCatering != null && totalRevenue != null) {
      const sum = productSales + retailBarSales + eventCatering;
      if (Math.abs(sum - totalRevenue) > 1) {
        issues.push({
          level: 'warning', sheet: ws.name,
          message: `revenue split (${sum.toFixed(0)}) doesn't match Total F&B Sales (${totalRevenue.toFixed(0)})`,
        });
      }
    }
    if (totalRevenue != null && totalExpense != null && profitLoss != null) {
      const net = totalRevenue - totalExpense;
      if (Math.abs(net - profitLoss) > 1) {
        issues.push({
          level: 'warning', sheet: ws.name,
          message: `Total F&B Sales − Total Operation Cost = ${net.toFixed(0)} but the sheet's own P+L row says ${profitLoss.toFixed(0)}`,
        });
      }
    }

    const push = (li: { name: string; valueType: 'amount' | 'percentage' }, value: number | null) => {
      if (value == null) return;
      records.push({
        businessName: BUSINESS, unitName: UNIT, unitType: 'department',
        periodStart: period.startDate, periodEnd: period.endDate, periodType: 'month',
        lineItemName: li.name, valueType: li.valueType, value,
      });
    };

    push(LI.productSales, productSales);
    push(LI.retailBarSales, retailBarSales);
    push(LI.eventCatering, eventCatering);
    push(LI.totalRevenue, totalRevenue);
    push(LI.rawMaterial, rawMaterial);
    push(LI.hrCost, hrCost);
    push(LI.siteCost, siteCost);
    push(LI.marketingCost, marketingCost);
    push(LI.deliveryComm, deliveryComm);
    push(LI.totalExpense, totalExpense);
    push(LI.profitLoss, profitLoss);

    if (totalRevenue) {
      if (rawMaterial != null) push(LI.cogsPct, rawMaterial / totalRevenue);
      if (hrCost != null) push(LI.hrPct, hrCost / totalRevenue);
      if (profitLoss != null) push(LI.plPct, profitLoss / totalRevenue);
    }
  }

  return {
    kind: 'fnbMonthly', businessName: BUSINESS,
    periods: [...periods.values()],
    financialRecords: records,
    salesRecords: [], consignmentRecords: [], employeeRecords: [], targetRecords: [],
    issues,
  };
}
