import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import FormField from "@/components/hr/FormField";
import { useAuth } from "@/lib/AuthContext";
import { useExceptionAssignments } from "@/hooks/useExceptionAssignments";
import { assignException } from "@/api/exceptionsApi";
import { listUsers, type UserListItem } from "@/api/usersApi";

// Owner/deadline/note for one named recurring exception (Section 2's "red/
// amber exceptions carry a reason, owner, deadline, and action" - scoped to
// Leadership Command Centre's three go-fix-it items, see
// LeadershipCommandCentre.tsx). A real assignable record, not just a link -
// see exception_assignments in schema.ts. Read-only display without
// ExceptionAssignment:write; the inline edit form is gated on it.
export default function ExceptionAssignmentPanel({ exceptionKey }: { exceptionKey: string }) {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canWrite = can("ExceptionAssignment", "write");
  const { data: assignments } = useExceptionAssignments();
  const current = assignments?.find((a) => a.exceptionKey === exceptionKey) ?? null;

  const [users, setUsers] = useState<UserListItem[] | null>(null);
  const [ownerUserId, setOwnerUserId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const openForm = () => {
    setOwnerUserId(current?.ownerUserId != null ? String(current.ownerUserId) : "");
    setDeadline(current?.deadline ?? "");
    setNote(current?.note ?? "");
    setError("");
    if (!users) {
      listUsers().then(setUsers).catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }
  };

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      await assignException(exceptionKey, {
        ownerUserId: ownerUserId ? Number(ownerUserId) : null,
        deadline: deadline || null,
        note: note || null,
      });
      queryClient.invalidateQueries({ queryKey: ["exception-assignments"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const userOptions = users?.map((u) => ({ value: String(u.id), label: u.fullName || u.email })) ?? [];

  return (
    <div className="flex items-center gap-2 text-xs flex-wrap">
      {current && (current.ownerName || current.ownerEmail || current.deadline || current.note) ? (
        <span className="text-muted-foreground">
          {(current.ownerName || current.ownerEmail) && <>Owner: <span className="text-foreground">{current.ownerName || current.ownerEmail}</span></>}
          {current.deadline && <> · Due <span className="text-foreground">{new Date(current.deadline).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span></>}
          {current.note && <> · {current.note}</>}
        </span>
      ) : (
        <span className="text-muted-foreground">No owner assigned</span>
      )}

      {canWrite && (
        <Popover onOpenChange={(open) => { if (open) openForm(); }}>
          <PopoverTrigger asChild>
            <button type="button" className="text-muted-foreground hover:text-foreground underline shrink-0">
              {current ? "Edit" : "Assign"}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 text-sm" align="start">
            <p className="text-xs font-medium text-popover-foreground mb-2">Assign owner</p>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Owner</label>
                <select
                  value={ownerUserId}
                  onChange={(e) => setOwnerUserId(e.target.value)}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Unassigned</option>
                  {userOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <FormField label="Deadline" name="deadline" type="date" value={deadline} onChange={(_, v) => setDeadline(v)} />
              <FormField label="Note (optional)" name="note" value={note} onChange={(_, v) => setNote(v)} />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <button
                type="button" onClick={submit} disabled={saving}
                className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
              >
                {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                Save
              </button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
