// Document templates (ID cards, salary slips). A template is a saved,
// draggable layout - a flat array of positioned elements in millimeters,
// matching jsPDF's own coordinate space - that src/lib/documentTemplates.ts's
// renderDocument() interprets at generation time, replacing the two
// hardcoded drawing functions that used to live in src/lib/employeeDocs.ts.
// This file only stores and validates the layout; it never draws anything -
// rendering happens client-side, since jsPDF runs in the browser.
import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db, ready, schema } from './client.ts';

export class DocumentTemplateError extends Error {}

export const DOC_TYPES = ['id_card', 'salary_slip'] as const;
export type DocType = typeof DOC_TYPES[number];

// Not a column: admins can't create an oddly-sized card, only reposition
// elements within a fixed page, same dimensions as today's `new jsPDF(...)`
// calls in employeeDocs.ts.
export const PAGE_SIZE_MM: Record<DocType, { w: number; h: number; orientation: 'portrait' | 'landscape' }> = {
  id_card: { w: 85.6, h: 54, orientation: 'landscape' },
  salary_slip: { w: 210, h: 297, orientation: 'portrait' },
};

export type FieldFormat = 'text' | 'currency' | 'image';
export interface FieldDef { key: string; label: string; format: FieldFormat }

// Mirrors src/lib/documentTemplates.ts's FIELD_CATALOG - the client and
// server are separate TypeScript projects with no cross-importing (same
// convention as StoredLayout/LayoutConfig, see src/lib/layout/types.ts), so
// this is hand-kept in sync rather than shared. 'photo' is special-cased in
// the renderer: a placeholder box always draws, the real image draws on top
// only if it resolves - never a plain image draw.
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

const ALIGNS = ['left', 'center', 'right'] as const;
const OVERFLOWS = ['clip', 'shrink', 'wrap'] as const;
const FONT_WEIGHTS = ['normal', 'bold'] as const;
type Align = typeof ALIGNS[number];
type Overflow = typeof OVERFLOWS[number];
type FontWeight = typeof FONT_WEIGHTS[number];

export interface ElementBase { id: string; x: number; y: number; w: number; h: number }
export interface RectElement extends ElementBase { type: 'rect'; fill?: string; stroke?: string; strokeWidth?: number; rx?: number; ry?: number }
export interface LineElement extends ElementBase { type: 'line'; stroke: string; strokeWidth?: number }
export interface StaticTextElement extends ElementBase {
  type: 'static_text'; text: string; fontSize: number; fontWeight?: FontWeight; color: string; align?: Align;
}
// `prefix`/`suffix` are static text glued around the resolved+formatted
// value (e.g. "ID: " before employeeId, "Salary Slip - " before monthLabel) -
// always shown, even when the value resolves to "-", matching the original
// hardcoded functions' behavior.
export interface FieldElement extends ElementBase {
  type: 'field'; fieldKey: string; fontSize: number; fontWeight?: FontWeight; color: string;
  align?: Align; overflow?: Overflow; prefix?: string; suffix?: string;
}
export interface ImageElement extends ElementBase { type: 'image'; imageUrl: string }
export interface LineItemRow { label: string; fieldKey: string }
export interface LineItemColumn { header?: string; rows: LineItemRow[] }
// The one deliberate exception to "every element is independently
// positioned": salary slip's earnings/deductions block filters out zero/null
// rows and packs what's left tightly, with the whole block's header
// disappearing when both columns are empty - a flat list of field elements
// at fixed y-offsets can't express "collapse the gap when a row is blank."
// Reserve `h` for the worst case (every row present); fewer rows leave
// trailing whitespace inside the box rather than shifting elements below it,
// since this is a fixed-canvas layout, not a flow one.
export interface LineItemTableElement extends ElementBase {
  type: 'line_item_table'; rowHeight: number; left: LineItemColumn; right?: LineItemColumn;
}
export type TemplateElement =
  | RectElement | LineElement | StaticTextElement | FieldElement | ImageElement | LineItemTableElement;

const MAX_ELEMENTS = 100;
const MAX_BYTES = 100_000; // generous - elements hold an image URL, never inline data
const MAX_ROWS_PER_COLUMN = 12;
const ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function isObject(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }

function num(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new DocumentTemplateError(`${where} must be a number`);
  return v;
}
function str(v: unknown, where: string, maxLen = 500): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > maxLen) throw new DocumentTemplateError(`${where} must be a string (1-${maxLen} chars)`);
  return v;
}
function color(v: unknown, where: string): string {
  if (typeof v !== 'string' || !HEX_COLOR.test(v)) throw new DocumentTemplateError(`${where} must be a hex color like #112233`);
  return v;
}
function oneOf<T extends string>(v: unknown, options: readonly T[], where: string): T {
  if (typeof v !== 'string' || !options.includes(v as T)) throw new DocumentTemplateError(`${where} must be one of ${options.join(', ')}`);
  return v as T;
}

function validateBase(raw: Record<string, unknown>, bounds: { w: number; h: number }): ElementBase {
  const id = str(raw.id, 'element.id', 64);
  if (!ID_PATTERN.test(id)) throw new DocumentTemplateError('element.id has invalid characters');
  const x = num(raw.x, 'element.x');
  const y = num(raw.y, 'element.y');
  const w = num(raw.w, 'element.w');
  const h = num(raw.h, 'element.h');
  // Generous slack - this guards against wildly out-of-range data, not
  // pixel-perfect bounds (the designer's own canvas does that).
  const slack = 20;
  if (x < -slack || y < -slack || x > bounds.w + slack || y > bounds.h + slack) {
    throw new DocumentTemplateError(`${id}: position is far outside the page`);
  }
  if (w < 0 || h < 0 || w > bounds.w + slack * 2 || h > bounds.h + slack * 2) {
    throw new DocumentTemplateError(`${id}: size is invalid`);
  }
  return { id, x, y, w, h };
}

/** Validates and normalizes a template's elements for one docType, dropping
 *  nothing silently - mirrors server/db/layouts.ts's validateLayout in
 *  spirit (whitelist fields, bound sizes, reject unknown types outright). */
export function validateTemplateElements(input: unknown, docType: DocType): TemplateElement[] {
  if (!Array.isArray(input)) throw new DocumentTemplateError('elements must be an array');
  if (input.length > MAX_ELEMENTS) throw new DocumentTemplateError(`too many elements (max ${MAX_ELEMENTS})`);
  if (JSON.stringify(input).length > MAX_BYTES) throw new DocumentTemplateError('template is too large');

  const bounds = PAGE_SIZE_MM[docType];
  const fieldKeys = new Set(FIELD_CATALOG[docType].map((f) => f.key));
  const seenIds = new Set<string>();

  const validateColumn = (raw2: unknown, where: string): LineItemColumn => {
    if (!isObject(raw2)) throw new DocumentTemplateError(`${where} must be an object`);
    const col: LineItemColumn = { rows: [] };
    if (raw2.header !== undefined) col.header = str(raw2.header, `${where}.header`, 100);
    if (!Array.isArray(raw2.rows)) throw new DocumentTemplateError(`${where}.rows must be an array`);
    if (raw2.rows.length > MAX_ROWS_PER_COLUMN) throw new DocumentTemplateError(`${where}.rows has too many rows`);
    col.rows = raw2.rows.map((r, j) => {
      if (!isObject(r)) throw new DocumentTemplateError(`${where}.rows[${j}] must be an object`);
      const label = str(r.label, `${where}.rows[${j}].label`, 100);
      const fieldKey = str(r.fieldKey, `${where}.rows[${j}].fieldKey`, 64);
      if (!fieldKeys.has(fieldKey)) throw new DocumentTemplateError(`${where}.rows[${j}].fieldKey "${fieldKey}" is not valid for ${docType}`);
      return { label, fieldKey };
    });
    return col;
  };

  return input.map((raw, i) => {
    if (!isObject(raw)) throw new DocumentTemplateError(`elements[${i}] must be an object`);
    const base = validateBase(raw, bounds);
    if (seenIds.has(base.id)) throw new DocumentTemplateError(`duplicate element id "${base.id}"`);
    seenIds.add(base.id);

    switch (raw.type) {
      case 'rect': {
        const el: RectElement = { ...base, type: 'rect' };
        if (raw.fill !== undefined) el.fill = color(raw.fill, `elements[${i}].fill`);
        if (raw.stroke !== undefined) el.stroke = color(raw.stroke, `elements[${i}].stroke`);
        if (raw.strokeWidth !== undefined) el.strokeWidth = num(raw.strokeWidth, `elements[${i}].strokeWidth`);
        if (raw.rx !== undefined) el.rx = num(raw.rx, `elements[${i}].rx`);
        if (raw.ry !== undefined) el.ry = num(raw.ry, `elements[${i}].ry`);
        return el;
      }
      case 'line': {
        const el: LineElement = { ...base, type: 'line', stroke: color(raw.stroke, `elements[${i}].stroke`) };
        if (raw.strokeWidth !== undefined) el.strokeWidth = num(raw.strokeWidth, `elements[${i}].strokeWidth`);
        return el;
      }
      case 'static_text': {
        const el: StaticTextElement = {
          ...base, type: 'static_text',
          text: str(raw.text, `elements[${i}].text`, 500),
          fontSize: num(raw.fontSize, `elements[${i}].fontSize`),
          color: color(raw.color, `elements[${i}].color`),
        };
        if (raw.fontWeight !== undefined) el.fontWeight = oneOf(raw.fontWeight, FONT_WEIGHTS, `elements[${i}].fontWeight`);
        if (raw.align !== undefined) el.align = oneOf(raw.align, ALIGNS, `elements[${i}].align`);
        return el;
      }
      case 'field': {
        const fieldKey = str(raw.fieldKey, `elements[${i}].fieldKey`, 64);
        if (!fieldKeys.has(fieldKey)) throw new DocumentTemplateError(`elements[${i}].fieldKey "${fieldKey}" is not valid for ${docType}`);
        const el: FieldElement = {
          ...base, type: 'field', fieldKey,
          fontSize: num(raw.fontSize, `elements[${i}].fontSize`),
          color: color(raw.color, `elements[${i}].color`),
        };
        if (raw.fontWeight !== undefined) el.fontWeight = oneOf(raw.fontWeight, FONT_WEIGHTS, `elements[${i}].fontWeight`);
        if (raw.align !== undefined) el.align = oneOf(raw.align, ALIGNS, `elements[${i}].align`);
        if (raw.overflow !== undefined) el.overflow = oneOf(raw.overflow, OVERFLOWS, `elements[${i}].overflow`);
        if (raw.prefix !== undefined) el.prefix = str(raw.prefix, `elements[${i}].prefix`, 100);
        if (raw.suffix !== undefined) el.suffix = str(raw.suffix, `elements[${i}].suffix`, 100);
        return el;
      }
      case 'image':
        return { ...base, type: 'image', imageUrl: str(raw.imageUrl, `elements[${i}].imageUrl`, 2000) };
      case 'line_item_table': {
        if (docType !== 'salary_slip') throw new DocumentTemplateError(`elements[${i}]: line_item_table is only valid for salary_slip`);
        const el: LineItemTableElement = {
          ...base, type: 'line_item_table',
          rowHeight: num(raw.rowHeight, `elements[${i}].rowHeight`),
          left: validateColumn(raw.left, `elements[${i}].left`),
        };
        if (raw.right !== undefined) el.right = validateColumn(raw.right, `elements[${i}].right`);
        return el;
      }
      default:
        throw new DocumentTemplateError(`elements[${i}]: unknown type "${String((raw as { type?: unknown }).type)}"`);
    }
  });
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export interface DocumentTemplateRow {
  id: string; name: string; docType: DocType; isDefault: boolean;
  elements: TemplateElement[]; createdDate: string; updatedAt: string; updatedByUserId: number | null;
}

const now = () => new Date().toISOString();

/** Full rows, for the admin Designer screen - gated by DocumentTemplate:read. */
export async function listTemplates(docType?: DocType): Promise<DocumentTemplateRow[]> {
  await ready();
  const rows = docType
    ? await db.select().from(schema.documentTemplates).where(eq(schema.documentTemplates.docType, docType))
    : await db.select().from(schema.documentTemplates);
  return rows as DocumentTemplateRow[];
}

/** Just enough to populate a template picker - no permission needed, same
 *  treatment as the render route below. */
export async function listTemplateOptions(docType: DocType): Promise<{ id: string; name: string; isDefault: boolean }[]> {
  await ready();
  return db.select({
    id: schema.documentTemplates.id, name: schema.documentTemplates.name, isDefault: schema.documentTemplates.isDefault,
  }).from(schema.documentTemplates).where(eq(schema.documentTemplates.docType, docType));
}

export async function getTemplate(id: string): Promise<DocumentTemplateRow | null> {
  await ready();
  const [row] = await db.select().from(schema.documentTemplates).where(eq(schema.documentTemplates.id, id));
  return (row as DocumentTemplateRow) ?? null;
}

/** The template to actually render: `id` if given (must belong to docType),
 *  else that docType's default. Used by GET /document-templates/render,
 *  which sits behind authMiddleware alone - see permissions.ts's comment on
 *  the DocumentTemplate resource for why that's not a permission-gated read. */
export async function getTemplateForRender(docType: DocType, id?: string): Promise<DocumentTemplateRow> {
  await ready();
  if (id) {
    const row = await getTemplate(id);
    if (!row || row.docType !== docType) throw new DocumentTemplateError('Template not found');
    return row;
  }
  const [row] = await db.select().from(schema.documentTemplates)
    .where(and(eq(schema.documentTemplates.docType, docType), eq(schema.documentTemplates.isDefault, true)));
  if (!row) throw new DocumentTemplateError(`No default template for ${docType}`);
  return row as DocumentTemplateRow;
}

export async function createTemplate(editorId: number, name: unknown, docType: unknown, elements: unknown): Promise<DocumentTemplateRow> {
  await ready();
  if (!DOC_TYPES.includes(docType as DocType)) throw new DocumentTemplateError('docType must be id_card or salary_slip');
  const dt = docType as DocType;
  const row: DocumentTemplateRow = {
    id: randomUUID(), name: str(name, 'name', 200), docType: dt, isDefault: false,
    elements: validateTemplateElements(elements, dt), createdDate: now(), updatedAt: now(), updatedByUserId: editorId,
  };
  await db.insert(schema.documentTemplates).values(row);
  return row;
}

export async function updateTemplate(editorId: number, id: string, name: unknown, elements: unknown): Promise<DocumentTemplateRow> {
  await ready();
  const existing = await getTemplate(id);
  if (!existing) throw new DocumentTemplateError('Template not found');
  const validName = name !== undefined ? str(name, 'name', 200) : existing.name;
  const validElements = elements !== undefined ? validateTemplateElements(elements, existing.docType) : existing.elements;
  const updatedAt = now();
  await db.update(schema.documentTemplates)
    .set({ name: validName, elements: validElements, updatedAt, updatedByUserId: editorId })
    .where(eq(schema.documentTemplates.id, id));
  return { ...existing, name: validName, elements: validElements, updatedAt, updatedByUserId: editorId };
}

export async function deleteTemplate(id: string): Promise<void> {
  await ready();
  const existing = await getTemplate(id);
  if (!existing) throw new DocumentTemplateError('Template not found');
  if (existing.isDefault) throw new DocumentTemplateError('Cannot delete the default template - set another as default first');
  await db.delete(schema.documentTemplates).where(eq(schema.documentTemplates.id, id));
}

/** Clears the previous default for this docType and sets the new one, inside
 *  one transaction - the DB's own partial unique index (schema.ts) backs this
 *  up, but isn't relied on alone. */
export async function setDefaultTemplate(editorId: number, id: string): Promise<void> {
  await ready();
  const existing = await getTemplate(id);
  if (!existing) throw new DocumentTemplateError('Template not found');
  await db.transaction(async (tx) => {
    await tx.update(schema.documentTemplates)
      .set({ isDefault: false })
      .where(and(eq(schema.documentTemplates.docType, existing.docType), eq(schema.documentTemplates.isDefault, true)));
    await tx.update(schema.documentTemplates)
      .set({ isDefault: true, updatedAt: now(), updatedByUserId: editorId })
      .where(eq(schema.documentTemplates.id, id));
  });
}

// ── Seed defaults ────────────────────────────────────────────────────────────
// Hand-transcribed to reproduce src/lib/employeeDocs.ts's old hardcoded
// generateIdCard/generateSalarySlip output exactly (colors/coordinates read
// directly off that file), so nothing changes visually until an admin edits
// or replaces these. Only inserted if no row exists yet for that docType.

const ID_CARD_DEFAULT_ELEMENTS: TemplateElement[] = [
  { id: 'headerBand', type: 'rect', x: 0, y: 0, w: 85.6, h: 14, fill: '#1e293b' },
  { id: 'companyName', type: 'static_text', x: 42.8, y: 9, w: 0, h: 0, text: 'Confetti Exports', fontSize: 11, fontWeight: 'bold', color: '#ffffff', align: 'center' },
  { id: 'photo', type: 'field', x: 6, y: 20, w: 22, h: 22, fieldKey: 'photo', fontSize: 8, color: '#000000' },
  { id: 'fullName', type: 'field', x: 34, y: 25, w: 0, h: 0, fieldKey: 'fullName', fontSize: 11, fontWeight: 'bold', color: '#141414' },
  { id: 'employeeId', type: 'field', x: 34, y: 31, w: 0, h: 0, fieldKey: 'employeeId', fontSize: 8.5, color: '#5a5a5a', prefix: 'ID: ' },
  { id: 'roleDivision', type: 'field', x: 34, y: 36, w: 0, h: 0, fieldKey: 'roleDivision', fontSize: 8.5, color: '#5a5a5a' },
  { id: 'footerLine', type: 'line', x: 6, y: 48, w: 73.6, h: 0, stroke: '#dcdcdc' },
  { id: 'footerCaption', type: 'static_text', x: 42.8, y: 51, w: 0, h: 0, text: 'Employee ID Card', fontSize: 6.5, color: '#969696', align: 'center' },
];

const SALARY_SLIP_DEFAULT_ELEMENTS: TemplateElement[] = [
  { id: 'companyName', type: 'static_text', x: 20, y: 25, w: 0, h: 0, text: 'Confetti Exports', fontSize: 18, fontWeight: 'bold', color: '#000000' },
  { id: 'monthTitle', type: 'field', x: 20, y: 33, w: 0, h: 0, fieldKey: 'monthLabel', fontSize: 13, color: '#5a5a5a', prefix: 'Salary Slip - ' },
  { id: 'headerLine', type: 'line', x: 20, y: 37, w: 170, h: 0, stroke: '#c8c8c8' },
  { id: 'nameLabel', type: 'static_text', x: 20, y: 49, w: 0, h: 0, text: 'Employee Name', fontSize: 11, color: '#6e6e6e' },
  { id: 'nameValue', type: 'field', x: 75, y: 49, w: 0, h: 0, fieldKey: 'fullName', fontSize: 11, color: '#000000' },
  { id: 'idLabel', type: 'static_text', x: 20, y: 57, w: 0, h: 0, text: 'Employee ID', fontSize: 11, color: '#6e6e6e' },
  { id: 'idValue', type: 'field', x: 75, y: 57, w: 0, h: 0, fieldKey: 'employeeId', fontSize: 11, color: '#000000' },
  { id: 'deptLabel', type: 'static_text', x: 20, y: 65, w: 0, h: 0, text: 'Department', fontSize: 11, color: '#6e6e6e' },
  { id: 'deptValue', type: 'field', x: 75, y: 65, w: 0, h: 0, fieldKey: 'division', fontSize: 11, color: '#000000' },
  { id: 'roleLabel', type: 'static_text', x: 20, y: 73, w: 0, h: 0, text: 'Role', fontSize: 11, color: '#6e6e6e' },
  { id: 'roleValue', type: 'field', x: 75, y: 73, w: 0, h: 0, fieldKey: 'role', fontSize: 11, color: '#000000' },
  {
    id: 'earningsDeductions', type: 'line_item_table', x: 20, y: 85, w: 170, h: 34, rowHeight: 6,
    left: {
      header: 'Earnings',
      rows: [
        { label: 'Basic Pay', fieldKey: 'basicPay' }, { label: 'HRA', fieldKey: 'hra' },
        { label: 'Other Allowances', fieldKey: 'otherAllowances' }, { label: 'Bonus', fieldKey: 'bonus' },
      ],
    },
    right: {
      header: 'Deductions',
      rows: [
        { label: 'PF', fieldKey: 'pfDeduction' }, { label: 'Tax', fieldKey: 'taxDeduction' },
        { label: 'Other Deductions', fieldKey: 'otherDeductions' },
      ],
    },
  },
  { id: 'grossBox', type: 'rect', x: 20, y: 125, w: 170, h: 20, fill: '#f8f8f8', stroke: '#dcdcdc', rx: 2, ry: 2 },
  { id: 'grossLabel', type: 'static_text', x: 26, y: 138, w: 0, h: 0, text: 'Gross Salary', fontSize: 11, fontWeight: 'bold', color: '#000000' },
  { id: 'grossValue', type: 'field', x: 184, y: 138, w: 0, h: 0, fieldKey: 'grossSalary', fontSize: 14, fontWeight: 'bold', color: '#000000', align: 'right' },
  { id: 'generatedDate', type: 'field', x: 20, y: 155, w: 0, h: 0, fieldKey: 'generatedDate', fontSize: 9, color: '#969696', prefix: 'Generated on ' },
];

async function hasAnyTemplate(docType: DocType): Promise<boolean> {
  const [row] = await db.select({ id: schema.documentTemplates.id }).from(schema.documentTemplates)
    .where(eq(schema.documentTemplates.docType, docType)).limit(1);
  return !!row;
}

/** Seeds one default template per docType, only if that docType has none yet -
 *  deterministic and code-only, same convention as seedPermissionsCatalog/
 *  seedDefaultReservationLocations. Called from client.ts's ready(), after
 *  migrate() has already resolved - like those two, it must NOT call ready()
 *  itself, which would await the very promise chain it's running inside of
 *  and deadlock every request. */
export async function ensureDefaultTemplates(): Promise<void> {
  if (!(await hasAnyTemplate('id_card'))) {
    await db.insert(schema.documentTemplates).values({
      id: randomUUID(), name: 'Default ID card', docType: 'id_card', isDefault: true,
      elements: ID_CARD_DEFAULT_ELEMENTS, createdDate: now(), updatedAt: now(), updatedByUserId: null,
    });
  }
  if (!(await hasAnyTemplate('salary_slip'))) {
    await db.insert(schema.documentTemplates).values({
      id: randomUUID(), name: 'Default salary slip', docType: 'salary_slip', isDefault: true,
      elements: SALARY_SLIP_DEFAULT_ELEMENTS, createdDate: now(), updatedAt: now(), updatedByUserId: null,
    });
  }
}
