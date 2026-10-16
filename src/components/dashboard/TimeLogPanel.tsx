import React, { useState } from "react";
import { Loader2, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import FormField from "@/components/hr/FormField";
import { useAuth } from "@/lib/AuthContext";
import { listTimeLog, addTimeLogEntry, deleteTimeLogEntry } from "@/api/timeLogApi";

// Monthly budget from the spec's own cadence (section 11: 60h/month,
// October-December 2026) - not configurable per month, since the spec names
// the same figure for every month. If that ever changes, this is the one
// place to edit.
const MONTHLY_BUDGET_HOURS = 60;

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Execution-hours tracker against the spec's 60h/month delivery budget
// (section 11 of the gap analysis) - the doc's own finding was that this
// needs a direct log, not something inferable from commit history. Lives on
// the Roadmap page since that board was already named as the natural home
// for tracking delivery against the plan.
export default function TimeLogPanel() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canWrite = can("TimeLog", "write");
  const canDelete = can("TimeLog", "delete");

  const [month, setMonth] = useState(() => todayStr().slice(0, 7));
  const [date, setDate] = useState(todayStr());
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { data: entries, isLoading, isError } = useQuery({
    queryKey: ["time-log", month],
    queryFn: () => listTimeLog(month),
    retry: false,
  });

  // A user without TimeLog:read (e.g. a scoped role with no reason to see
  // billing hours) gets a 403 here - fail quiet rather than show a scary
  // error on a board every authenticated user can otherwise open.
  if (isError) return null;

  const totalHours = entries?.reduce((sum, e) => sum + e.hours, 0) ?? 0;
  const pct = Math.min(100, (totalHours / MONTHLY_BUDGET_HOURS) * 100);

  const submit = async () => {
    const h = Number(hours);
    if (!date || !Number.isFinite(h) || h <= 0) { setError("Enter a date and a positive number of hours"); return; }
    setSaving(true);
    setError("");
    try {
      await addTimeLogEntry({ date, hours: h, note: note || undefined });
      setHours("");
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["time-log"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await deleteTimeLogEntry(id);
      queryClient.invalidateQueries({ queryKey: ["time-log"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="bg-card rounded-xl border border-border p-4 mb-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2">
          <button
            type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h3 className="text-sm font-semibold font-heading text-foreground w-36 text-center">
            {monthLabel(month)}
          </h3>
          <button
            type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <span className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{totalHours.toFixed(1)}h</span> / {MONTHLY_BUDGET_HOURS}h logged
        </span>
      </div>

      <div className="h-2 rounded-full bg-muted overflow-hidden mb-4">
        <div
          className={`h-full rounded-full ${totalHours > MONTHLY_BUDGET_HOURS ? "bg-amber-500" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      {!isLoading && (!entries || entries.length === 0) && (
        <p className="text-xs text-muted-foreground mb-3">No hours logged for this month yet.</p>
      )}
      {!isLoading && entries && entries.length > 0 && (
        <ul className="space-y-1 mb-3 max-h-40 overflow-y-auto">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between text-xs py-1 border-b border-border last:border-0">
              <span className="text-muted-foreground">
                {new Date(e.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                {" - "}
                <span className="text-foreground font-medium">{e.hours}h</span>
                {e.note && ` - ${e.note}`}
                {(e.createdByName || e.createdByEmail) && (
                  <span className="text-muted-foreground/70"> ({e.createdByName || e.createdByEmail})</span>
                )}
              </span>
              {canDelete && (
                <button type="button" onClick={() => remove(e.id)} className="text-muted-foreground hover:text-destructive shrink-0 ml-2">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canWrite && (
        <div className="flex items-end gap-2 flex-wrap pt-2 border-t border-border">
          <div className="w-36"><FormField label="Date" name="date" type="date" value={date} onChange={(_, v) => setDate(v)} /></div>
          <div className="w-24"><FormField label="Hours" name="hours" type="number" value={hours} onChange={(_, v) => setHours(v)} /></div>
          <div className="flex-1 min-w-32"><FormField label="Note (optional)" name="note" value={note} onChange={(_, v) => setNote(v)} /></div>
          <button
            type="button" onClick={submit} disabled={saving}
            className="text-xs px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5 h-[38px]"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            Log hours
          </button>
        </div>
      )}
      {error && <p className="text-xs text-destructive mt-2">{error}</p>}
    </div>
  );
}
