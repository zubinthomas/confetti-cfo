import React, { useState, useEffect } from "react";
import { X, Loader2, Plus } from "lucide-react";
import AreaSelect from "@/components/reservations/AreaSelect";
import FormField from "@/components/hr/FormField";
import {
  createReservation, canMergeTables,
  type ReservationLocation, type ReservationArea, type ReservationTable,
} from "@/api/reservationsApi";
import { istDateStr } from "@/lib/ist";

const todayStr = () => istDateStr();

const EMPTY_BOOKING = { areaId: "", tableId: "", date: todayStr(), time: "19:00", durationMinutes: "90", partySize: "2", guestName: "", guestPhone: "", guestEmail: "", notes: "" };

const seats = (t: ReservationTable) => t.capacity + t.maxExtraCapacity;

/** Books a future (or today's) reservation at a specific table - distinct
 *  from a walk-in sign-in, which starts unseated. Shared by the Day tab
 *  (ReservationsTab.tsx) and Floor View (RestaurantFloorView.tsx). A party
 *  too big for the anchor table alone can add more tables, the same
 *  merge-eligibility rule the walk-in "Join with another table" flow uses -
 *  both get reserved together, holding each other's slot. */
export default function BookingModal({ locations, areas, tables, defaultDate, onClose, onSaved }: {
  locations: ReservationLocation[]; areas: ReservationArea[]; tables: ReservationTable[]; defaultDate: string;
  onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({ ...EMPTY_BOOKING, date: defaultDate, areaId: areas.find((a) => tables.some((t) => t.areaId === a.id))?.id ?? areas[0]?.id ?? "" });
  const [extraTableIds, setExtraTableIds] = useState<string[]>([]);
  const [showExtra, setShowExtra] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const tablesForArea = tables.filter((t) => t.areaId === form.areaId);
  const anchorTable = tablesForArea.find((t) => t.id === form.tableId) ?? null;
  const extraTables = extraTableIds.map((id) => tables.find((t) => t.id === id)).filter((t): t is ReservationTable => t != null);
  const selectedSet = [anchorTable, ...extraTables].filter((t): t is ReservationTable => t != null);
  const combinedSeats = selectedSet.reduce((s, t) => s + seats(t), 0);
  const partySize = Number(form.partySize) || 0;
  const needsMore = anchorTable != null && partySize > seats(anchorTable);
  // Any other active table in the area that could join the current selection -
  // mutually mergeable with every table already picked, same N-way rule
  // GuestRegister.tsx's walk-in merge picker uses.
  const mergeCandidates = anchorTable
    ? tablesForArea.filter((t) => !selectedSet.some((s) => s.id === t.id) && selectedSet.every((s) => canMergeTables(s, t)))
    : [];

  useEffect(() => {
    if (!tablesForArea.some((t) => t.id === form.tableId)) {
      setForm((f) => ({ ...f, tableId: tablesForArea[0]?.id ?? "" }));
    }
    setExtraTableIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.areaId]);

  useEffect(() => {
    if (needsMore) setShowExtra(true);
  }, [needsMore]);

  const update = (name: string, value: string) => setForm((f) => ({ ...f, [name]: value }));
  const toggleExtra = (id: string) => setExtraTableIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const save = async () => {
    setError("");
    if (!form.tableId) { setError("Pick a table"); return; }
    if (!form.guestName.trim()) { setError("Guest name is required"); return; }
    const partySize = Number(form.partySize);
    const durationMinutes = Number(form.durationMinutes);
    if (!partySize || partySize <= 0) { setError("Enter a valid party size"); return; }
    if (partySize > combinedSeats) { setError(`That seats up to ${combinedSeats} - add another table or reduce the party`); return; }
    setSaving(true);
    try {
      await createReservation({
        tableIds: [form.tableId, ...extraTableIds], date: form.date, time: form.time, durationMinutes, partySize,
        guestName: form.guestName.trim(), guestPhone: form.guestPhone.trim() || undefined,
        guestEmail: form.guestEmail.trim() || undefined, notes: form.notes.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create reservation");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">New Reservation</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Area *</label>
            <AreaSelect
              value={form.areaId} onChange={(id) => update("areaId", id)}
              locations={locations} areas={areas}
              className="w-full text-base sm:text-sm border border-border rounded-lg px-3 py-2 max-sm:min-h-11 bg-background text-foreground"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Table *</label>
            <select
              value={form.tableId} onChange={(e) => update("tableId", e.target.value)}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground"
            >
              {tablesForArea.length === 0 && <option value="">No tables in this area</option>}
              {tablesForArea.map((t) => <option key={t.id} value={t.id}>{t.name} (seats {t.capacity})</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            {!showExtra ? (
              anchorTable && (
                <button
                  type="button" onClick={() => setShowExtra(true)}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Need more seats? Add another table
                </button>
              )
            ) : (
              <div className="border border-border rounded-lg p-3 space-y-2">
                <div className="text-xs text-muted-foreground">
                  Seats {combinedSeats}{partySize > 0 && ` of ${partySize} needed`} across {selectedSet.length} table{selectedSet.length === 1 ? "" : "s"}
                </div>
                {mergeCandidates.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No other tables here are set up to merge with this selection. Set merge targets in Locations and Tables.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {mergeCandidates.map((t) => (
                      <label key={t.id} className="flex items-center gap-1.5 text-xs border border-border rounded-full px-2.5 py-1 cursor-pointer hover:bg-muted">
                        <input type="checkbox" checked={extraTableIds.includes(t.id)} onChange={() => toggleExtra(t.id)} />
                        {t.name} (seats {seats(t)})
                      </label>
                    ))}
                  </div>
                )}
                {!needsMore && extraTableIds.length === 0 && (
                  <button type="button" onClick={() => setShowExtra(false)} className="text-xs text-muted-foreground hover:underline">
                    Never mind
                  </button>
                )}
              </div>
            )}
          </div>
          <FormField label="Date *" name="date" type="date" value={form.date} onChange={update} />
          <FormField label="Time *" name="time" type="time" value={form.time} onChange={update} />
          <FormField label="Duration (min)" name="durationMinutes" type="number" value={form.durationMinutes} onChange={update} />
          <FormField label="Party Size *" name="partySize" type="number" value={form.partySize} onChange={update} />
          <FormField label="Guest Name *" name="guestName" value={form.guestName} onChange={update} />
          <FormField label="Guest Phone" name="guestPhone" value={form.guestPhone} onChange={update} />
          <div className="sm:col-span-2"><FormField label="Guest Email" name="guestEmail" value={form.guestEmail} onChange={update} /></div>
          <div className="sm:col-span-2"><FormField label="Notes" name="notes" value={form.notes} onChange={update} /></div>
        </div>
        {error && <p className="px-6 text-xs text-destructive -mt-2 mb-2">{error}</p>}
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Book
          </button>
        </div>
      </div>
    </div>
  );
}
