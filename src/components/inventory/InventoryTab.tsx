import React, { useState, useEffect } from "react";
import { Inventory } from "@/api/entities";
import { listTransactions, recordTransaction, listBatches, type InventoryTransaction, type InventoryBatch, type TransactionType } from "@/api/inventoryApi";
import {
  listPurchaseOrders, createPurchaseOrder, receivePurchaseOrderItem,
  type PurchaseOrder,
} from "@/api/purchaseOrdersApi";
import { Plus, X, Loader2, ArrowDownCircle, ArrowUpCircle, AlertTriangle, PackageCheck } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import KpiCard from "@/components/dashboard/KpiCard";
import StatusBadge from "@/components/dashboard/StatusBadge";
import FormField from "@/components/hr/FormField";
import { useAuth } from "@/lib/AuthContext";
import { DIVISIONS } from "@/lib/hrDivisions";

const divisionColors: Record<string, string> = {
  Accounts: "#f59e0b", Admin: "#8b5cf6", "Batik Unit": "#ec4899", Culinary: "#ef4444",
  Driver: "#64748b", "F&B Services": "#f97316", Jewellery: "#eab308", Legal: "#6366f1",
  Marketing: "#14b8a6", Partner: "#a855f7", Pottery: "#3b82f6", "Quality Control": "#06b6d4",
  Retail: "#84cc16", Tailor: "#d946ef", Utility: "#10b981",
};
const DEFAULT_DIVISION_COLOR = "#888";

const EMPTY = { name: "", sku: "", division: "", category: "", unit: "", quantity_on_hand: "0", reorder_threshold: "", unit_cost: "", notes: "", tracks_expiry: false };

const CATEGORIES = ["Raw Material", "Finished Good", "Packaging", "Trading Item", "Other"];
const UNITS = ["kg", "g", "pieces", "meters", "liters", "boxes", "rolls"];

const isLowStock = (item: any) => item.reorder_threshold != null && item.quantity_on_hand <= item.reorder_threshold;

// The ledger is append-only - no edit/delete here, only "record a new
// transaction" (see server/db/inventoryLedger.ts for why).
function LedgerSection({ item, canWrite, onRecorded }: { item: any; canWrite: boolean; onRecorded: () => void }) {
  const [transactions, setTransactions] = useState<InventoryTransaction[] | null>(null);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [type, setType] = useState<TransactionType>("in");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [batchId, setBatchId] = useState("");
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");

  const load = () => { listTransactions(item.id).then(setTransactions).catch((err: Error) => setError(err.message)); };
  const loadBatches = () => {
    if (item.tracks_expiry) listBatches(item.id).then((b) => { setBatches(b); setBatchId((cur) => cur || b.find((x) => x.quantityRemaining > 0)?.id || ""); });
  };
  useEffect(() => { load(); loadBatches(); }, [item.id]);

  const record = async () => {
    setError("");
    const qty = Number(quantity);
    if (!qty || qty <= 0) { setError("Enter a positive quantity"); return; }
    if (item.tracks_expiry && type === "out" && !batchId) { setError("Select a batch to remove stock from"); return; }
    setRecording(true);
    try {
      await recordTransaction(item.id, {
        type, quantity: qty, note: note.trim() || undefined,
        expiryDate: item.tracks_expiry && type === "in" ? (expiryDate || null) : undefined,
        batchId: item.tracks_expiry && type === "out" ? batchId : undefined,
      });
      setQuantity("");
      setNote("");
      setExpiryDate("");
      load();
      loadBatches();
      onRecorded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record transaction");
    } finally {
      setRecording(false);
    }
  };

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-2">Ledger</p>
      {transactions === null ? (
        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : transactions.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-2">No transactions recorded yet.</p>
      ) : (
        <div className="space-y-1.5 mb-3 max-h-48 overflow-y-auto">
          {transactions.map((t) => (
            <div key={t.id} className="flex items-center justify-between text-sm gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                {t.type === "in" ? <ArrowDownCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <ArrowUpCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                <span className={t.type === "in" ? "text-emerald-600 shrink-0" : "text-red-500 shrink-0"}>{t.type === "in" ? "+" : "-"}{t.quantity}</span>
                {t.note && <span className="text-muted-foreground text-xs truncate">- {t.note}</span>}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{new Date(t.createdDate).toLocaleDateString()} · {t.recordedBy || t.recordedByEmail || "-"}</span>
            </div>
          ))}
        </div>
      )}
      {canWrite && (
        <div className="flex items-end gap-2 pt-2 border-t border-border flex-wrap">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Type</label>
            <select
              value={type} onChange={(e) => setType(e.target.value as TransactionType)}
              className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground"
            >
              <option value="in">In</option>
              <option value="out">Out</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Quantity</label>
            <input
              type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)}
              className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground w-24"
            />
          </div>
          {item.tracks_expiry && type === "in" && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Expiry Date (optional)</label>
              <input
                type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)}
                className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground"
              />
            </div>
          )}
          {item.tracks_expiry && type === "out" && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Batch (earliest expiry first)</label>
              <select
                value={batchId} onChange={(e) => setBatchId(e.target.value)}
                className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground max-w-[220px]"
              >
                <option value="">Select a batch…</option>
                {batches.filter((b) => b.quantityRemaining > 0).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.quantityRemaining} {item.unit || ""} left{b.expiryDate ? ` · exp ${b.expiryDate}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1 flex-1 min-w-[140px]">
            <label className="text-xs text-muted-foreground">Note (optional)</label>
            <input
              type="text" value={note} onChange={(e) => setNote(e.target.value)}
              className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground w-full"
            />
          </div>
          <button
            onClick={record} disabled={recording}
            className="text-sm px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
          >
            {recording && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Record
          </button>
        </div>
      )}
      {error && <p className="text-xs text-destructive mt-2">{error}</p>}
    </div>
  );
}

const poStatusMap: Record<string, "green" | "amber" | "red"> = { received: "green", ordered: "amber", draft: "red" };

function ReceiveLineItem({ po, item, itemName, canWrite, onReceived }: {
  po: PurchaseOrder; item: PurchaseOrder["items"][number]; itemName: string; canWrite: boolean; onReceived: () => void;
}) {
  const [quantity, setQuantity] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [receiving, setReceiving] = useState(false);
  const [error, setError] = useState("");
  const remaining = item.quantityOrdered - item.quantityReceived;

  const receive = async () => {
    setError("");
    const qty = Number(quantity);
    if (!qty || qty <= 0) { setError("Enter a positive quantity"); return; }
    setReceiving(true);
    try {
      await receivePurchaseOrderItem(po.id, item.id, { quantity: qty, expiryDate: expiryDate || null });
      setQuantity("");
      setExpiryDate("");
      onReceived();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to receive item");
    } finally {
      setReceiving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-2 py-2 border-b border-border last:border-b-0 text-sm">
      <div className="min-w-[140px] flex-1">
        <p className="font-medium text-foreground">{itemName}</p>
        <p className="text-xs text-muted-foreground">{item.quantityReceived} / {item.quantityOrdered} received</p>
      </div>
      {canWrite && remaining > 0 && (
        <>
          <input
            type="number" placeholder="Qty" value={quantity} onChange={(e) => setQuantity(e.target.value)}
            className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground w-20"
          />
          <input
            type="date" title="Expiry date (optional)" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)}
            className="text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground"
          />
          <button
            onClick={receive} disabled={receiving}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
          >
            {receiving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Receive
          </button>
        </>
      )}
      {error && <p className="text-xs text-destructive w-full">{error}</p>}
    </div>
  );
}

function PurchaseOrdersSection({ items, divisionOptions, canWrite }: { items: any[]; divisionOptions: readonly string[]; canWrite: boolean }) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<PurchaseOrder | null>(null);
  const [form, setForm] = useState<{ division: string; vendor_name: string; order_date: string; lines: { item_id: string; quantity_ordered: string; unit_cost: string }[] }>(
    { division: divisionOptions[0] ?? "", vendor_name: "", order_date: "", lines: [{ item_id: "", quantity_ordered: "", unit_cost: "" }] },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    listPurchaseOrders().then((data) => {
      setOrders(data);
      setSelected((sel) => (sel ? data.find((o) => o.id === sel.id) ?? null : null));
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const itemName = (itemId: string) => items.find((i) => i.id === itemId)?.name || "Unknown item";

  const updateLine = (idx: number, patch: Partial<{ item_id: string; quantity_ordered: string; unit_cost: string }>) => {
    setForm((f) => ({ ...f, lines: f.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)) }));
  };
  const addLine = () => setForm((f) => ({ ...f, lines: [...f.lines, { item_id: "", quantity_ordered: "", unit_cost: "" }] }));
  const removeLine = (idx: number) => setForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }));

  const save = async () => {
    setError("");
    const lines = form.lines.filter((l) => l.item_id && Number(l.quantity_ordered) > 0);
    if (lines.length === 0) { setError("Add at least one line item with a quantity"); return; }
    setSaving(true);
    try {
      await createPurchaseOrder({
        division: form.division,
        vendorName: form.vendor_name || undefined,
        orderDate: form.order_date || undefined,
        items: lines.map((l) => ({ itemId: l.item_id, quantityOrdered: Number(l.quantity_ordered), unitCost: l.unit_cost ? Number(l.unit_cost) : null })),
      });
      setShowForm(false);
      setForm({ division: divisionOptions[0] ?? "", vendor_name: "", order_date: "", lines: [{ item_id: "", quantity_ordered: "", unit_cost: "" }] });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create purchase order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashCard title="Purchase Orders">
      {canWrite && (
        <div className="flex justify-end mb-3">
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 text-sm bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 transition"
          >
            <Plus className="w-4 h-4" /> New Purchase Order
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : orders.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No purchase orders yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left py-2 pr-4 font-medium">Vendor</th>
                <th className="text-left py-2 pr-4 font-medium">Department</th>
                <th className="text-left py-2 pr-4 font-medium">Order Date</th>
                <th className="text-left py-2 pr-4 font-medium">Items</th>
                <th className="text-left py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((po) => (
                <tr key={po.id} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                  <td className="py-2.5 pr-4">
                    <button onClick={() => setSelected(po)} className="font-medium text-foreground hover:text-primary text-left">{po.vendorName || "-"}</button>
                  </td>
                  <td className="py-2.5 pr-4 text-muted-foreground">{po.division}</td>
                  <td className="py-2.5 pr-4 text-muted-foreground">{po.orderDate || "-"}</td>
                  <td className="py-2.5 pr-4 text-muted-foreground">{po.items.length}</td>
                  <td className="py-2.5"><StatusBadge status={poStatusMap[po.status]}>{po.status}</StatusBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">New Purchase Order</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField label="Department *" name="division" options={divisionOptions} value={form.division} onChange={(_, v) => setForm((f) => ({ ...f, division: v }))} />
                <FormField label="Vendor" name="vendor_name" value={form.vendor_name} onChange={(_, v) => setForm((f) => ({ ...f, vendor_name: v }))} />
                <FormField label="Order Date" name="order_date" type="date" value={form.order_date} onChange={(_, v) => setForm((f) => ({ ...f, order_date: v }))} />
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Line Items</p>
                {form.lines.map((line, idx) => (
                  <div key={idx} className="flex gap-2 items-end">
                    <select
                      value={line.item_id} onChange={(e) => updateLine(idx, { item_id: e.target.value })}
                      className="flex-1 text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground"
                    >
                      <option value="">Select item…</option>
                      {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                    <input
                      type="number" placeholder="Qty" value={line.quantity_ordered} onChange={(e) => updateLine(idx, { quantity_ordered: e.target.value })}
                      className="w-20 text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground"
                    />
                    <input
                      type="number" placeholder="Unit ₹" value={line.unit_cost} onChange={(e) => updateLine(idx, { unit_cost: e.target.value })}
                      className="w-24 text-sm border border-border rounded-lg px-2 py-1.5 bg-background text-foreground"
                    />
                    {form.lines.length > 1 && (
                      <button onClick={() => removeLine(idx)} className="text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
                    )}
                  </div>
                ))}
                <button onClick={addLine} className="text-xs text-primary hover:underline">+ Add line item</button>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <div className="px-6 pb-6 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="text-sm px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted">Cancel</button>
              <button onClick={save} disabled={saving} className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Create
              </button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2"><PackageCheck className="w-4 h-4" /> {selected.vendorName || "Purchase Order"}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{selected.division} · <StatusBadge status={poStatusMap[selected.status]}>{selected.status}</StatusBadge></p>
              </div>
              <button onClick={() => setSelected(null)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-6">
              {selected.items.map((it) => (
                <ReceiveLineItem key={it.id} po={selected} item={it} itemName={itemName(it.itemId)} canWrite={canWrite} onReceived={load} />
              ))}
            </div>
          </div>
        </div>
      )}
    </DashCard>
  );
}

export default function InventoryTab() {
  const { user, can } = useAuth();
  const canWrite = can("Inventory", "write");
  const canDelete = can("Inventory", "delete");
  const divisionOptions = user?.divisionScope?.length ? user.divisionScope : DIVISIONS;
  const emptyForm = () => ({ ...EMPTY, division: divisionOptions[0] ?? "" });
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, any>>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const data = await Inventory.list();
    setItems(data);
    setLoading(false);
    // Keep the open detail modal's quantity in sync after a transaction.
    setSelected((sel: any) => (sel ? data.find((i: any) => i.id === sel.id) ?? null : null));
  };

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const payload = {
        ...form,
        quantity_on_hand: Number(form.quantity_on_hand) || 0,
        reorder_threshold: form.reorder_threshold === "" ? null : Number(form.reorder_threshold),
        unit_cost: form.unit_cost === "" ? null : Number(form.unit_cost),
      };
      await Inventory.create(payload);
      setShowForm(false);
      setForm(emptyForm());
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save item");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setError("");
    try {
      await Inventory.delete(id);
      setSelected(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete item");
    }
  };

  const updateField = (name: string, value: string) => setForm((f) => ({ ...f, [name]: value }));

  const lowStockCount = items.filter(isLowStock).length;
  const totalValue = items.reduce((s, i) => s + (i.quantity_on_hand || 0) * (i.unit_cost || 0), 0);

  const divStats = DIVISIONS.map((d) => ({
    name: d,
    count: items.filter((i) => i.division === d).length,
    lowStock: items.filter((i) => i.division === d && isLowStock(i)).length,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard label="Total Items" value={items.length} />
        <KpiCard
          label="Low Stock" value={lowStockCount} status={lowStockCount > 0 ? "amber" : "green"}
          sub={lowStockCount > 0 ? "Needs reorder" : "All good"}
        />
        <KpiCard label="Total Value" value={`₹${totalValue.toLocaleString()}`} sub="Across all items" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {divStats.map((d) => (
          <DashCard key={d.name}>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: divisionColors[d.name] || DEFAULT_DIVISION_COLOR }} />
              <span className="text-sm font-medium text-foreground">{d.name}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{d.count}</p>
            <p className="text-xs text-muted-foreground mt-1">{d.lowStock > 0 ? `${d.lowStock} low stock` : "Stock OK"}</p>
          </DashCard>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <DashCard title="Inventory Items">
        {canWrite && (
          <div className="flex justify-end mb-3">
            <button
              onClick={() => { setForm(emptyForm()); setShowForm(true); }}
              className="flex items-center gap-2 text-sm bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 transition"
            >
              <Plus className="w-4 h-4" /> Add Item
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No inventory items yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-4 font-medium">Name</th>
                  <th className="text-left py-2 pr-4 font-medium">SKU</th>
                  <th className="text-left py-2 pr-4 font-medium">Department</th>
                  <th className="text-left py-2 pr-4 font-medium">Category</th>
                  <th className="text-left py-2 font-medium">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-b-0 hover:bg-muted/30">
                    <td className="py-2.5 pr-4">
                      <button onClick={() => setSelected(item)} className="font-medium text-foreground hover:text-primary text-left">{item.name}</button>
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{item.sku || "-"}</td>
                    <td className="py-2.5 pr-4">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${divisionColors[item.division] || DEFAULT_DIVISION_COLOR}20`, color: divisionColors[item.division] || DEFAULT_DIVISION_COLOR }}
                      >
                        {item.division}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{item.category || "-"}</td>
                    <td className="py-2.5 text-muted-foreground">
                      {item.quantity_on_hand} {item.unit}
                      {isLowStock(item) && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 inline ml-1.5" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashCard>

      <PurchaseOrdersSection items={items} divisionOptions={divisionOptions} canWrite={canWrite} />

      {/* Add Item Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Add Item</h2>
              <button onClick={() => setShowForm(false)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label="Name *" name="name" value={form.name ?? ""} onChange={updateField} />
              <FormField label="SKU" name="sku" value={form.sku ?? ""} onChange={updateField} />
              <FormField label="Department *" name="division" options={divisionOptions} value={form.division ?? ""} onChange={updateField} />
              <FormField label="Category" name="category" options={CATEGORIES} value={form.category ?? ""} onChange={updateField} />
              <FormField label="Unit" name="unit" options={UNITS} value={form.unit ?? ""} onChange={updateField} />
              <FormField label="Opening Quantity" name="quantity_on_hand" type="number" value={form.quantity_on_hand ?? ""} onChange={updateField} />
              <FormField label="Reorder Threshold" name="reorder_threshold" type="number" value={form.reorder_threshold ?? ""} onChange={updateField} />
              <FormField label="Unit Cost (₹)" name="unit_cost" type="number" value={form.unit_cost ?? ""} onChange={updateField} />
              <div className="sm:col-span-2 flex items-center gap-2">
                <input
                  type="checkbox" id="tracks_expiry" checked={!!form.tracks_expiry}
                  onChange={(e) => setForm((f) => ({ ...f, tracks_expiry: e.target.checked }))}
                />
                <label htmlFor="tracks_expiry" className="text-sm text-foreground">Track expiry dates (batch/lot mode)</label>
              </div>
              <div className="sm:col-span-2"><FormField label="Notes" name="notes" value={form.notes ?? ""} onChange={updateField} /></div>
            </div>
            <div className="px-6 pb-6 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="text-sm px-4 py-2 rounded-lg border border-border text-muted-foreground hover:bg-muted">Cancel</button>
              <button onClick={save} disabled={saving} className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl border border-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">{selected.name}</h2>
              <button onClick={() => setSelected(null)}><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-6 space-y-3 text-sm">
              {(
                [
                  ["SKU", selected.sku],
                  ["Department", selected.division],
                  ["Category", selected.category],
                  ["Quantity on Hand", `${selected.quantity_on_hand} ${selected.unit || ""}`],
                  ["Reorder Threshold", selected.reorder_threshold],
                  ["Unit Cost", selected.unit_cost ? `₹${selected.unit_cost}` : null],
                  ["Notes", selected.notes],
                ] as [string, React.ReactNode][]
              ).map(([k, v]) => (v ? (
                <div key={k} className="flex justify-between border-b border-border pb-2 last:border-b-0">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="text-foreground font-medium text-right">{v}</span>
                </div>
              ) : null))}
            </div>
            <div className="px-6 pb-6 border-t border-border pt-4">
              <LedgerSection item={selected} canWrite={canWrite} onRecorded={load} />
            </div>
            {canDelete && (
              <div className="px-6 pb-6">
                <button onClick={() => remove(selected.id)} className="text-xs text-red-500 hover:underline">Delete Item</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
