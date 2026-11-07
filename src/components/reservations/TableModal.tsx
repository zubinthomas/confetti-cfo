import React, { useState } from "react";
import { createTable, updateTable, type ReservationTable } from "@/api/reservationsApi";
import { X, Loader2 } from "lucide-react";
import FormField from "@/components/hr/FormField";

export default function TableModal({
  table, tables, areaId, areaName, canDelete = false, onArchive, onClose, onSaved,
}: {
  table: ReservationTable | null; tables: ReservationTable[];
  areaId: string; areaName: string;
  /** Restaurant:delete. With it, editing an existing table offers Archive. */
  canDelete?: boolean; onArchive?: () => void;
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: table?.name ?? "", type: table?.type ?? "",
    capacity: String(table?.capacity ?? ""),
    maxExtraCapacity: String(table?.maxExtraCapacity ?? "0"),
    freeMerge: table?.freeMerge ?? false,
    mergeableWith: (table?.mergeableWith ?? []) as string[],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (name: string, value: string) => setForm((f) => ({ ...f, [name]: value }));
  const toggleMergeWith = (id: string) => setForm((f) => ({
    ...f,
    mergeableWith: f.mergeableWith.includes(id)
      ? f.mergeableWith.filter((x) => x !== id)
      : [...f.mergeableWith, id],
  }));

  const siblings = tables.filter((t) => t.areaId === areaId && t.id !== table?.id);

  const save = async () => {
    setError("");
    const capacity = Number(form.capacity);
    if (!capacity || capacity <= 0) { setError("Enter a valid capacity"); return; }
    const maxExtraCapacity = Number(form.maxExtraCapacity) || 0;
    if (maxExtraCapacity < 0) { setError("Extra capacity can't be negative"); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(), type: form.type.trim() || null, capacity, maxExtraCapacity,
        freeMerge: form.freeMerge,
        // kept even when free merge is on (the list is only hidden), so turning
        // free merge back off later doesn't silently drop the pairings
        mergeableWith: form.mergeableWith,
      };
      if (table) await updateTable(table.id, payload);
      else await createTable({ areaId, ...payload });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save table");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{table ? "Edit Table" : `Add Table · ${areaName}`}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-6 space-y-4">
          <FormField label="Name *" name="name" value={form.name} onChange={update} placeholder="e.g. Table 4" />
          <FormField label="Type" name="type" value={form.type} onChange={update} placeholder="e.g. Standard, Booth, Chef's Table" />
          <FormField label="Capacity (seats) *" name="capacity" type="number" value={form.capacity} onChange={update} />
          <FormField label="Max extra capacity" name="maxExtraCapacity" type="number" value={form.maxExtraCapacity} onChange={update} />
          <p className="text-xs text-muted-foreground -mt-2">Overflow seats the floor can squeeze on when friends join a full party. Default 0.</p>
          <div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={form.freeMerge} onChange={(e) => setForm((f) => ({ ...f, freeMerge: e.target.checked }))} />
              Free merge
            </label>
            <p className="text-xs text-muted-foreground mt-1">
              No fixed list. This table can join any other free-merge table in {areaName}. The other table still has to allow it.
            </p>
          </div>
          {!form.freeMerge && (
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Can be merged with</span>
              {siblings.length === 0 ? (
                <p className="text-xs text-muted-foreground">No other tables in {areaName} yet.</p>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1 border border-border rounded-lg p-2">
                  {siblings.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input type="checkbox" checked={form.mergeableWith.includes(t.id)} onChange={() => toggleMergeWith(t.id)} />
                      {t.name}{t.freeMerge ? " · free merge" : ""}
                    </label>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Reciprocal - the other table lists this one too. A 3-way merge needs every pair linked.
              </p>
            </div>
          )}
        </div>
        {error && <p className="px-6 text-xs text-destructive -mt-2 mb-2">{error}</p>}
        <div className="px-6 pb-6 flex items-center gap-3">
          {table && canDelete && onArchive && (
            <button onClick={onArchive} className="text-sm px-4 py-2 rounded-lg text-destructive hover:bg-destructive/10 mr-auto">Archive</button>
          )}
          <span className="flex gap-3 ml-auto">
            <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted">Cancel</button>
            <button onClick={save} disabled={saving} className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}
