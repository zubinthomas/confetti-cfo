import React, { useState } from "react";
import { X, Loader2 } from "lucide-react";
import FormField from "@/components/hr/FormField";
import { rescheduleReservation, type Reservation } from "@/api/reservationsApi";

/**
 * Move a booking to a new date / time / duration. Used both from the day view
 * (edit a booking in place) and from the guest register when a walk-in can't
 * be seated until a clashing booking is shifted.
 */
export default function ReservationRescheduleModal({
  reservation, title = "Reschedule booking", onClose, onSaved,
}: {
  reservation: Pick<Reservation, "id" | "date" | "time" | "durationMinutes" | "guestName" | "tableName">;
  title?: string;
  onClose: () => void;
  onSaved: (updated: Reservation) => void;
}) {
  const [form, setForm] = useState({
    date: reservation.date,
    time: reservation.time,
    durationMinutes: String(reservation.durationMinutes),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (name: string, value: string) => setForm((f) => ({ ...f, [name]: value }));

  const save = async () => {
    setError("");
    const durationMinutes = Number(form.durationMinutes);
    if (!durationMinutes || durationMinutes <= 0) { setError("Enter a valid duration"); return; }
    setSaving(true);
    try {
      const updated = await rescheduleReservation(reservation.id, {
        date: form.date, time: form.time, durationMinutes,
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reschedule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-sm">
        <div className="border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-xs text-muted-foreground">
            {reservation.guestName}{reservation.tableName ? ` · ${reservation.tableName}` : ""}
          </p>
          <FormField label="Date" name="date" type="date" value={form.date} onChange={update} />
          <FormField label="Time" name="time" type="time" value={form.time} onChange={update} />
          <FormField label="Duration (min)" name="durationMinutes" type="number" value={form.durationMinutes} onChange={update} />
        </div>
        {error && <p className="px-6 text-xs text-destructive -mt-2 mb-2">{error}</p>}
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving} className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}
