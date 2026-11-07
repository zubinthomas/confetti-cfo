// Admin screen for designing ID card and salary slip templates - see
// src/lib/documentTemplates.ts for the element schema/renderer and
// server/routes/documentTemplates.ts for the API. Dragging and resizing use
// native Pointer Events: nothing in this repo does free x/y positioning
// today (@hello-pangea/dnd is list-reorder only), so this is new,
// self-contained canvas code. The DOM preview is an approximation (browser
// font metrics don't exactly match jsPDF's) - "Preview PDF" is the real,
// pixel-accurate check.
import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Star, Copy, Upload, Eye, Save } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import PageSpinner from "@/components/dashboard/PageSpinner";
import { useAuth } from "@/lib/AuthContext";
import {
  listTemplates, createTemplate, updateTemplate, deleteTemplate, setDefaultTemplate, uploadTemplateImage,
  type TemplateRow,
} from "@/api/documentTemplatesApi";
import {
  PAGE_SIZE_MM, FIELD_CATALOG, renderDocument,
  type DocType, type TemplateElement, type ImageElement, type RenderData,
} from "@/lib/documentTemplates";

const DOC_TYPES: DocType[] = ["id_card", "salary_slip"];
const DOC_TYPE_LABEL: Record<DocType, string> = { id_card: "ID card", salary_slip: "Salary slip" };
const CANVAS_WIDTH_PX = 560;
const ELEMENT_TYPES: TemplateElement["type"][] = ["rect", "line", "static_text", "field", "image", "line_item_table"];
const ELEMENT_TYPE_LABEL: Record<TemplateElement["type"], string> = {
  rect: "Rectangle", line: "Line", static_text: "Static text", field: "Field", image: "Image", line_item_table: "Line-item table",
};

const SAMPLE_DATA: Record<DocType, RenderData> = {
  id_card: {
    photo: null, fullName: "Asha Rao", employeeId: "EMP-0142", role: "Pastry Chef", division: "Culinary",
    roleDivision: "Pastry Chef - Culinary",
  },
  salary_slip: {
    fullName: "Asha Rao", employeeId: "EMP-0142", division: "Culinary", role: "Pastry Chef",
    monthLabel: "October 2026", generatedDate: new Date().toLocaleDateString("en-IN"),
    grossSalary: 42000, basicPay: 25000, hra: 10000, otherAllowances: 5000, bonus: 2000,
    pfDeduction: 1800, taxDeduction: 1200, otherDeductions: null,
  },
};

const inputClass = "text-xs rounded-lg border border-border bg-background px-2 py-1.5 text-foreground w-full";
const colorInputClass = "h-8 w-full rounded-lg border border-border bg-background p-1";
const btnClass = "text-xs font-medium rounded-lg border border-border px-2.5 py-1.5 hover:bg-muted transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed";
const round1 = (n: number) => Math.round(n * 10) / 10;
const newId = () => Math.random().toString(36).slice(2, 10);

function defaultElementFor(type: TemplateElement["type"], docType: DocType): TemplateElement {
  const base = { id: newId(), x: 10, y: 10, w: 30, h: 10 };
  const firstField = FIELD_CATALOG[docType][0].key;
  switch (type) {
    case "rect": return { ...base, type, fill: "#f0f0f0", stroke: "#cccccc" };
    case "line": return { ...base, h: 0, type, stroke: "#cccccc" };
    case "static_text": return { ...base, w: 0, h: 0, type, text: "Label", fontSize: 10, color: "#000000" };
    case "field": return { ...base, w: 0, h: 0, type, fieldKey: firstField, fontSize: 10, color: "#000000" };
    case "image": return { ...base, type, imageUrl: "" };
    case "line_item_table":
      return { ...base, w: 80, h: 20, type, rowHeight: 6, left: { header: "Column", rows: [{ label: "Row", fieldKey: firstField }] } };
  }
}

function elementLabel(el: TemplateElement): string {
  if (el.type === "static_text") return el.text || "(empty text)";
  if (el.type === "field") return `{${el.fieldKey}}`;
  if (el.type === "image") return "Image";
  if (el.type === "line_item_table") return "Line-item table";
  return ELEMENT_TYPE_LABEL[el.type];
}

function ElementBox({
  el, pxPerMm, selected, canWrite, onSelect, onDrag,
}: {
  el: TemplateElement; pxPerMm: number; selected: boolean; canWrite: boolean;
  onSelect: () => void; onDrag: (mode: "move" | "resize") => (e: React.PointerEvent) => void;
}) {
  const isLine = el.type === "line";
  // rect/image/line_item_table have a real box (w/h are the whole point).
  // static_text/field are usually authored with w=0,h=0 (unbounded text,
  // matching jsPDF's own default) - sizing their on-screen box to that would
  // clip them to a couple of pixels, so they size to their text content
  // instead and only use w/h as a resize handle's starting point.
  const isBoxed = el.type === "rect" || el.type === "image" || el.type === "line_item_table" || (el.type === "field" && el.fieldKey === "photo");
  const style: React.CSSProperties = {
    position: "absolute",
    left: el.x * pxPerMm,
    top: el.y * pxPerMm,
    ...(isLine
      ? { width: Math.max(Math.abs(el.w) * pxPerMm, 2), height: Math.max(Math.abs(el.h) * pxPerMm, 2) }
      : isBoxed
        ? { width: Math.max(el.w * pxPerMm, 4), height: Math.max(el.h * pxPerMm, 4) }
        : { minWidth: 10, minHeight: 10 }),
  };
  return (
    <div
      style={style}
      onPointerDown={canWrite ? onDrag("move") : undefined}
      onClick={onSelect}
      className={`group cursor-move select-none text-[10px] leading-tight whitespace-nowrap ${
        selected ? "ring-2 ring-primary z-10" : "ring-1 ring-dashed ring-border/70 hover:ring-primary/50"
      } ${el.type === "rect" ? "" : "bg-background/90 px-0.5"}`}
    >
      {el.type === "rect" && (
        <div className="w-full h-full" style={{ background: el.fill, border: el.stroke ? `1px solid ${el.stroke}` : undefined }} />
      )}
      {el.type !== "rect" && (
        <span className="text-muted-foreground">{elementLabel(el)}</span>
      )}
      {selected && canWrite && isBoxed && (
        <div
          onPointerDown={onDrag("resize")}
          className="absolute -right-1 -bottom-1 w-3 h-3 bg-primary rounded-sm cursor-nwse-resize"
        />
      )}
    </div>
  );
}

function RowListEditor({
  rows, fieldOptions, onChange,
}: {
  rows: { label: string; fieldKey: string }[]; fieldOptions: { key: string; label: string }[];
  onChange: (rows: { label: string; fieldKey: string }[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            className={inputClass} value={row.label} placeholder="Label"
            onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))}
          />
          <select
            className={inputClass} value={row.fieldKey}
            onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, fieldKey: e.target.value } : r)))}
          >
            {fieldOptions.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <button type="button" className="text-muted-foreground hover:text-destructive shrink-0" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button" className={btnClass}
        onClick={() => onChange([...rows, { label: "Row", fieldKey: fieldOptions[0]?.key ?? "" }])}
      >
        <Plus className="w-3 h-3" /> Row
      </button>
    </div>
  );
}

function PropertyPanel({
  el, docType, onChange, onUploadImage,
}: {
  el: TemplateElement; docType: DocType; onChange: (patch: Partial<TemplateElement>) => void;
  onUploadImage: (file: File) => void;
}) {
  const fieldOptions = FIELD_CATALOG[docType];
  const num = (v: string) => (v === "" ? 0 : Number(v));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted-foreground">X (mm)
          <input className={inputClass} type="number" value={el.x} onChange={(e) => onChange({ x: num(e.target.value) })} />
        </label>
        <label className="text-xs text-muted-foreground">Y (mm)
          <input className={inputClass} type="number" value={el.y} onChange={(e) => onChange({ y: num(e.target.value) })} />
        </label>
        <label className="text-xs text-muted-foreground">Width (mm)
          <input className={inputClass} type="number" value={el.w} onChange={(e) => onChange({ w: num(e.target.value) })} />
        </label>
        <label className="text-xs text-muted-foreground">Height (mm)
          <input className={inputClass} type="number" value={el.h} onChange={(e) => onChange({ h: num(e.target.value) })} />
        </label>
      </div>

      {el.type === "rect" && (
        <>
          <label className="text-xs text-muted-foreground block">Fill
            <input className={colorInputClass} type="color" value={el.fill ?? "#ffffff"} onChange={(e) => onChange({ fill: e.target.value })} />
          </label>
          <label className="text-xs text-muted-foreground block">Stroke
            <input className={colorInputClass} type="color" value={el.stroke ?? "#000000"} onChange={(e) => onChange({ stroke: e.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted-foreground">Corner radius X
              <input className={inputClass} type="number" value={el.rx ?? 0} onChange={(e) => onChange({ rx: num(e.target.value) })} />
            </label>
            <label className="text-xs text-muted-foreground">Corner radius Y
              <input className={inputClass} type="number" value={el.ry ?? 0} onChange={(e) => onChange({ ry: num(e.target.value) })} />
            </label>
          </div>
        </>
      )}

      {el.type === "line" && (
        <label className="text-xs text-muted-foreground block">Color
          <input className={colorInputClass} type="color" value={el.stroke} onChange={(e) => onChange({ stroke: e.target.value })} />
        </label>
      )}

      {el.type === "static_text" && (
        <label className="text-xs text-muted-foreground block">Text
          <input className={inputClass} value={el.text} onChange={(e) => onChange({ text: e.target.value })} />
        </label>
      )}

      {el.type === "field" && (
        <>
          <label className="text-xs text-muted-foreground block">Field
            <select className={inputClass} value={el.fieldKey} onChange={(e) => onChange({ fieldKey: e.target.value })}>
              {fieldOptions.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted-foreground">Prefix
              <input className={inputClass} value={el.prefix ?? ""} onChange={(e) => onChange({ prefix: e.target.value || undefined })} />
            </label>
            <label className="text-xs text-muted-foreground">Suffix
              <input className={inputClass} value={el.suffix ?? ""} onChange={(e) => onChange({ suffix: e.target.value || undefined })} />
            </label>
          </div>
          <label className="text-xs text-muted-foreground block">Overflow (long values)
            <select className={inputClass} value={el.overflow ?? ""} onChange={(e) => onChange({ overflow: (e.target.value || undefined) as never })}>
              <option value="">Unbounded (default)</option>
              <option value="clip">Clip</option>
              <option value="shrink">Shrink to fit</option>
              <option value="wrap">Wrap</option>
            </select>
          </label>
        </>
      )}

      {(el.type === "static_text" || el.type === "field") && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted-foreground">Font size
              <input className={inputClass} type="number" value={el.fontSize} onChange={(e) => onChange({ fontSize: num(e.target.value) })} />
            </label>
            <label className="text-xs text-muted-foreground">Weight
              <select className={inputClass} value={el.fontWeight ?? "normal"} onChange={(e) => onChange({ fontWeight: e.target.value as never })}>
                <option value="normal">Normal</option>
                <option value="bold">Bold</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted-foreground">Color
              <input className={colorInputClass} type="color" value={el.color} onChange={(e) => onChange({ color: e.target.value })} />
            </label>
            <label className="text-xs text-muted-foreground">Align
              <select className={inputClass} value={el.align ?? "left"} onChange={(e) => onChange({ align: e.target.value as never })}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
          </div>
        </>
      )}

      {el.type === "image" && (
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground block">Image URL
            <input className={inputClass} value={el.imageUrl} onChange={(e) => onChange({ imageUrl: e.target.value })} />
          </label>
          <label className={`${btnClass} cursor-pointer w-fit`}>
            <Upload className="w-3 h-3" /> Upload
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onUploadImage(e.target.files[0])} />
          </label>
        </div>
      )}

      {el.type === "line_item_table" && (
        <div className="space-y-3">
          <label className="text-xs text-muted-foreground block">Row height (mm)
            <input className={inputClass} type="number" value={el.rowHeight} onChange={(e) => onChange({ rowHeight: num(e.target.value) })} />
          </label>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Left column header
              <input className={inputClass} value={el.left.header ?? ""} onChange={(e) => onChange({ left: { ...el.left, header: e.target.value || undefined } })} />
            </label>
            <RowListEditor rows={el.left.rows} fieldOptions={fieldOptions} onChange={(rows) => onChange({ left: { ...el.left, rows } })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Right column header (optional - leave rows empty for one column)
              <input className={inputClass} value={el.right?.header ?? ""} onChange={(e) => onChange({ right: { ...(el.right ?? { rows: [] }), header: e.target.value || undefined } })} />
            </label>
            <RowListEditor rows={el.right?.rows ?? []} fieldOptions={fieldOptions} onChange={(rows) => onChange({ right: rows.length ? { ...(el.right ?? {}), rows } : undefined })} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function DocumentTemplateDesigner() {
  const { can } = useAuth();
  const canWrite = can("DocumentTemplate", "write");
  const queryClient = useQueryClient();

  const [docType, setDocType] = useState<DocType>("id_card");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [elements, setElements] = useState<TemplateElement[]>([]);
  const [selectedElId, setSelectedElId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const canvasHostRef = useRef<HTMLDivElement>(null);

  const { data: templates, isLoading } = useQuery<TemplateRow[]>({
    queryKey: ["document-templates", docType],
    queryFn: () => listTemplates(docType),
  });

  useEffect(() => {
    setSelectedTemplateId(null);
    setConfirmingDelete(false);
  }, [docType]);

  useEffect(() => {
    if (!templates) return;
    if (templates.length === 0) { setSelectedTemplateId(null); return; }
    if (!selectedTemplateId || !templates.some((t) => t.id === selectedTemplateId)) {
      setSelectedTemplateId((templates.find((t) => t.isDefault) ?? templates[0]).id);
    }
  }, [templates, selectedTemplateId]);

  const selected = templates?.find((t) => t.id === selectedTemplateId) ?? null;

  useEffect(() => {
    if (selected) {
      setName(selected.name);
      setElements(selected.elements);
      setSelectedElId(null);
      setDirty(false);
    }
  }, [selected?.id]);

  const page = PAGE_SIZE_MM[docType];
  const pxPerMm = CANVAS_WIDTH_PX / page.w;
  const canvasHeightPx = page.h * pxPerMm;
  const selectedEl = elements.find((e) => e.id === selectedElId) ?? null;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["document-templates", docType] });

  function patchElement(patch: Partial<TemplateElement>) {
    if (!selectedElId) return;
    setElements((prev) => prev.map((e) => (e.id === selectedElId ? ({ ...e, ...patch } as TemplateElement) : e)));
    setDirty(true);
  }

  function addElement(type: TemplateElement["type"]) {
    const el = defaultElementFor(type, docType);
    setElements((prev) => [...prev, el]);
    setSelectedElId(el.id);
    setDirty(true);
  }

  function removeSelected() {
    if (!selectedElId) return;
    setElements((prev) => prev.filter((e) => e.id !== selectedElId));
    setSelectedElId(null);
    setDirty(true);
  }

  function startDrag(elId: string, mode: "move" | "resize") {
    return (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const el = elements.find((x) => x.id === elId);
      if (!el) return;
      setSelectedElId(elId);
      const startX = e.clientX;
      const startY = e.clientY;
      const origin = { x: el.x, y: el.y, w: el.w, h: el.h };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      function onMove(ev: PointerEvent) {
        const dxMm = (ev.clientX - startX) / pxPerMm;
        const dyMm = (ev.clientY - startY) / pxPerMm;
        if (mode === "move") {
          setElements((prev) => prev.map((x) => (x.id === elId ? { ...x, x: round1(origin.x + dxMm), y: round1(origin.y + dyMm) } : x)));
        } else {
          setElements((prev) => prev.map((x) => (x.id === elId ? { ...x, w: Math.max(2, round1(origin.w + dxMm)), h: Math.max(0, round1(origin.h + dyMm)) } : x)));
        }
        setDirty(true);
      }
      function onUp() {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      }
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };
  }

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const handleSave = () => withBusy(async () => {
    if (!selected) return;
    await updateTemplate(selected.id, name, elements);
    setDirty(false);
    await refresh();
  });

  const handleCreate = () => withBusy(async () => {
    const created = await createTemplate(`New ${DOC_TYPE_LABEL[docType]} design`, docType, []);
    await refresh();
    setSelectedTemplateId(created.id);
  });

  const handleDuplicate = () => withBusy(async () => {
    if (!selected) return;
    const created = await createTemplate(`${selected.name} (copy)`, docType, selected.elements);
    await refresh();
    setSelectedTemplateId(created.id);
  });

  const handleDelete = () => withBusy(async () => {
    if (!selected) return;
    await deleteTemplate(selected.id);
    setConfirmingDelete(false);
    setSelectedTemplateId(null);
    await refresh();
  });

  const handleSetDefault = () => withBusy(async () => {
    if (!selected) return;
    await setDefaultTemplate(selected.id);
    await refresh();
  });

  const handleUploadBackground = (file: File) => withBusy(async () => {
    const { file_url } = await uploadTemplateImage(file);
    const bg: ImageElement = { id: newId(), type: "image", x: 0, y: 0, w: page.w, h: page.h, imageUrl: file_url };
    setElements((prev) => [bg, ...prev]);
    setDirty(true);
  });

  const handleUploadElementImage = (file: File) => withBusy(async () => {
    const { file_url } = await uploadTemplateImage(file);
    patchElement({ imageUrl: file_url } as Partial<TemplateElement>);
  });

  const handlePreview = () => withBusy(async () => {
    const doc = await renderDocument({ id: "preview", name, docType, elements }, SAMPLE_DATA[docType]);
    window.open(doc.output("bloburl") as unknown as string, "_blank");
  });

  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <DashCard
        title="Card & slip designs"
        action={(
          <div className="flex gap-1">
            {DOC_TYPES.map((dt) => (
              <button
                key={dt} onClick={() => setDocType(dt)}
                className={`text-xs font-medium rounded-lg px-3 py-1.5 transition-colors ${docType === dt ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                {DOC_TYPE_LABEL[dt]}
              </button>
            ))}
          </div>
        )}
      >
        <p className="text-xs text-muted-foreground mb-3">
          Design the layout used when generating {DOC_TYPE_LABEL[docType].toLowerCase()}s. Changes only take effect once saved;
          the "Preview PDF" button is the accurate check - the canvas below is an approximation.
        </p>

        {error && <div className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2 mb-3">{error}</div>}

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <select
            className={`${inputClass} w-auto min-w-[200px]`}
            value={selectedTemplateId ?? ""}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
          >
            {(templates ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? " (default)" : ""}</option>)}
          </select>
          {canWrite && (
            <>
              <button className={btnClass} onClick={handleCreate} disabled={busy}><Plus className="w-3.5 h-3.5" /> New</button>
              <button className={btnClass} onClick={handleDuplicate} disabled={busy || !selected}><Copy className="w-3.5 h-3.5" /> Duplicate</button>
              <button className={btnClass} onClick={handleSetDefault} disabled={busy || !selected || selected.isDefault}><Star className="w-3.5 h-3.5" /> Set default</button>
              {!confirmingDelete ? (
                <button className={btnClass} onClick={() => setConfirmingDelete(true)} disabled={busy || !selected || selected.isDefault}>
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              ) : (
                <>
                  <button className={`${btnClass} text-destructive border-destructive/50`} onClick={handleDelete} disabled={busy}>Confirm delete?</button>
                  <button className={btnClass} onClick={() => setConfirmingDelete(false)} disabled={busy}>Cancel</button>
                </>
              )}
            </>
          )}
          <button className={btnClass} onClick={handlePreview} disabled={busy || elements.length === 0}><Eye className="w-3.5 h-3.5" /> Preview PDF</button>
          {canWrite && (
            <button className={`${btnClass} ml-auto`} onClick={handleSave} disabled={busy || !selected || !dirty}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
            </button>
          )}
        </div>

        {selected && (
          <label className="text-xs text-muted-foreground block mb-4 max-w-sm">Template name
            <input
              className={inputClass} value={name} disabled={!canWrite}
              onChange={(e) => { setName(e.target.value); setDirty(true); }}
            />
          </label>
        )}

        {!selected && <p className="text-sm text-muted-foreground py-8 text-center">No templates for {DOC_TYPE_LABEL[docType].toLowerCase()}s yet.</p>}

        {selected && (
          <div className="flex gap-4 flex-wrap items-start">
            <div>
              {canWrite && (
                <div className="flex gap-1 mb-2 flex-wrap">
                  {ELEMENT_TYPES.map((t) => (
                    <button key={t} className={btnClass} onClick={() => addElement(t)}>
                      <Plus className="w-3 h-3" /> {ELEMENT_TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              )}
              <div
                ref={canvasHostRef}
                onPointerDown={() => setSelectedElId(null)}
                className="relative bg-white border border-border rounded-lg shadow-sm overflow-hidden"
                style={{ width: CANVAS_WIDTH_PX, height: canvasHeightPx }}
              >
                {elements.map((el) => (
                  <ElementBox
                    key={el.id} el={el} pxPerMm={pxPerMm} selected={el.id === selectedElId} canWrite={canWrite}
                    onSelect={() => setSelectedElId(el.id)} onDrag={(mode) => startDrag(el.id, mode)}
                  />
                ))}
              </div>
            </div>

            <div className="flex-1 min-w-[260px]">
              {selectedEl ? (
                <DashCard title={`${ELEMENT_TYPE_LABEL[selectedEl.type]} properties`} className="p-4" action={canWrite && (
                  <button className="text-muted-foreground hover:text-destructive" onClick={removeSelected}><Trash2 className="w-3.5 h-3.5" /></button>
                )}>
                  {canWrite ? (
                    <PropertyPanel el={selectedEl} docType={docType} onChange={patchElement} onUploadImage={handleUploadElementImage} />
                  ) : (
                    <p className="text-xs text-muted-foreground">You don't have permission to edit templates.</p>
                  )}
                </DashCard>
              ) : (
                <p className="text-sm text-muted-foreground">Select an element to edit its properties, or add a new one.</p>
              )}

              {canWrite && (
                <label className={`${btnClass} cursor-pointer mt-3 w-fit`}>
                  <Upload className="w-3.5 h-3.5" /> Upload background image
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleUploadBackground(e.target.files[0])} />
                </label>
              )}
            </div>
          </div>
        )}
      </DashCard>
    </div>
  );
}
