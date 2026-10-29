// "Menu" tab: the sections and items guests see under Browse menu on the
// check-in page. A section can belong to one area or show everywhere.
import React, { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Archive, ArchiveRestore, Loader2, Pencil, Plus, Trash2, Eye, EyeOff } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  listMenu, createMenuSection, updateMenuSection, deleteMenuSection, reorderMenuSections,
  createMenuItem, updateMenuItem, deleteMenuItem, reorderMenuItems, type MenuSection, type MenuItem,
} from "@/api/checkinAdminApi";
import { areaLabel, type ReservationArea } from "@/api/reservationsApi";
import { rupees } from "@/lib/checkin";

const field = "text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground";
const iconBtn = "p-1.5 rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30";

function move<T extends { id: string }>(list: T[], id: string, by: -1 | 1): string[] {
  const ids = list.map((x) => x.id);
  const i = ids.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids;
}

export default function MenuManager({ areas, canWrite, canDelete }: {
  areas: ReservationArea[]; canWrite: boolean; canDelete: boolean;
}) {
  const [sections, setSections] = useState<MenuSection[] | null>(null);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [newArea, setNewArea] = useState("");
  const [editing, setEditing] = useState<string | null>(null); // section id being renamed
  const [editName, setEditName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { name: string; description: string; price: string }>>({});
  const [itemEdit, setItemEdit] = useState<{ id: string; name: string; description: string; price: string } | null>(null);
  const [toDelete, setToDelete] = useState<{ kind: "section" | "item"; id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setSections(await listMenu()); } catch (e) { setError(e instanceof Error ? e.message : "Failed to load the menu"); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setError(""); setBusy(true);
    try { await fn(); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  };

  const areaName = (id: string | null) => {
    const a = areas.find((x) => x.id === id);
    return a ? areaLabel(a) : "All areas";
  };
  const draft = (id: string) => drafts[id] ?? { name: "", description: "", price: "" };
  const setDraft = (id: string, patch: Partial<{ name: string; description: string; price: string }>) =>
    setDrafts((d) => ({ ...d, [id]: { ...draft(id), ...patch } }));

  const addItem = (s: MenuSection) => {
    const d = draft(s.id);
    return act(async () => {
      await createMenuItem(s.id, { name: d.name, description: d.description, priceInr: Number(d.price) });
      setDrafts((all) => ({ ...all, [s.id]: { name: "", description: "", price: "" } }));
    });
  };

  const confirmDelete = () => toDelete && act(async () => {
    await (toDelete.kind === "section" ? deleteMenuSection(toDelete.id) : deleteMenuItem(toDelete.id));
    setToDelete(null);
  });

  if (!sections) return error ? <p className="text-sm text-destructive">{error}</p> : <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;

  const saveItem = () => itemEdit && act(async () => {
    await updateMenuItem(itemEdit.id, { name: itemEdit.name, description: itemEdit.description, priceInr: Number(itemEdit.price) });
    setItemEdit(null);
  });

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {canWrite && (
        <DashCard title="Add a section">
          <div className="flex flex-wrap gap-2">
            <input className={`${field} flex-1 min-w-40`} placeholder="Hot drinks" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <select className={field} value={newArea} onChange={(e) => setNewArea(e.target.value)}>
              <option value="">All areas</option>
              {areas.filter((a) => !a.archivedAt).map((a) => <option key={a.id} value={a.id}>{areaLabel(a)}</option>)}
            </select>
            <button
              disabled={busy || !newName.trim()}
              onClick={() => act(async () => { await createMenuSection({ name: newName, areaId: newArea || null }); setNewName(""); })}
              className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
            ><Plus className="w-4 h-4" /> Add</button>
          </div>
        </DashCard>
      )}

      {sections.length === 0 && <p className="text-sm text-muted-foreground">No menu yet. Add a section, then its items.</p>}

      {sections.map((s) => {
        const d = draft(s.id);
        return (
          <DashCard
            key={s.id}
            className={s.archivedAt ? "opacity-60" : ""}
            title={
              editing === s.id ? (
                <span className="flex gap-2">
                  <input className={field} value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
                  <button className="text-sm px-3 rounded-lg bg-primary text-primary-foreground" disabled={busy}
                    onClick={() => act(async () => { await updateMenuSection(s.id, { name: editName }); setEditing(null); })}>Save</button>
                </span>
              ) : <>{s.name}{s.archivedAt && <span className="text-xs text-muted-foreground font-normal"> (archived)</span>}</>
            }
            action={canWrite && (
              <>
                <select className={`${field} py-1`} value={s.areaId ?? ""} disabled={busy}
                  onChange={(e) => act(() => updateMenuSection(s.id, { areaId: e.target.value || null }))} aria-label="Show in">
                  <option value="">All areas</option>
                  {areas.filter((a) => !a.archivedAt || a.id === s.areaId).map((a) => <option key={a.id} value={a.id}>{areaLabel(a)}</option>)}
                </select>
                <button className={iconBtn} aria-label="Move up" disabled={busy} onClick={() => act(() => reorderMenuSections(move(sections, s.id, -1)))}><ArrowUp className="w-4 h-4" /></button>
                <button className={iconBtn} aria-label="Move down" disabled={busy} onClick={() => act(() => reorderMenuSections(move(sections, s.id, 1)))}><ArrowDown className="w-4 h-4" /></button>
                <button className={iconBtn} aria-label="Rename section" onClick={() => { setEditing(s.id); setEditName(s.name); }}><Pencil className="w-4 h-4" /></button>
                <button className={iconBtn} aria-label={s.archivedAt ? "Restore section" : "Archive section"} disabled={busy}
                  onClick={() => act(() => updateMenuSection(s.id, { archived: !s.archivedAt }))}>
                  {s.archivedAt ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                </button>
                {canDelete && <button className={`${iconBtn} text-destructive`} aria-label="Delete section" onClick={() => setToDelete({ kind: "section", id: s.id, name: s.name })}><Trash2 className="w-4 h-4" /></button>}
              </>
            )}
          >
            <p className="text-xs text-muted-foreground mb-2">Shown in: {areaName(s.areaId)}</p>
            <div className="divide-y divide-border">
              {s.items.length === 0 && <p className="text-sm text-muted-foreground py-2">No items.</p>}
              {s.items.map((i: MenuItem) => (
                <div key={i.id} className={`py-2 flex items-center gap-2 ${i.available ? "" : "opacity-50"}`}>
                  {itemEdit?.id === i.id ? (
                    <>
                      <input className={`${field} flex-1 min-w-0`} value={itemEdit.name} onChange={(e) => setItemEdit({ ...itemEdit, name: e.target.value })} />
                      <input className={`${field} flex-1 min-w-0`} value={itemEdit.description} placeholder="Description" onChange={(e) => setItemEdit({ ...itemEdit, description: e.target.value })} />
                      <input className={`${field} w-24`} type="number" min={0} value={itemEdit.price} onChange={(e) => setItemEdit({ ...itemEdit, price: e.target.value })} />
                      <button className="text-sm px-3 py-2 rounded-lg bg-primary text-primary-foreground" disabled={busy} onClick={saveItem}>Save</button>
                      <button className="text-sm px-3 py-2 rounded-lg border border-border" onClick={() => setItemEdit(null)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-foreground truncate">{i.name}{!i.available && <span className="text-xs text-muted-foreground"> (hidden)</span>}</div>
                        {i.description && <div className="text-xs text-muted-foreground truncate">{i.description}</div>}
                      </div>
                      <span className="text-sm text-foreground whitespace-nowrap">{rupees(i.priceInr)}</span>
                      {canWrite && (
                        <>
                          <button className={iconBtn} aria-label="Move item up" disabled={busy} onClick={() => act(() => reorderMenuItems(move(s.items, i.id, -1)))}><ArrowUp className="w-4 h-4" /></button>
                          <button className={iconBtn} aria-label="Move item down" disabled={busy} onClick={() => act(() => reorderMenuItems(move(s.items, i.id, 1)))}><ArrowDown className="w-4 h-4" /></button>
                          <button className={iconBtn} aria-label={i.available ? "Hide item" : "Show item"} disabled={busy} onClick={() => act(() => updateMenuItem(i.id, { available: !i.available }))}>
                            {i.available ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                          </button>
                          <button className={iconBtn} aria-label="Edit item" onClick={() => setItemEdit({ id: i.id, name: i.name, description: i.description ?? "", price: String(i.priceInr) })}><Pencil className="w-4 h-4" /></button>
                        </>
                      )}
                      {canDelete && <button className={`${iconBtn} text-destructive`} aria-label="Delete item" onClick={() => setToDelete({ kind: "item", id: i.id, name: i.name })}><Trash2 className="w-4 h-4" /></button>}
                    </>
                  )}
                </div>
              ))}
            </div>
            {canWrite && (
              <div className="mt-3 flex flex-wrap gap-2">
                <input className={`${field} flex-1 min-w-32`} placeholder="Item" value={d.name} onChange={(e) => setDraft(s.id, { name: e.target.value })} />
                <input className={`${field} flex-1 min-w-32`} placeholder="Description (optional)" value={d.description} onChange={(e) => setDraft(s.id, { description: e.target.value })} />
                <input className={`${field} w-24`} type="number" min={0} placeholder="Price" value={d.price} onChange={(e) => setDraft(s.id, { price: e.target.value })} />
                <button disabled={busy || !d.name.trim() || d.price === ""} onClick={() => addItem(s)}
                  className="text-sm px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
                  <Plus className="w-4 h-4" /> Add item
                </button>
              </div>
            )}
          </DashCard>
        );
      })}

      <ConfirmDialog
        open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}
        title={toDelete?.kind === "section" ? `Delete "${toDelete.name}"?` : `Delete "${toDelete?.name}"?`}
        description={toDelete?.kind === "section" ? "The section and all its items are removed. Archive it instead to keep them." : "This item is removed from the menu."}
        confirmLabel="Delete" destructive loading={busy} onConfirm={confirmDelete}
      />
    </div>
  );
}
