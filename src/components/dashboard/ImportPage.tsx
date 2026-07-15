import React, { useCallback, useEffect, useRef, useState } from "react";
import DashCard from "./DashCard";
import ConfirmDialog from "@/components/ConfirmDialog";
import ImportDetailsModal from "./ImportDetailsModal";
import {
  uploadWorkbook, listBatches, commitBatch, discardBatch, getBatchDetails,
  type ImportBatch, type ImportIssue, type ImportBatchDetails, type RejectedUpload,
} from "@/api/importApi";
import {
  getSheetsConfig, listSources, addSource, updateSource, deleteSource, syncSheetSource,
  listAvailable, type SheetSource, type DriveSpreadsheet,
} from "@/api/sheetsApi";
import {
  Upload, Loader2, AlertTriangle, AlertCircle, Info, CheckCircle2,
  RefreshCw, Trash2, ExternalLink, FileSpreadsheet, Link2, Filter,
  ChevronLeft, ChevronRight, Eye,
} from "lucide-react";

const KIND_LABELS: Record<ImportBatch["kind"], string> = {
  cepl: "CEPL P&L",
  cafe: "Cafe Weekly P&L",
  sienna: "Sienna Store Sales",
};

const STATUS_STYLE: Record<ImportBatch["status"], string> = {
  preview: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  committed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  discarded: "bg-muted text-muted-foreground",
};

const ISSUE_ICON = {
  error: <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />,
  warning: <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />,
  info: <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />,
};

function IssueList({ issues }: { issues: ImportIssue[] }) {
  const [showInfo, setShowInfo] = useState(false);
  const important = issues.filter((i) => i.level !== "info");
  const info = issues.filter((i) => i.level === "info");
  if (!issues.length) return <p className="text-xs text-muted-foreground">No validation findings - clean parse.</p>;
  return (
    <div className="space-y-1.5">
      {important.map((i, idx) => (
        <div key={idx} className="flex items-start gap-2 text-xs text-foreground">
          {ISSUE_ICON[i.level]}
          <span><span className="text-muted-foreground">[{i.sheet}]</span> {i.message}</span>
        </div>
      ))}
      {info.length > 0 && (
        <button className="text-xs text-muted-foreground underline" onClick={() => setShowInfo(!showInfo)}>
          {showInfo ? "Hide" : "Show"} {info.length} informational note{info.length > 1 ? "s" : ""}
        </button>
      )}
      {showInfo && info.map((i, idx) => (
        <div key={idx} className="flex items-start gap-2 text-xs text-muted-foreground">
          {ISSUE_ICON.info}
          <span>[{i.sheet}] {i.message}</span>
        </div>
      ))}
    </div>
  );
}

function StatsTable({ stats }: { stats: ImportBatch["stats"] }) {
  const rows = Object.entries(stats).filter(([, s]) => s.creates + s.updates + s.unchanged > 0);
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-muted-foreground border-b border-border">
          <th className="py-1 pr-2 font-medium">Table</th>
          <th className="py-1 pr-2 font-medium text-right">New</th>
          <th className="py-1 pr-2 font-medium text-right">Changed</th>
          <th className="py-1 font-medium text-right">Unchanged</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([table, s]) => (
          <tr key={table} className="border-b border-border last:border-0">
            <td className="py-1 pr-2 text-foreground">{table}</td>
            <td className={`py-1 pr-2 text-right ${s.creates ? "text-emerald-600 font-medium" : "text-muted-foreground"}`}>{s.creates}</td>
            <td className={`py-1 pr-2 text-right ${s.updates ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>{s.updates}</td>
            <td className="py-1 text-right text-muted-foreground">{s.unchanged}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const SYNC_STATUS_CHIP: Record<NonNullable<SheetSource["lastSyncStatus"]>, { label: string; cls: string }> = {
  preview_created: { label: "preview ready", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  auto_committed: { label: "auto-committed", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  no_changes: { label: "no changes", cls: "bg-muted text-muted-foreground" },
  error: { label: "error", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

const SYNC_MODE_LABELS: Record<SheetSource["syncMode"], string> = {
  auto: "Auto",
  manual: "Manual review",
  paused: "Paused",
};

function SheetsCard({ onBatchesChanged }: { onBatchesChanged: () => void }) {
  const [sources, setSources] = useState<SheetSource[]>([]);
  const [saEmail, setSaEmail] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [removeTarget, setRemoveTarget] = useState<SheetSource | null>(null);
  const [removing, setRemoving] = useState(false);
  const [available, setAvailable] = useState<DriveSpreadsheet[]>([]);
  const [availableError, setAvailableError] = useState("");
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const refresh = useCallback(() => { listSources().then(setSources).catch(() => {}); }, []);
  const refreshAvailable = useCallback(() => {
    listAvailable()
      .then((files) => { setAvailable(files); setAvailableError(""); })
      .catch((err) => setAvailableError(err instanceof Error ? err.message : "Failed to list sheets"));
  }, []);
  useEffect(() => {
    refresh();
    refreshAvailable();
    getSheetsConfig().then((c) => setSaEmail(c.serviceAccountEmail)).catch(() => {});
  }, [refresh, refreshAvailable]);

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setAdding(true);
    setError("");
    try {
      await addSource(url.trim(), label.trim() || undefined);
      setUrl("");
      setLabel("");
      refresh();
      refreshAvailable();
      onBatchesChanged(); // a preview batch may have appeared
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect sheet");
    } finally {
      setAdding(false);
    }
  };

  const onConnectDrive = async (file: DriveSpreadsheet) => {
    setConnectingId(file.id);
    setError("");
    try {
      await addSource(file.webViewLink, file.name);
      refresh();
      refreshAvailable();
      onBatchesChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect sheet");
    } finally {
      setConnectingId(null);
    }
  };

  const onSync = async (id: number) => {
    setBusyId(id);
    setError("");
    try {
      const result = await syncSheetSource(id);
      refresh();
      onBatchesChanged();
      if (result.source.lastSyncStatus === "auto_committed") {
        // data landed in the dataset - reload so the dashboards pick it up
        window.location.reload();
      }
    } finally {
      setBusyId(null);
    }
  };

  const onModeChange = async (s: SheetSource, syncMode: SheetSource["syncMode"]) => {
    setBusyId(s.id);
    try { await updateSource(s.id, { syncMode }); refresh(); } finally { setBusyId(null); }
  };

  const onRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await deleteSource(removeTarget.id);
      setRemoveTarget(null);
      refresh();
      refreshAvailable();
      onBatchesChanged(); // its pending preview (if any) was discarded
    } finally {
      setRemoving(false);
    }
  };

  const disconnected = available.filter((f) => !f.connected);

  return (
    <DashCard title="Google Sheets">
      {saEmail && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-foreground">
              Shared with the service account
            </p>
            <button
              onClick={refreshAvailable} title="Refresh list"
              className="p-1 rounded text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          {availableError ? (
            <p className="text-xs text-red-500">{availableError}</p>
          ) : disconnected.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No unconnected spreadsheets found. Share a sheet with{" "}
              <code className="text-[11px]">{saEmail}</code> and it will appear here.
            </p>
          ) : (
            <div className="divide-y divide-border border border-border rounded-lg">
              {disconnected.map((f) => (
                <div key={f.id} className="px-3 py-2 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <a
                      href={f.webViewLink} target="_blank" rel="noreferrer"
                      className="text-sm text-foreground hover:underline inline-flex items-center gap-1"
                    >
                      <span className="truncate">{f.name}</span>
                      <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
                    </a>
                    <p className="text-[11px] text-muted-foreground">
                      {f.mimeType === "application/vnd.google-apps.spreadsheet" ? "Google Sheet" : "Excel file"}
                      {" · modified "}{new Date(f.modifiedTime).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => onConnectDrive(f)} disabled={connectingId !== null}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50 shrink-0"
                  >
                    {connectingId === f.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Link2 className="w-3.5 h-3.5" />}
                    Connect
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <form onSubmit={onAdd} className="flex flex-col sm:flex-row gap-2">
        <input
          type="url" value={url} onChange={(e) => setUrl(e.target.value)} disabled={adding}
          placeholder="https://docs.google.com/spreadsheets/d/…"
          className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
        />
        <input
          type="text" value={label} onChange={(e) => setLabel(e.target.value)} disabled={adding}
          placeholder="Label (optional)"
          className="sm:w-44 px-3 py-2 rounded-lg border border-border bg-background text-sm"
        />
        <button
          type="submit" disabled={adding || !url.trim()}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
        >
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
          {adding ? "Connecting…" : "Connect sheet"}
        </button>
      </form>
      <p className="text-xs text-muted-foreground mt-2">
        {saEmail
          ? "Or paste the URL of a sheet shared as “Anyone with the link can view”."
          : "Share the sheet as “Anyone with the link can view” and paste its URL."}{" "}
        Connected sheets re-sync automatically; changes appear below as previews for you to commit.
      </p>
      {error && <p className="text-sm text-red-500 mt-2">{error}</p>}

      {sources.length > 0 && (
        <div className="mt-4 divide-y divide-border border-t border-border">
          {sources.map((s) => (
            <div key={s.id} className="py-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <a
                    href={s.sheetUrl} target="_blank" rel="noreferrer"
                    className="text-sm font-medium text-foreground hover:underline inline-flex items-center gap-1"
                  >
                    {s.label} <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  </a>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {s.accessMethod === "link" ? "link-shared" : "service account"}
                  </span>
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
                  {s.lastSyncStatus === "error" && s.lastSyncError && (
                    <span className="text-red-500"> - {s.lastSyncError}</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => onSync(s.id)} disabled={busyId === s.id} title="Sync now"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${busyId === s.id ? "animate-spin" : ""}`} /> Sync now
                </button>
                <select
                  value={s.syncMode} disabled={busyId === s.id}
                  onChange={(e) => onModeChange(s, e.target.value as SheetSource["syncMode"])}
                  title="Auto: commit syncs with no warnings or errors. Manual review: you commit previews. Paused: no scheduled syncing."
                  className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs disabled:opacity-50"
                >
                  {Object.entries(SYNC_MODE_LABELS).map(([mode, label]) => (
                    <option key={mode} value={mode}>{label}</option>
                  ))}
                </select>
                <button
                  onClick={() => setRemoveTarget(s)} disabled={busyId === s.id} title="Remove"
                  className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-red-500 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              </div>
              {s.lastSyncStatus === "error" && (s.lastSyncIssues?.length ?? 0) > 0 && (
                <div className="mt-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                  <p className="text-xs text-muted-foreground mb-2">
                    The sheet was not imported. Fix the issues below in the spreadsheet, then sync again.
                  </p>
                  <IssueList issues={s.lastSyncIssues ?? []} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => { if (!open) setRemoveTarget(null); }}
        title="Remove this sheet?"
        description={removeTarget ? `"${removeTarget.label}" will stop syncing and its pending preview (if any) will be discarded. Already-committed imports are kept.` : ""}
        confirmLabel="Remove"
        destructive
        loading={removing}
        onConfirm={onRemove}
      />
    </DashCard>
  );
}

/** Local calendar day (yyyy-mm-dd) of an ISO timestamp, comparable to <input type="date"> values. */
const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function ImportPage() {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [rejected, setRejected] = useState<RejectedUpload | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [committed, setCommitted] = useState(false);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterKind, setFilterKind] = useState<"all" | ImportBatch["kind"]>("all");
  const [filterSource, setFilterSource] = useState<"all" | ImportBatch["sourceType"]>("all");
  const [hideDiscarded, setHideDiscarded] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [detailsCache, setDetailsCache] = useState<Record<number, ImportBatchDetails>>({});
  const [detailsOpenFor, setDetailsOpenFor] = useState<number | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => { listBatches().then(setBatches).catch(() => {}); }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // back to the first page whenever the visible set changes shape
  useEffect(() => { setPage(1); }, [filterFrom, filterTo, filterKind, filterSource, hideDiscarded, pageSize]);

  const onFile = async (file: File) => {
    setUploading(true);
    setError("");
    setRejected(null);
    try {
      const result = await uploadWorkbook(file);
      if (result.rejected) setRejected(result.rejected);
      else refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onCommit = async (id: number) => {
    setBusyId(id);
    setError("");
    try {
      await commitBatch(id);
      setCommitted(true);
      // the dashboards' dataset is loaded once at startup - reload to pick up the import
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Commit failed");
      setBusyId(null);
    }
  };

  const onDiscard = async (id: number) => {
    setBusyId(id);
    try { await discardBatch(id); refresh(); } finally { setBusyId(null); }
  };

  const openDetails = async (id: number) => {
    if (detailsCache[id] !== undefined) { setDetailsOpenFor(id); return; }
    setDetailsLoading(true);
    setDetailsOpenFor(id);
    try {
      const { details } = await getBatchDetails(id);
      setDetailsCache((prev) => ({ ...prev, [id]: details }));
    } finally {
      setDetailsLoading(false);
    }
  };

  // hideDiscarded counts as "active" only when switched off its default
  const hasFilters = !!filterFrom || !!filterTo || filterKind !== "all" || filterSource !== "all" || !hideDiscarded;
  const visibleBatches = batches.filter((b) => {
    const day = localDay(b.uploadedAt);
    return (!filterFrom || day >= filterFrom)
      && (!filterTo || day <= filterTo)
      && (filterKind === "all" || b.kind === filterKind)
      && (filterSource === "all" || b.sourceType === filterSource)
      && (!hideDiscarded || b.status !== "discarded");
  });

  const totalPages = Math.max(1, Math.ceil(visibleBatches.length / pageSize));
  const currentPage = Math.min(page, totalPages); // stays valid if the list shrinks
  const pagedBatches = visibleBatches.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6">
      <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
        Data - Import
      </p>

      <DashCard>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <label className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer
            ${uploading ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground hover:opacity-90"}`}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {uploading ? "Validating…" : "Upload workbook (.xlsx)"}
            <input
              ref={fileRef} type="file" accept=".xlsx" className="hidden" disabled={uploading}
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Accepts the CEPL P&L, Cafe Weekly P&L and Sienna Store Sales workbooks. Uploads are
            validated and previewed first - nothing changes until you commit.
          </p>
        </div>
        {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
        {committed && (
          <p className="flex items-center gap-2 text-sm text-emerald-600 mt-3">
            <CheckCircle2 className="w-4 h-4" /> Imported - reloading the dashboards…
          </p>
        )}
      </DashCard>

      {rejected && (
        <DashCard
          title={
            <span className="inline-flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500" />
              Validation failed · {rejected.filename}
            </span>
          }
          action={
            <button
              onClick={() => setRejected(null)}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              Dismiss
            </button>
          }
        >
          <p className="text-xs text-muted-foreground mb-3">
            Recognised as a {KIND_LABELS[rejected.kind]} workbook, but it has validation errors, so
            nothing was imported and no batch was created. Fix the issues below in the source file
            and upload it again.
          </p>
          <IssueList issues={rejected.issues} />
        </DashCard>
      )}

      <SheetsCard onBatchesChanged={refresh} />

      {batches.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-full md:w-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <Filter className="w-3.5 h-3.5" /> Filter batches
          </span>
          <input
            type="date" value={filterFrom} max={filterTo || undefined}
            onChange={(e) => setFilterFrom(e.target.value)} title="From date"
            className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date" value={filterTo} min={filterFrom || undefined}
            onChange={(e) => setFilterTo(e.target.value)} title="To date"
            className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs"
          />
          <select
            value={filterKind} onChange={(e) => setFilterKind(e.target.value as typeof filterKind)}
            className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs"
          >
            <option value="all">All workbook types</option>
            {Object.entries(KIND_LABELS).map(([kind, label]) => (
              <option key={kind} value={kind}>{label}</option>
            ))}
          </select>
          <select
            value={filterSource} onChange={(e) => setFilterSource(e.target.value as typeof filterSource)}
            className="px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs"
          >
            <option value="all">All sources</option>
            <option value="upload">Uploaded file</option>
            <option value="sheet">Google Sheet</option>
          </select>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox" checked={hideDiscarded}
              onChange={(e) => setHideDiscarded(e.target.checked)}
              className="accent-primary"
            />
            Hide discarded
          </label>
          {hasFilters && (
            <>
              <button
                onClick={() => {
                  setFilterFrom(""); setFilterTo(""); setFilterKind("all"); setFilterSource("all");
                  setHideDiscarded(true);
                }}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                Clear
              </button>
              <span className="text-xs text-muted-foreground ml-auto">
                {visibleBatches.length} of {batches.length} batch{batches.length === 1 ? "" : "es"}
              </span>
            </>
          )}
        </div>
      )}

      {batches.length > 0 && visibleBatches.length === 0 && (
        <p className="text-sm text-muted-foreground">No import batches match the current filters.</p>
      )}

      {pagedBatches.map((b) => (
        <DashCard
          key={b.id}
          title={`#${b.id} · ${b.filename}`}
          action={
            <>
              <button
                onClick={() => openDetails(b.id)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg border border-border text-[11px] text-muted-foreground hover:text-foreground"
              >
                <Eye className="w-3 h-3" /> View full details
              </button>
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_STYLE[b.status]}`}>
                {b.status}
              </span>
            </>
          }
        >
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
            {b.sourceType === "sheet"
              ? <><FileSpreadsheet className="w-3.5 h-3.5" /> Google Sheet</>
              : <><Upload className="w-3.5 h-3.5" /> Uploaded file</>}
            <span>
              · {KIND_LABELS[b.kind]} · {b.sourceType === "sheet" ? "synced" : "uploaded"} {new Date(b.uploadedAt).toLocaleString()}
              {b.committedAt && ` · committed ${new Date(b.committedAt).toLocaleString()}`}
            </span>
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <p className="text-xs font-semibold text-foreground mb-2">
                {b.status === "preview" ? "What committing will do" : "What this import did"}
              </p>
              <StatsTable stats={b.stats} />
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground mb-2">Validation findings</p>
              <IssueList issues={b.issues} />
            </div>
          </div>
          {b.status === "preview" && (
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => onCommit(b.id)}
                disabled={busyId === b.id || b.issues.some((i) => i.level === "error")}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
              >
                {busyId === b.id ? "Committing…" : "Commit import"}
              </button>
              <button
                onClick={() => onDiscard(b.id)}
                disabled={busyId === b.id}
                className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Discard
              </button>
              {b.issues.some((i) => i.level === "error") && (
                <span className="text-xs text-red-500 self-center">Fix the errors above and re-upload to commit.</span>
              )}
            </div>
          )}
        </DashCard>
      ))}

      <ImportDetailsModal
        open={detailsOpenFor !== null}
        onOpenChange={(open) => { if (!open) setDetailsOpenFor(null); }}
        batchLabel={
          detailsOpenFor !== null
            ? (() => {
              const b = batches.find((x) => x.id === detailsOpenFor);
              return b ? `#${b.id} · ${b.filename}` : `#${detailsOpenFor}`;
            })()
            : ""
        }
        details={detailsOpenFor !== null ? detailsCache[detailsOpenFor] : undefined}
        loading={detailsLoading}
      />

      {visibleBatches.length > pageSize && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            onClick={() => setPage(currentPage - 1)} disabled={currentPage === 1}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Previous
          </button>
          <span className="text-xs text-muted-foreground px-1">
            Page {currentPage} of {totalPages}
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
            title="Batches per page"
          >
            {[15, 30, 50].map((n) => <option key={n} value={n}>{n} per page</option>)}
          </select>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Imports upsert by natural key (department + period + line item, and so on): re-importing the
        same workbook is a no-op, updated cells change exactly the affected values, and new
        months/rows are appended. Every batch is kept here as provenance.
      </p>
    </div>
  );
}
