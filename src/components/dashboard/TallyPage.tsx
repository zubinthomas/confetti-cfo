import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DashCard from "./DashCard";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  listTallySources, createTallySource, updateTallySource, rotateTallySourceKey, deleteTallySource,
  listTallyMappings, updateTallyMapping, importTallyMappings,
  type TallySource, type TallySyncMode, type TallyLedgerMapping,
} from "@/api/tallyApi";
import { useReferenceData } from "@/hooks/useReferenceData";
import { useAuth } from "@/lib/AuthContext";
import {
  Plus, Loader2, KeyRound, Copy, Check, Trash2, Upload, Search,
  ChevronLeft, ChevronRight,
} from "lucide-react";

const SYNC_MODE_LABELS: Record<TallySyncMode, string> = {
  auto: "Auto",
  manual: "Manual review",
  paused: "Paused",
};

const SYNC_STATUS_CHIP: Record<NonNullable<TallySource["lastSyncStatus"]>, { label: string; cls: string }> = {
  preview_created: { label: "preview ready", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  auto_committed: { label: "auto-committed", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  no_changes: { label: "no changes", cls: "bg-muted text-muted-foreground" },
  error: { label: "error", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

function NewApiKeyBanner({ apiKey, onDismiss }: { apiKey: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (permissions/non-secure context) - the key is
      // still selectable text in the box below, so this isn't fatal.
    }
  };
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3">
      <p className="text-sm font-medium text-amber-900 dark:text-amber-200 mb-2">
        Copy this API key now - it won&apos;t be shown again.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs bg-background border border-border rounded px-2 py-1.5 overflow-x-auto">
          {apiKey}
        </code>
        <button
          onClick={copy} title="Copy"
          className="p-1.5 rounded-lg border border-border hover:bg-muted shrink-0"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-amber-800 dark:text-amber-300">
          Put it in the agent&apos;s <code>config.toml</code> as <code>api_key</code>.
        </p>
        <button onClick={onDismiss} className="text-xs text-muted-foreground underline shrink-0">Done</button>
      </div>
    </div>
  );
}

/** Gateway URL / company name are optional overrides - the agent falls back
 *  to its local config.toml when either is unset. Committed on blur (not
 *  onChange like the interval input) so typing doesn't fire a PATCH per
 *  keystroke. */
function AgentConfigFields({
  source, disabled, onSave,
}: {
  source: TallySource;
  disabled: boolean;
  onSave: (patch: { tallyGatewayUrl?: string | null; tallyCompanyName?: string | null }) => void;
}) {
  const [gatewayUrl, setGatewayUrl] = useState(source.tallyGatewayUrl ?? "");
  const [companyName, setCompanyName] = useState(source.tallyCompanyName ?? "");
  useEffect(() => { setGatewayUrl(source.tallyGatewayUrl ?? ""); }, [source.tallyGatewayUrl]);
  useEffect(() => { setCompanyName(source.tallyCompanyName ?? ""); }, [source.tallyCompanyName]);

  return (
    <div className="flex flex-wrap items-center gap-2 mt-1.5" onClick={(e) => e.stopPropagation()}>
      <input
        type="text" value={gatewayUrl} disabled={disabled}
        onChange={(e) => setGatewayUrl(e.target.value)}
        onBlur={() => {
          if (gatewayUrl.trim() !== (source.tallyGatewayUrl ?? "")) {
            onSave({ tallyGatewayUrl: gatewayUrl.trim() || null });
          }
        }}
        placeholder="Gateway URL (or set locally)"
        title="Overrides the agent's local config.toml gateway URL when set, e.g. http://localhost:9001"
        className="px-2 py-1 rounded-lg border border-border bg-background text-xs w-56 disabled:opacity-50"
      />
      <input
        type="text" value={companyName} disabled={disabled}
        onChange={(e) => setCompanyName(e.target.value)}
        onBlur={() => {
          if (companyName.trim() !== (source.tallyCompanyName ?? "")) {
            onSave({ tallyCompanyName: companyName.trim() || null });
          }
        }}
        placeholder="Company name (optional)"
        title="Only needed with more than one company loaded in Tally"
        className="px-2 py-1 rounded-lg border border-border bg-background text-xs w-48 disabled:opacity-50"
      />
    </div>
  );
}

function SourcesCard({
  sources, refresh, selectedId, onSelect, canWrite, canDelete,
}: {
  sources: TallySource[];
  refresh: () => void;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  canWrite: boolean;
  canDelete: boolean;
}) {
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<TallySource | null>(null);
  const [removing, setRemoving] = useState(false);

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    setAdding(true);
    setError("");
    try {
      const { source, apiKey } = await createTallySource(label.trim());
      setLabel("");
      setNewKey(apiKey);
      refresh();
      onSelect(source.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create source");
    } finally {
      setAdding(false);
    }
  };

  const onRotate = async (id: number) => {
    setBusyId(id);
    setError("");
    try {
      const { apiKey } = await rotateTallySourceKey(id);
      setNewKey(apiKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rotate key");
    } finally {
      setBusyId(null);
    }
  };

  const onModeChange = async (s: TallySource, syncMode: TallySyncMode) => {
    setBusyId(s.id);
    try { await updateTallySource(s.id, { syncMode }); refresh(); } finally { setBusyId(null); }
  };

  const onIntervalChange = async (s: TallySource, syncIntervalMinutes: number) => {
    setBusyId(s.id);
    try { await updateTallySource(s.id, { syncIntervalMinutes }); refresh(); } finally { setBusyId(null); }
  };

  const onAgentConfigSave = async (
    s: TallySource,
    patch: { tallyGatewayUrl?: string | null; tallyCompanyName?: string | null },
  ) => {
    setBusyId(s.id);
    try { await updateTallySource(s.id, patch); refresh(); } finally { setBusyId(null); }
  };

  const onRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await deleteTallySource(removeTarget.id);
      if (selectedId === removeTarget.id) onSelect(null);
      setRemoveTarget(null);
      refresh();
    } finally {
      setRemoving(false);
    }
  };

  return (
    <DashCard title="Tally sources">
      {canWrite && (
        <form onSubmit={onAdd} className="flex flex-col sm:flex-row gap-2 mb-4">
          <input
            type="text" value={label} onChange={(e) => setLabel(e.target.value)} disabled={adding}
            placeholder='Label, e.g. "Hindustan Park office"'
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
          />
          <button
            type="submit" disabled={adding || !label.trim()}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {adding ? "Creating…" : "New source"}
          </button>
        </form>
      )}
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {newKey && (
        <div className="mb-4">
          <NewApiKeyBanner apiKey={newKey} onDismiss={() => setNewKey(null)} />
        </div>
      )}

      {sources.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No Tally sources yet. Create one, then put its API key in the agent&apos;s config.
        </p>
      ) : (
        <div className="divide-y divide-border border-t border-border">
          {sources.map((s) => (
            <div
              key={s.id}
              className={`py-2.5 px-2 -mx-2 rounded-lg cursor-pointer ${selectedId === s.id ? "bg-muted/60" : "hover:bg-muted/30"}`}
              onClick={() => onSelect(s.id)}
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{s.label}</span>
                    {s.syncMode === "paused" && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        paused
                      </span>
                    )}
                    {s.syncMode === "auto" && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        auto
                      </span>
                    )}
                    {s.lastSyncStatus && (
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${SYNC_STATUS_CHIP[s.lastSyncStatus].cls}`}>
                        {SYNC_STATUS_CHIP[s.lastSyncStatus].label}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {s.lastSyncAt ? `Last synced ${new Date(s.lastSyncAt).toLocaleString()}` : "Not synced yet"}
                    {s.lastSeenAt && ` · agent last seen ${new Date(s.lastSeenAt).toLocaleString()}`}
                    {s.lastSyncStatus === "error" && s.lastSyncError && (
                      <span className="text-red-500"> - {s.lastSyncError}</span>
                    )}
                  </p>
                  {canWrite && (
                    <AgentConfigFields
                      source={s} disabled={busyId === s.id}
                      onSave={(patch) => onAgentConfigSave(s, patch)}
                    />
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {canWrite && (
                    <>
                      <input
                        type="number" min={1} value={s.syncIntervalMinutes} disabled={busyId === s.id}
                        onChange={(e) => onIntervalChange(s, Math.max(1, Number(e.target.value) || 1))}
                        title="Sync every N minutes"
                        className="w-16 px-2 py-1.5 rounded-lg border border-border bg-background text-xs disabled:opacity-50"
                      />
                      <select
                        value={s.syncMode} disabled={busyId === s.id}
                        onChange={(e) => onModeChange(s, e.target.value as TallySyncMode)}
                        title="Auto: commit pushes with no warnings or errors. Manual review: you commit previews. Paused: agent pushes are skipped."
                        className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs disabled:opacity-50"
                      >
                        {Object.entries(SYNC_MODE_LABELS).map(([mode, l]) => (
                          <option key={mode} value={mode}>{l}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => onRotate(s.id)} disabled={busyId === s.id} title="Rotate API key"
                        className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => setRemoveTarget(s)} disabled={busyId === s.id} title="Remove"
                      className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-red-500 disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}
        title="Remove this Tally source?"
        description={removeTarget ? `"${removeTarget.label}" and its ledger mappings will be deleted, and its API key stops working immediately. Already-committed batches are kept.` : ""}
        confirmLabel="Remove"
        destructive
        loading={removing}
        onConfirm={onRemove}
      />
    </DashCard>
  );
}

const PAGE_SIZE_OPTIONS = [25, 50, 100];

function MappingsCard({ source, canWrite }: { source: TallySource; canWrite: boolean }) {
  const { data: reference } = useReferenceData();
  const [mappings, setMappings] = useState<TallyLedgerMapping[] | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [importResult, setImportResult] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [onlyUnmapped, setOnlyUnmapped] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [busyId, setBusyId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    listTallyMappings(source.id)
      .then(setMappings)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load mappings"));
  }, [source.id]);
  useEffect(() => { setMappings(null); refresh(); }, [refresh]);
  useEffect(() => { setPage(1); }, [search, onlyUnmapped, pageSize, source.id]);

  const onFile = async (file: File) => {
    setUploading(true);
    setError("");
    setImportResult(null);
    try {
      const result = await importTallyMappings(source.id, file);
      setImportResult(result.imported);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onAssign = async (mapping: TallyLedgerMapping, patch: { businessUnitId?: number | null; lineItemId?: number | null }) => {
    setBusyId(mapping.id);
    try {
      const updated = await updateTallyMapping(mapping.id, patch);
      setMappings((prev) => prev?.map((m) => (m.id === updated.id ? updated : m)) ?? prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update mapping");
    } finally {
      setBusyId(null);
    }
  };

  const businesses = reference?.businesses ?? [];
  const businessUnits = reference?.businessUnits ?? [];
  const lineItems = reference?.lineItems ?? [];
  const unitById = useMemo(() => new Map(businessUnits.map((u) => [u.id, u])), [businessUnits]);
  const lineItemById = useMemo(() => new Map(lineItems.map((li) => [li.id, li])), [lineItems]);

  const filtered = useMemo(() => {
    if (!mappings) return [];
    const q = search.trim().toLowerCase();
    return mappings.filter((m) => {
      if (onlyUnmapped && (m.businessUnitId != null || m.lineItemId != null)) return false;
      if (!q) return true;
      return m.ledgerName.toLowerCase().includes(q) || (m.groupName ?? "").toLowerCase().includes(q);
    });
  }, [mappings, search, onlyUnmapped]);

  const unmappedCount = mappings?.filter((m) => m.businessUnitId == null || m.lineItemId == null).length ?? 0;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <DashCard title={`Ledger mappings · ${source.label}`}>
      {canWrite && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-4">
          <label className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer
            ${uploading ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground hover:opacity-90"}`}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? "Importing…" : "Upload chart of accounts (.xlsx)"}
            <input
              ref={fileRef} type="file" accept=".xlsx" className="hidden" disabled={uploading}
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            A Tally &quot;List of Ledgers&quot; export. Re-uploading refreshes group names without
            touching ledgers you&apos;ve already assigned.
          </p>
        </div>
      )}
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {importResult != null && (
        <p className="flex items-center gap-2 text-sm text-emerald-600 mb-3">
          <Check className="w-4 h-4" /> Imported {importResult} ledger{importResult === 1 ? "" : "s"}.
        </p>
      )}

      {mappings === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : mappings.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No ledgers yet - upload a chart-of-accounts export above to get started.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ledger or group name…"
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-border bg-background text-xs"
              />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox" checked={onlyUnmapped}
                onChange={(e) => setOnlyUnmapped(e.target.checked)}
                className="accent-primary"
              />
              Unmapped only
            </label>
            <span className="text-xs text-muted-foreground ml-auto">
              {unmappedCount} of {mappings.length} unmapped
            </span>
          </div>

          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border bg-muted/30">
                  <th className="py-2 px-2.5 font-medium">Ledger</th>
                  <th className="py-2 px-2.5 font-medium">Tally group</th>
                  <th className="py-2 px-2.5 font-medium">Business unit</th>
                  <th className="py-2 px-2.5 font-medium">Line item</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((m) => {
                  const unit = m.businessUnitId != null ? unitById.get(m.businessUnitId) : undefined;
                  const scopedLineItems = unit ? lineItems.filter((li) => li.businessId === unit.businessId) : lineItems;
                  return (
                    <tr key={m.id} className="border-b border-border last:border-0">
                      <td className="py-1.5 px-2.5 text-foreground">{m.ledgerName}</td>
                      <td className="py-1.5 px-2.5 text-muted-foreground">{m.groupName ?? "—"}</td>
                      <td className="py-1.5 px-2.5">
                        <select
                          value={m.businessUnitId ?? ""}
                          disabled={!canWrite || busyId === m.id}
                          onChange={(e) => {
                            const v = e.target.value ? Number(e.target.value) : null;
                            const newUnit = v != null ? unitById.get(v) : undefined;
                            const currentLineItem = m.lineItemId != null ? lineItemById.get(m.lineItemId) : undefined;
                            const keepLineItem = currentLineItem != null && currentLineItem.businessId === newUnit?.businessId;
                            onAssign(m, { businessUnitId: v, ...(keepLineItem ? {} : { lineItemId: null }) });
                          }}
                          className="px-1.5 py-1 rounded border border-border bg-background text-xs disabled:opacity-50 min-w-[140px]"
                        >
                          <option value="">Unmapped</option>
                          {businesses.map((b) => (
                            <optgroup key={b.id} label={b.name}>
                              {businessUnits.filter((u) => u.businessId === b.id).map((u) => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </td>
                      <td className="py-1.5 px-2.5">
                        <select
                          value={m.lineItemId ?? ""}
                          disabled={!canWrite || busyId === m.id || m.businessUnitId == null}
                          onChange={(e) => onAssign(m, { lineItemId: e.target.value ? Number(e.target.value) : null })}
                          className="px-1.5 py-1 rounded border border-border bg-background text-xs disabled:opacity-50 min-w-[160px]"
                        >
                          <option value="">{m.businessUnitId == null ? "Pick a business unit first" : "Unmapped"}</option>
                          {scopedLineItems.map((li) => (
                            <option key={li.id} value={li.id}>{li.name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filtered.length > pageSize && (
            <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
              <button
                onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Previous
              </button>
              <span className="text-xs text-muted-foreground px-1">
                Page {currentPage} of {totalPages} ({filtered.length} ledgers)
              </span>
              <button
                onClick={() => setPage(currentPage + 1)} disabled={currentPage === totalPages}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <select
                value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs"
                title="Ledgers per page"
              >
                {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n} per page</option>)}
              </select>
            </div>
          )}
        </>
      )}
    </DashCard>
  );
}

export default function TallyPage() {
  const { can } = useAuth();
  const canWrite = can("TallySource", "write");
  const canDelete = can("TallySource", "delete");
  const [sources, setSources] = useState<TallySource[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const refresh = useCallback(() => {
    listTallySources()
      .then((rows) => {
        setSources(rows);
        setSelectedId((prev) => (prev != null && rows.some((r) => r.id === prev) ? prev : (rows[0]?.id ?? null)));
      })
      .catch(() => {});
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const selected = sources.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
        Data - Tally
      </p>

      <SourcesCard
        sources={sources} refresh={refresh} selectedId={selectedId} onSelect={setSelectedId}
        canWrite={canWrite} canDelete={canDelete}
      />

      {selected && <MappingsCard source={selected} canWrite={canWrite} />}

      <p className="text-xs text-muted-foreground">
        The Tally agent runs on the client&apos;s machine and pushes ledger balances here on its
        own schedule (see the agent&apos;s config for how often). This page controls which ledgers
        map to which business unit and line item, and whether a source&apos;s pushes land as a
        preview for you to review (see Import Workbooks) or commit automatically.
      </p>
    </div>
  );
}
