import React from "react";
import { X, Loader2 } from "lucide-react";

/** Generic chrome (title/Cancel/Save/error) for the catalog's small single-
 *  purpose modals (location/area/table). Pulled out of ReservationsTab so
 *  other pages (e.g. Floor View) can build their own modals on top of it. */
export default function ModalShell({ title, onClose, onSave, saving, error, children }: {
  title: string; onClose: () => void; onSave: () => void; saving: boolean; error: string; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl border border-border w-full max-w-sm">
        <div className="border-b border-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="max-sm:p-2 max-sm:-mr-2"><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <div className="p-6 space-y-4">{children}</div>
        {error && <p className="px-6 text-xs text-destructive -mt-2 mb-2">{error}</p>}
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button onClick={onClose} className="text-sm px-4 py-2 max-sm:min-h-11 rounded-lg border border-border text-muted-foreground hover:bg-muted">Cancel</button>
          <button onClick={onSave} disabled={saving} className="text-sm px-4 py-2 max-sm:min-h-11 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}
