// Parser for the Sienna Store Sales Analysis workbook.
//   - "Overall sales": stacked fiscal-year blocks; a header row containing
//     "April ' YY" opens a block (12 months Apr..Mar), channel rows follow
//     until the block's TOTAL row (which is reconciled against the channel
//     sum per month - the FY22-23 grand total is known to be ₹2,900 off).
//     The pivot tables below the blocks are never inside an open block.
//   - "Category wise": fiscal-year blocks side by side, identified by the
//     row-1 "YYYY-YYYY" labels (NOT the corrupted row-2 header dates, which
//     misfiled a whole year in the original manual extraction); 12 month
//     sections top to bottom (Apr..Mar).
//   - "Consigment": stacked per-year "Consignment" and "Sienna x Other
//     Brands" blocks; vendor names are canonicalised across blocks.
//   - "Category Comparision" is a derivative re-slice of "Category wise" with
//     inconsistent column blocks; it is deliberately not imported.
import type ExcelJS from 'exceljs';
import { num, str, dateVal } from './xlsx.ts';
import {
  type Issue, type ParsedPeriod, type ParsedSalesRecord, type ParsedConsignmentRecord,
  type ParsedWorkbook, MONTH_NAMES, monthPeriod,
} from './types.ts';

const BUSINESS = 'Sienna';
const APRIL_RE = /April\s*'\s*(\d{2})\b/;
const CHANNEL_ALIAS: Record<string, string> = {
  HP: 'HP Store', JP: 'JP Store', 'Online sales': 'Online Sales',
  'Others (corporate)': 'Corporate Sales', 'Factory outlet': 'Factory Outlet',
};

function canonVendor(name: string): string {
  let n = name.replace(/\s*\(\d+%\)\s*$/, '').replace(/Munai's/g, "Munal's").trim();
  if (n === 'Sujata Weaves') n = 'Sujata Weaves & Prints';
  return n;
}

/** Apr..Mar month periods for a fiscal year starting in `startYear`. */
function fyMonths(startYear: number): ParsedPeriod[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = ((i + 3) % 12) + 1;
    return monthPeriod(month >= 4 ? startYear : startYear + 1, month);
  });
}

const looksLikeMonthLabel = (s: string) =>
  MONTH_NAMES.some((m) => s.startsWith(m)) || /'\s?\d{2}/.test(s) || /^\d{4}/.test(s);

export function parseSienna(wb: ExcelJS.Workbook): ParsedWorkbook {
  const issues: Issue[] = [];
  const sales: ParsedSalesRecord[] = [];
  const consignment: ParsedConsignmentRecord[] = [];
  const periods = new Map<string, ParsedPeriod>();
  const trackPeriod = (p: ParsedPeriod) => { periods.set(p.startDate, p); return p; };

  // ── Overall sales: channel-level blocks ────────────────────────────────────
  const overall = wb.getWorksheet('Overall sales');
  if (!overall) issues.push({ level: 'error', sheet: 'Overall sales', message: 'sheet missing' });
  else {
    let block: { months: ParsedPeriod[]; channelSums: number[] } | null = null;
    overall.eachRow((row) => {
      const hdr = str(row.getCell(2).value);
      const m = hdr?.match(APRIL_RE);
      if (m) {
        block = { months: fyMonths(2000 + Number(m[1])), channelSums: Array(12).fill(0) };
        return;
      }
      if (!block) return;
      const a = str(row.getCell(1).value);
      if (!a || a === 'Cost Centres') return;
      if (a === 'TOTAL') {
        for (let i = 0; i < 12; i++) {
          const total = num(row.getCell(2 + i).value);
          if (total != null && Math.abs(total - block.channelSums[i]) > 1) {
            issues.push({
              level: 'warning', sheet: 'Overall sales',
              message: `${block.months[i].label}: TOTAL row says ${total.toFixed(0)} but the channel rows sum to ${block.channelSums[i].toFixed(0)}`,
            });
          }
        }
        block = null;
        return;
      }
      for (let i = 0; i < 12; i++) {
        const v = num(row.getCell(2 + i).value);
        if (v == null) continue;
        const p = trackPeriod(block.months[i]);
        sales.push({ periodStart: p.startDate, periodEnd: p.endDate, periodType: 'month', categoryName: null, channelName: a, amount: v });
        block.channelSums[i] += v;
      }
    });
  }

  // ── Category wise: category × channel blocks ───────────────────────────────
  const catWs = wb.getWorksheet('Category wise');
  if (!catWs) issues.push({ level: 'error', sheet: 'Category wise', message: 'sheet missing' });
  else {
    const rows: ExcelJS.Row[] = [];
    catWs.eachRow((row) => { rows.push(row); });
    const blocks: { offset: number; startYear: number }[] = [];
    rows[0]?.eachCell((cell, col) => {
      const s = str(cell.value);
      const m = s?.match(/^(\d{4})-(\d{4})$/);
      if (!m) return;
      const y1 = Number(m[1]);
      if (Number(m[2]) !== y1 + 1) {
        issues.push({ level: 'warning', sheet: 'Category wise', message: `block label "${s}" is not a single fiscal year - treated as ${y1}-${y1 + 1}` });
      }
      blocks.push({ offset: col, startYear: y1 });
    });
    if (!blocks.length) issues.push({ level: 'error', sheet: 'Category wise', message: 'no fiscal-year block labels found in row 1' });

    const headerRows = rows
      .map((row, i) => ({ row, i }))
      .filter(({ row }) => blocks.some((b) => str(row.getCell(b.offset).value) === 'Categories'));
    if (headerRows.length !== 12) {
      issues.push({ level: 'warning', sheet: 'Category wise', message: `expected 12 month sections, found ${headerRows.length}` });
    }

    headerRows.forEach(({ row: hdr, i: hdrIdx }, section) => {
      const monthIdx = section; // sections run April..March
      const end = headerRows[section + 1]?.i ?? rows.length;
      for (const b of blocks) {
        const period = trackPeriod(fyMonths(b.startYear)[monthIdx]);
        // channel columns for this block from its header row
        const chans: { col: number; name: string }[] = [];
        for (let c = b.offset + 1; c <= b.offset + 6; c++) {
          const h = str(hdr.getCell(c).value);
          if (!h || h === 'Total') continue;
          chans.push({ col: c, name: CHANNEL_ALIAS[h] ?? h });
        }
        for (let r = hdrIdx + 1; r < end; r++) {
          const row = rows[r];
          const label = str(row.getCell(b.offset).value);
          if (!label || label === 'TOTAL' || label === 'Growth %') continue;
          if (looksLikeMonthLabel(label) || dateVal(row.getCell(b.offset).value)) continue;
          for (const ch of chans) {
            const v = num(row.getCell(ch.col).value);
            if (v == null) continue;
            sales.push({
              periodStart: period.startDate, periodEnd: period.endDate, periodType: 'month',
              categoryName: label, channelName: ch.name, amount: v,
            });
          }
        }
      }
    });
  }

  // ── Consignment: per-year vendor blocks ────────────────────────────────────
  const conWs = wb.getWorksheet('Consigment');
  if (!conWs) issues.push({ level: 'error', sheet: 'Consigment', message: 'sheet missing' });
  else {
    let months: ParsedPeriod[] | null = null;
    let group: 'consignment' | 'other_brands' = 'consignment';
    conWs.eachRow((row) => {
      const a = str(row.getCell(1).value);
      let hdrMatch: RegExpMatchArray | null = null;
      for (let c = 2; c <= 15 && !hdrMatch; c++) hdrMatch = str(row.getCell(c).value)?.match(APRIL_RE) ?? null;
      if (hdrMatch && a) {
        months = fyMonths(2000 + Number(hdrMatch[1]));
        group = /Other Brands/i.test(a) ? 'other_brands' : 'consignment';
        return;
      }
      if (!months || !a || a === 'TOTAL' || a === 'Consignment' || /Other Brands/i.test(a)) return;
      const vendorName = canonVendor(a);
      const rate = num(row.getCell(2).value);
      for (let i = 0; i < 12; i++) {
        const v = num(row.getCell(3 + i).value);
        if (v == null) continue;
        const p = trackPeriod(months[i]);
        consignment.push({
          periodStart: p.startDate, periodEnd: p.endDate, periodType: 'month',
          vendorName, vendorGroup: group, amount: v, commissionRate: rate,
        });
      }
    });
  }

  return {
    kind: 'sienna', businessName: BUSINESS,
    periods: [...periods.values()],
    financialRecords: [],
    salesRecords: sales, consignmentRecords: consignment,
    issues,
  };
}
