// Document template rendering (ID cards, salary slips). renderDocument()
// interprets a saved template - a flat array of positioned elements in
// millimeters, matching jsPDF's own coordinate space - and draws it with the
// same jsPDF primitives src/lib/employeeDocs.ts's old hardcoded functions
// used, just data-driven instead of hardcoded. See
// server/db/documentTemplates.ts for where templates are stored/validated.
//
// Mirrors server/db/documentTemplates.ts's types and FIELD_CATALOG - the
// client and server are separate TypeScript projects with no cross-importing
// (same convention as LayoutConfig/StoredLayout, see src/lib/layout/types.ts),
// so this is hand-kept in sync rather than shared.
//
// jsPDF is imported dynamically, not at module scope - see employeeDocs.ts's
// header comment for why.

export const DOC_TYPES = ['id_card', 'salary_slip'] as const;
export type DocType = typeof DOC_TYPES[number];

export const PAGE_SIZE_MM: Record<DocType, { w: number; h: number; orientation: 'portrait' | 'landscape' }> = {
  id_card: { w: 85.6, h: 54, orientation: 'landscape' },
  salary_slip: { w: 210, h: 297, orientation: 'portrait' },
};

export type FieldFormat = 'text' | 'currency' | 'image';
export interface FieldDef { key: string; label: string; format: FieldFormat }

// 'photo' is special-cased in drawField below: a placeholder box always
// draws, the real photo draws on top only if it resolves - never a plain
// image draw.
export const FIELD_CATALOG: Record<DocType, FieldDef[]> = {
  id_card: [
    { key: 'photo', label: 'Photo', format: 'image' },
    { key: 'fullName', label: 'Full name', format: 'text' },
    { key: 'employeeId', label: 'Employee ID', format: 'text' },
    { key: 'role', label: 'Role', format: 'text' },
    { key: 'division', label: 'Division', format: 'text' },
    { key: 'roleDivision', label: 'Role - Division', format: 'text' },
  ],
  salary_slip: [
    { key: 'fullName', label: 'Full name', format: 'text' },
    { key: 'employeeId', label: 'Employee ID', format: 'text' },
    { key: 'division', label: 'Division', format: 'text' },
    { key: 'role', label: 'Role', format: 'text' },
    { key: 'monthLabel', label: 'Month', format: 'text' },
    { key: 'generatedDate', label: 'Generated date', format: 'text' },
    { key: 'grossSalary', label: 'Gross salary', format: 'currency' },
    { key: 'basicPay', label: 'Basic pay', format: 'currency' },
    { key: 'hra', label: 'HRA', format: 'currency' },
    { key: 'otherAllowances', label: 'Other allowances', format: 'currency' },
    { key: 'bonus', label: 'Bonus', format: 'currency' },
    { key: 'pfDeduction', label: 'PF deduction', format: 'currency' },
    { key: 'taxDeduction', label: 'Tax deduction', format: 'currency' },
    { key: 'otherDeductions', label: 'Other deductions', format: 'currency' },
  ],
};

export function fieldFormatOf(docType: DocType, fieldKey: string): FieldFormat {
  return FIELD_CATALOG[docType].find((f) => f.key === fieldKey)?.format ?? 'text';
}

export type Align = 'left' | 'center' | 'right';
export type Overflow = 'clip' | 'shrink' | 'wrap';
export type FontWeight = 'normal' | 'bold';

export interface ElementBase { id: string; x: number; y: number; w: number; h: number }
export interface RectElement extends ElementBase { type: 'rect'; fill?: string; stroke?: string; strokeWidth?: number; rx?: number; ry?: number }
export interface LineElement extends ElementBase { type: 'line'; stroke: string; strokeWidth?: number }
export interface StaticTextElement extends ElementBase {
  type: 'static_text'; text: string; fontSize: number; fontWeight?: FontWeight; color: string; align?: Align;
}
export interface FieldElement extends ElementBase {
  type: 'field'; fieldKey: string; fontSize: number; fontWeight?: FontWeight; color: string;
  align?: Align; overflow?: Overflow; prefix?: string; suffix?: string;
}
export interface ImageElement extends ElementBase { type: 'image'; imageUrl: string }
export interface LineItemRow { label: string; fieldKey: string }
export interface LineItemColumn { header?: string; rows: LineItemRow[] }
export interface LineItemTableElement extends ElementBase {
  type: 'line_item_table'; rowHeight: number; left: LineItemColumn; right?: LineItemColumn;
}
export type TemplateElement =
  | RectElement | LineElement | StaticTextElement | FieldElement | ImageElement | LineItemTableElement;

export interface DocumentTemplate {
  id: string;
  name: string;
  docType: DocType;
  elements: TemplateElement[];
}

/** Scalar values and precomputed display strings a template's `field`
 *  elements resolve against. Composites (roleDivision) and anything
 *  formatted ahead of render time (monthLabel, generatedDate) are built by
 *  the caller (employeeDocs.ts) before calling renderDocument - this stays a
 *  dumb lookup, not a place that knows about employees or payroll. */
export type RenderData = Record<string, string | number | null | undefined>;

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex);
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function formatValue(raw: string | number | null | undefined, format: FieldFormat): string {
  if (raw === null || raw === undefined || raw === '') return '-';
  if (format === 'currency') {
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) ? `Rs. ${n.toLocaleString('en-IN')}` : '-';
  }
  return String(raw);
}

// jsPDF.addImage needs actual image data, not a remote URL - fetches and
// converts, reporting the format addImage needs from the blob's MIME type.
// Used for the 'photo' field and for 'image' elements (an uploaded
// background or logo) alike.
async function urlToImageData(url: string): Promise<{ dataUrl: string; format: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not load image');
  const blob = await res.blob();
  const format = blob.type.split('/')[1]?.toUpperCase() || 'JPEG';
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(blob);
  });
  return { dataUrl, format };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type JsPDFDoc = any;

interface TextStyle { fontSize: number; fontWeight?: FontWeight; color: string; align?: Align; overflow?: Overflow; w: number }

// No width constraint at all is today's actual behavior (the original
// hardcoded functions never bounded a doc.text call) - `overflow` left unset
// reproduces that exactly. Set it only for admin-authored templates that want
// different handling of a long value.
function drawStyledText(doc: JsPDFDoc, x: number, y: number, text: string, style: TextStyle) {
  doc.setFont('helvetica', style.fontWeight === 'bold' ? 'bold' : 'normal');
  doc.setFontSize(style.fontSize);
  const [r, g, b] = hexToRgb(style.color);
  doc.setTextColor(r, g, b);
  const opts = style.align && style.align !== 'left' ? { align: style.align } : undefined;

  if (style.overflow === 'wrap' && style.w > 0) {
    doc.text(doc.splitTextToSize(text, style.w), x, y, opts);
    return;
  }
  if (style.overflow === 'clip' && style.w > 0) {
    let t = text;
    while (t.length > 1 && doc.getTextWidth(t) > style.w) t = t.slice(0, -1);
    doc.text(t, x, y, opts);
    return;
  }
  if (style.overflow === 'shrink' && style.w > 0) {
    let size = style.fontSize;
    while (size > 5 && doc.getTextWidth(text) > style.w) {
      size -= 0.5;
      doc.setFontSize(size);
    }
    doc.text(text, x, y, opts);
    return;
  }
  doc.text(text, x, y, opts);
}

function drawRect(doc: JsPDFDoc, el: RectElement) {
  const style = el.fill && el.stroke ? 'FD' : el.fill ? 'F' : el.stroke ? 'S' : undefined;
  if (!style) return;
  if (el.fill) doc.setFillColor(...hexToRgb(el.fill));
  if (el.stroke) doc.setDrawColor(...hexToRgb(el.stroke));
  doc.setLineWidth(el.strokeWidth ?? 0.2);
  if (el.rx || el.ry) {
    doc.roundedRect(el.x, el.y, el.w, el.h, el.rx ?? el.ry ?? 0, el.ry ?? el.rx ?? 0, style);
  } else {
    doc.rect(el.x, el.y, el.w, el.h, style);
  }
}

function drawLine(doc: JsPDFDoc, el: LineElement) {
  doc.setDrawColor(...hexToRgb(el.stroke));
  doc.setLineWidth(el.strokeWidth ?? 0.2);
  doc.line(el.x, el.y, el.x + el.w, el.y + el.h);
}

async function drawImage(doc: JsPDFDoc, el: ImageElement) {
  try {
    const { dataUrl, format } = await urlToImageData(el.imageUrl);
    doc.addImage(dataUrl, format, el.x, el.y, el.w, el.h);
  } catch {
    // A broken background/logo image shouldn't block the rest of the document.
  }
}

async function drawField(doc: JsPDFDoc, el: FieldElement, docType: DocType, data: RenderData) {
  if (el.fieldKey === 'photo') {
    doc.setDrawColor(210, 210, 210);
    doc.setFillColor(240, 240, 240);
    doc.rect(el.x, el.y, el.w, el.h, 'FD');
    const url = data.photo;
    if (typeof url === 'string' && url) {
      try {
        const { dataUrl, format } = await urlToImageData(url);
        doc.addImage(dataUrl, format, el.x, el.y, el.w, el.h);
      } catch {
        // No photo on the card if it couldn't be loaded - the placeholder
        // box drawn above stays visible, same as the original generateIdCard.
      }
    }
    return;
  }
  const formatted = formatValue(data[el.fieldKey], fieldFormatOf(docType, el.fieldKey));
  const display = `${el.prefix ?? ''}${formatted}${el.suffix ?? ''}`;
  drawStyledText(doc, el.x, el.y, display, { ...el, w: el.w });
}

function drawLineItemTable(doc: JsPDFDoc, el: LineItemTableElement, docType: DocType, data: RenderData) {
  const resolveRows = (col?: LineItemColumn) =>
    (col?.rows ?? [])
      .map((r) => ({ label: r.label, fieldKey: r.fieldKey, raw: data[r.fieldKey] }))
      .filter((r) => !!r.raw); // falsy (null/0/undefined/"") rows are dropped and the rest pack up tightly

  const leftRows = resolveRows(el.left);
  const rightRows = el.right ? resolveRows(el.right) : [];
  if (leftRows.length === 0 && rightRows.length === 0) return; // whole block (including its header) hides when empty

  const hasRight = !!el.right;
  const colWidth = hasRight ? el.w / 2 : el.w;
  let y = el.y;

  if (el.left.header || el.right?.header) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    if (el.left.header) doc.text(el.left.header, el.x, y);
    if (hasRight && el.right?.header) doc.text(el.right.header, el.x + colWidth, y);
    y += el.rowHeight;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const rowCount = Math.max(leftRows.length, rightRows.length);
  for (let i = 0; i < rowCount; i++) {
    doc.setTextColor(90, 90, 90);
    const left = leftRows[i];
    if (left) {
      doc.text(left.label, el.x, y);
      doc.text(formatValue(left.raw, fieldFormatOf(docType, left.fieldKey)), el.x + colWidth - 8, y, { align: 'right' });
    }
    const right = rightRows[i];
    if (hasRight && right) {
      doc.text(right.label, el.x + colWidth, y);
      doc.text(formatValue(right.raw, fieldFormatOf(docType, right.fieldKey)), el.x + el.w, y, { align: 'right' });
    }
    y += el.rowHeight;
  }
}

/** Builds a jsPDF document from a saved template + this document's data.
 *  Elements draw in array order (z-order = array order). */
export async function renderDocument(template: DocumentTemplate, data: RenderData) {
  const { jsPDF } = await import('jspdf');
  const size = PAGE_SIZE_MM[template.docType];
  const doc = new jsPDF({
    orientation: size.orientation,
    unit: 'mm',
    format: template.docType === 'id_card' ? [size.w, size.h] : 'a4',
  });

  for (const el of template.elements) {
    switch (el.type) {
      case 'rect': drawRect(doc, el); break;
      case 'line': drawLine(doc, el); break;
      case 'static_text': drawStyledText(doc, el.x, el.y, el.text, { ...el, w: el.w }); break;
      case 'field': await drawField(doc, el, template.docType, data); break;
      case 'image': await drawImage(doc, el); break;
      case 'line_item_table': drawLineItemTable(doc, el, template.docType, data); break;
    }
  }

  return doc;
}
