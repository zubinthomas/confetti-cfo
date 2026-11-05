import React, { useCallback, useEffect, useState } from "react";
import DashCard from "./DashCard";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  listPetpoojaSources, createPetpoojaSource, rotatePetpoojaWebhookSecret, deletePetpoojaSource,
  listPetpoojaSalesOrders, getPetpoojaMenu, resyncPetpoojaMenu, getPetpoojaOrders, PETPOOJA_ATTRIBUTE_LABELS,
  type PetpoojaSource, type PetpoojaEnvironment, type PetpoojaSalesOrder, type PetpoojaMenu, type PetpoojaOutboundOrder,
} from "@/api/petpoojaApi";
import { useAuth } from "@/lib/AuthContext";
import { Plus, Loader2, KeyRound, Copy, Check, Trash2, RefreshCw } from "lucide-react";

const ENVIRONMENTS: PetpoojaEnvironment[] = ["sandbox", "production"];

const SYNC_STATUS_CHIP: Record<NonNullable<PetpoojaSource["lastSyncStatus"]>, { label: string; cls: string }> = {
  preview_created: { label: "preview ready", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  auto_committed: { label: "auto-committed", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  no_changes: { label: "no changes", cls: "bg-muted text-muted-foreground" },
  auto_discarded: { label: "auto-discarded", cls: "bg-muted text-muted-foreground" },
  error: { label: "error", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

function NewWebhookSecretBanner({ secret, onDismiss }: { secret: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable - the secret is still selectable text below
    }
  };
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3">
      <p className="text-sm font-medium text-amber-900 dark:text-amber-200 mb-2">
        Copy this webhook secret now - it won&apos;t be shown again.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs bg-background border border-border rounded px-2 py-1.5 overflow-x-auto">
          {secret}
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
          Give it to PetPooja for this outlet&apos;s Sales API webhook configuration.
        </p>
        <button onClick={onDismiss} className="text-xs text-muted-foreground underline shrink-0">Done</button>
      </div>
    </div>
  );
}

function SourcesCard({
  sources, refresh, canWrite, canDelete,
}: {
  sources: PetpoojaSource[];
  refresh: () => void;
  canWrite: boolean;
  canDelete: boolean;
}) {
  const [label, setLabel] = useState("");
  const [environment, setEnvironment] = useState<PetpoojaEnvironment>("sandbox");
  const [restId, setRestId] = useState("");
  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<PetpoojaSource | null>(null);
  const [removing, setRemoving] = useState(false);

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !restId.trim() || !appKey.trim() || !appSecret.trim() || !accessToken.trim()) return;
    setAdding(true);
    setError("");
    try {
      const { webhookSecret } = await createPetpoojaSource({
        label: label.trim(), environment, restId: restId.trim(),
        appKey: appKey.trim(), appSecret: appSecret.trim(), accessToken: accessToken.trim(),
      });
      setLabel(""); setRestId(""); setAppKey(""); setAppSecret(""); setAccessToken("");
      setEnvironment("sandbox");
      setNewSecret(webhookSecret);
      refresh();
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
      const { webhookSecret } = await rotatePetpoojaWebhookSecret(id);
      setNewSecret(webhookSecret);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rotate webhook secret");
    } finally {
      setBusyId(null);
    }
  };

  const onRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await deletePetpoojaSource(removeTarget.id);
      setRemoveTarget(null);
      refresh();
    } finally {
      setRemoving(false);
    }
  };

  const onResyncMenu = async (id: number) => {
    setBusyId(id);
    setError("");
    try {
      const result = await resyncPetpoojaMenu(id);
      if (result.status === "error") setError(result.error ?? "Menu resync failed");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resync menu");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashCard title="PetPooja sources">
      {canWrite && (
        <form onSubmit={onAdd} className="flex flex-col gap-2 mb-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text" value={label} onChange={(e) => setLabel(e.target.value)} disabled={adding}
              placeholder='Label, e.g. "Hindustan Park"'
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
            <select
              value={environment} disabled={adding}
              onChange={(e) => setEnvironment(e.target.value as PetpoojaEnvironment)}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm"
            >
              {ENVIRONMENTS.map((env) => <option key={env} value={env}>{env}</option>)}
            </select>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text" value={restId} onChange={(e) => setRestId(e.target.value)} disabled={adding}
              placeholder="PetPooja restID"
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
            <input
              type="text" value={appKey} onChange={(e) => setAppKey(e.target.value)} disabled={adding}
              placeholder="App key"
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
            <input
              type="text" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} disabled={adding}
              placeholder="App secret"
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
            <input
              type="text" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} disabled={adding}
              placeholder="Access token"
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
            <button
              type="submit"
              disabled={adding || !label.trim() || !restId.trim() || !appKey.trim() || !appSecret.trim() || !accessToken.trim()}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 shrink-0"
            >
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {adding ? "Creating…" : "New source"}
            </button>
          </div>
        </form>
      )}
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {newSecret && (
        <div className="mb-4">
          <NewWebhookSecretBanner secret={newSecret} onDismiss={() => setNewSecret(null)} />
        </div>
      )}

      {sources.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No PetPooja sources yet. Create one with the restID and outbound credentials PetPooja issued,
          then give PetPooja the generated webhook secret for the Sales API.
        </p>
      ) : (
        <div className="divide-y divide-border border-t border-border">
          {sources.map((s) => (
            <div key={s.id} className="py-2.5 px-2 -mx-2 rounded-lg">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{s.label}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {s.environment}
                    </span>
                    {s.lastSyncStatus && (
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${SYNC_STATUS_CHIP[s.lastSyncStatus].cls}`}>
                        {SYNC_STATUS_CHIP[s.lastSyncStatus].label}
                      </span>
                    )}
                    {s.storeOpen === false && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-500">
                        Store closed
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    restID {s.restId}
                    {s.lastSeenAt ? ` · last webhook ${new Date(s.lastSeenAt).toLocaleString()}` : " · no webhook received yet"}
                    {s.lastSyncStatus === "error" && s.lastSyncError && (
                      <span className="text-red-500"> - {s.lastSyncError}</span>
                    )}
                    {s.storeOpen === false && (
                      <span className="text-red-500">
                        {" · "}{s.storeClosedReason || "no reason given"}
                        {s.storeReopenAt && ` · reopens ${s.storeReopenAt}`}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {canWrite && (
                    <button
                      onClick={() => onResyncMenu(s.id)} disabled={busyId === s.id} title="Resync menu now"
                      className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      {busyId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  {canWrite && (
                    <button
                      onClick={() => onRotate(s.id)} disabled={busyId === s.id} title="Rotate webhook secret"
                      className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                    </button>
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
        title="Remove this PetPooja source?"
        description={removeTarget ? `"${removeTarget.label}" will be deleted and its webhook secret stops working immediately. Already-ingested sales orders are kept.` : ""}
        confirmLabel="Remove"
        destructive
        loading={removing}
        onConfirm={onRemove}
      />
    </DashCard>
  );
}

function SalesOrdersCard() {
  const [orders, setOrders] = useState<PetpoojaSalesOrder[] | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    listPetpoojaSalesOrders()
      .then(setOrders)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load sales orders"));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  return (
    <DashCard title="Sales orders">
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {orders === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No sales orders yet - they land here as PetPooja pushes each bill at &quot;SAVE AND PRINT&quot;.
        </p>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border bg-muted/30">
                <th className="py-2 px-2.5 font-medium">Date</th>
                <th className="py-2 px-2.5 font-medium">Order ID</th>
                <th className="py-2 px-2.5 font-medium">Table</th>
                <th className="py-2 px-2.5 font-medium">Type</th>
                <th className="py-2 px-2.5 font-medium">Payment</th>
                <th className="py-2 px-2.5 font-medium text-right">Total</th>
                <th className="py-2 px-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-border last:border-0">
                  <td className="py-1.5 px-2.5 text-muted-foreground whitespace-nowrap">
                    {o.orderCreatedAt ? new Date(o.orderCreatedAt).toLocaleString() : "—"}
                  </td>
                  <td className="py-1.5 px-2.5 text-foreground">{o.orderId}</td>
                  <td className="py-1.5 px-2.5 text-muted-foreground">{o.tableNo ?? "—"}</td>
                  <td className="py-1.5 px-2.5 text-muted-foreground">{o.orderType ?? "—"}</td>
                  <td className="py-1.5 px-2.5 text-muted-foreground">{o.paymentType ?? "—"}</td>
                  <td className="py-1.5 px-2.5 text-foreground text-right">
                    {o.total != null ? o.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                  </td>
                  <td className="py-1.5 px-2.5">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${
                      o.status === "Cancelled"
                        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                    }`}>
                      {o.status ?? "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashCard>
  );
}

const OUTBOUND_ORDER_STATUS_CHIP: Record<PetpoojaOutboundOrder["status"], { label: string; cls: string }> = {
  placed: { label: "placed", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  accepted: { label: "accepted", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  dispatched: { label: "dispatched", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  food_ready: { label: "food ready", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  delivered: { label: "delivered", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  cancelled: { label: "cancelled", cls: "bg-muted text-muted-foreground" },
  error: { label: "error", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

/** Step 6, plumbing only - nothing in this app calls placePetpoojaOrder yet
 *  (see server/petpooja/saveOrder.ts's header comment), so this list is
 *  empty in practice until a future ordering feature is wired up. */
function OutboundOrdersCard() {
  const [orders, setOrders] = useState<PetpoojaOutboundOrder[] | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    getPetpoojaOrders()
      .then(setOrders)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load orders"));
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  return (
    <DashCard title="Orders placed">
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {orders === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No orders placed yet - nothing in this app originates an order to push to PetPooja's POS yet.
        </p>
      ) : (
        <div className="overflow-x-auto border border-border rounded-lg">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border bg-muted/30">
                <th className="py-2 px-2.5 font-medium">Created</th>
                <th className="py-2 px-2.5 font-medium">Order ID</th>
                <th className="py-2 px-2.5 font-medium">Status</th>
                <th className="py-2 px-2.5 font-medium">Last callback</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-border last:border-0">
                  <td className="py-1.5 px-2.5 text-muted-foreground whitespace-nowrap">
                    {new Date(o.createdAt).toLocaleString()}
                  </td>
                  <td className="py-1.5 px-2.5 text-foreground font-mono text-[11px]">{o.id}</td>
                  <td className="py-1.5 px-2.5">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${OUTBOUND_ORDER_STATUS_CHIP[o.status].cls}`}>
                      {OUTBOUND_ORDER_STATUS_CHIP[o.status].label}
                    </span>
                  </td>
                  <td className="py-1.5 px-2.5 text-muted-foreground whitespace-nowrap">
                    {o.lastCallbackAt ? new Date(o.lastCallbackAt).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashCard>
  );
}

function MenuCard({ sources }: { sources: PetpoojaSource[] }) {
  const [sourceId, setSourceId] = useState<number | null>(sources[0]?.id ?? null);
  const [menu, setMenu] = useState<PetpoojaMenu | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (sources.length && sourceId == null) setSourceId(sources[0].id);
  }, [sources, sourceId]);

  useEffect(() => {
    if (sourceId == null) return;
    setMenu(null);
    getPetpoojaMenu(sourceId)
      .then(setMenu)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load menu"));
  }, [sourceId]);

  const categories = menu?.categories ?? [];
  const items = menu?.items ?? [];
  const itemsByCategory = new Map<string, typeof items>();
  const uncategorized: typeof items = [];
  for (const item of items) {
    if (item.categoryId && categories.some((c) => c.categoryId === item.categoryId)) {
      const list = itemsByCategory.get(item.categoryId) ?? [];
      list.push(item);
      itemsByCategory.set(item.categoryId, list);
    } else {
      uncategorized.push(item);
    }
  }

  return (
    <DashCard title="Menu catalog">
      {sources.length > 1 && (
        <select
          value={sourceId ?? ""} onChange={(e) => setSourceId(Number(e.target.value))}
          className="mb-3 px-3 py-1.5 rounded-lg border border-border bg-background text-sm"
        >
          {sources.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      )}
      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {menu === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No menu synced yet for this source - it lands here once PetPooja pushes a menu, or after a manual resync.
        </p>
      ) : (
        <div className="space-y-2">
          {categories.map((cat) => {
            const catItems = itemsByCategory.get(cat.categoryId) ?? [];
            if (catItems.length === 0) return null;
            return (
              <details key={cat.id} className="border border-border rounded-lg" open>
                <summary className={`px-3 py-2 text-sm font-medium cursor-pointer ${cat.active ? "text-foreground" : "text-muted-foreground line-through"}`}>
                  {cat.name} <span className="text-xs text-muted-foreground">({catItems.length})</span>
                </summary>
                <div className="overflow-x-auto border-t border-border">
                  <table className="w-full text-xs">
                    <tbody>
                      {catItems.map((it) => (
                        <tr key={it.id} className={`border-b border-border last:border-0 ${it.active ? "" : "text-muted-foreground"}`}>
                          <td className="py-1.5 px-2.5">
                            {it.name}
                            {!it.inStock && <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600">out of stock</span>}
                          </td>
                          <td className="py-1.5 px-2.5 text-muted-foreground">
                            {it.attributeId ? PETPOOJA_ATTRIBUTE_LABELS[it.attributeId] ?? it.attributeId : "—"}
                          </td>
                          <td className="py-1.5 px-2.5 text-right">
                            {it.price != null ? it.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                          </td>
                          {!it.active && <td className="py-1.5 px-2.5 text-[11px] text-muted-foreground">inactive</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            );
          })}
          {uncategorized.length > 0 && (
            <details className="border border-border rounded-lg">
              <summary className="px-3 py-2 text-sm font-medium cursor-pointer text-foreground">
                Uncategorized <span className="text-xs text-muted-foreground">({uncategorized.length})</span>
              </summary>
              <div className="overflow-x-auto border-t border-border">
                <table className="w-full text-xs">
                  <tbody>
                    {uncategorized.map((it) => (
                      <tr key={it.id} className={`border-b border-border last:border-0 ${it.active ? "" : "text-muted-foreground"}`}>
                        <td className="py-1.5 px-2.5">
                          {it.name}
                          {!it.inStock && <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600">out of stock</span>}
                        </td>
                        <td className="py-1.5 px-2.5 text-right">
                          {it.price != null ? it.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
          {(menu.addonGroups.length > 0 || menu.addonItems.length > 0) && (
            <details className="border border-border rounded-lg">
              <summary className="px-3 py-2 text-sm font-medium cursor-pointer text-foreground">
                Addon groups &amp; items <span className="text-xs text-muted-foreground">({menu.addonGroups.length} groups, {menu.addonItems.length} items)</span>
              </summary>
              <div className="overflow-x-auto border-t border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border bg-muted/30">
                      <th className="py-2 px-2.5 font-medium">Addon item</th>
                      <th className="py-2 px-2.5 font-medium">Attribute</th>
                      <th className="py-2 px-2.5 font-medium text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {menu.addonItems.map((ai) => (
                      <tr key={ai.id} className={`border-b border-border last:border-0 ${ai.active ? "" : "text-muted-foreground"}`}>
                        <td className="py-1.5 px-2.5">
                          {ai.name}
                          {!ai.inStock && <span className="ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600">out of stock</span>}
                        </td>
                        <td className="py-1.5 px-2.5 text-muted-foreground">
                          {ai.attributeId ? PETPOOJA_ATTRIBUTE_LABELS[ai.attributeId] ?? ai.attributeId : "—"}
                        </td>
                        <td className="py-1.5 px-2.5 text-right">
                          {ai.price != null ? ai.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}
    </DashCard>
  );
}

export default function PetpoojaPage() {
  const { can } = useAuth();
  const canManageSources = can("PetPooja", "read");
  const canWriteSources = can("PetPooja", "write");
  const canDeleteSources = can("PetPooja", "delete");
  const canReadSalesOrders = can("PetpoojaSales", "read");
  const canReadMenu = can("PetpoojaMenu", "read");
  const canReadOrders = can("PetpoojaOrders", "read");
  const [sources, setSources] = useState<PetpoojaSource[]>([]);

  const refresh = useCallback(() => {
    listPetpoojaSources().then(setSources).catch(() => {});
  }, []);
  // MenuCard needs the source list too (for its per-source picker), not just
  // SourcesCard - fetch it whenever either resource's read access allows it.
  useEffect(() => { if (canManageSources || canReadMenu) refresh(); }, [canManageSources, canReadMenu, refresh]);

  return (
    <div className="space-y-6">
      <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
        Data - PetPooja
      </p>

      {canManageSources && (
        <SourcesCard sources={sources} refresh={refresh} canWrite={canWriteSources} canDelete={canDeleteSources} />
      )}

      {canReadSalesOrders && <SalesOrdersCard />}

      {canReadMenu && sources.length > 0 && <MenuCard sources={sources} />}

      {canReadOrders && <OutboundOrdersCard />}

      <p className="text-xs text-muted-foreground">
        PetPooja calls the Sales API webhook on every &quot;SAVE AND PRINT&quot; at the POS - this page
        controls which outlets are configured and shows the bills that have come in. A cancelled bill
        arrives as a normal re-push of the same order with its status flipped, not a separate notice.
      </p>
    </div>
  );
}
