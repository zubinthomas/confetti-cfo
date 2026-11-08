import React, { useState } from "react";
import { createArea, updateArea, type ReservationArea } from "@/api/reservationsApi";
import FormField from "@/components/hr/FormField";
import ModalShell from "@/components/reservations/ModalShell";

/** Create or edit an area within a known location. Pulled out of
 *  ReservationsTab so Floor View can also offer "add area" without
 *  duplicating the form. The caller always already knows the location -
 *  this has no location picker of its own. */
export default function AreaModal({ area, locationId, locationName, onClose, onSaved }: {
  area: ReservationArea | null; locationId: string; locationName: string;
  onClose: () => void; onSaved: (area: ReservationArea) => void;
}) {
  const [form, setForm] = useState({ name: area?.name ?? "", floor: area?.floor ?? "", type: area?.type ?? "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (name: string, value: string) => setForm((f) => ({ ...f, [name]: value }));

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const payload = { name: form.name.trim(), floor: form.floor.trim() || null, type: form.type.trim() || null };
      const saved = area ? await updateArea(area.id, payload) : await createArea({ locationId, ...payload });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save area");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={area ? "Edit Area" : `Add Area · ${locationName}`} onClose={onClose} onSave={save} saving={saving} error={error}>
      <FormField label="Name *" name="name" value={form.name} onChange={update} placeholder="e.g. Cafe, Restaurant, Bar" />
      <FormField label="Floor" name="floor" value={form.floor} onChange={update} placeholder="e.g. Ground Floor (leave empty if the area is its own floor)" />
      <FormField label="Type" name="type" value={form.type} onChange={update} placeholder="e.g. Dine-in" />
    </ModalShell>
  );
}
