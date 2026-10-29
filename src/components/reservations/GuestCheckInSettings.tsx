// "Guest check-in" tab: switch the public Check a Table page on, tune the wait
// maths, choose which areas guests can pick, and print the on-site QR code.
import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Loader2, Printer, Download, RefreshCw } from "lucide-react";
import DashCard from "@/components/dashboard/DashCard";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  getCheckinSettings, updateCheckinSettings, rotateCheckinToken, getCheckinAreas, setAreaOffered,
  type CheckinSettings, type CheckinArea,
} from "@/api/checkinAdminApi";
import { areaLabel } from "@/api/reservationsApi";

const field = "w-full text-sm border border-border rounded-lg px-3 py-2 bg-background text-foreground";

type NumKey = "bookingBufferMinutes" | "minutesPerParty" | "maxWaitMinutes";
const NUMBERS: { key: NumKey; label: string; hint: string }[] = [
  { key: "bookingBufferMinutes", label: "Booking buffer (min)", hint: "A table counts as taken this long before a booking starts." },
  { key: "minutesPerParty", label: "Minutes per party ahead", hint: "Added to the wait for each party already waiting." },
  { key: "maxWaitMinutes", label: "Longest wait quoted (min)", hint: "Past this the page says to speak to the host." },
];

export default function GuestCheckInSettings({ canWrite }: { canWrite: boolean }) {
  const [areas, setAreas] = useState<CheckinArea[]>([]);
  const [s, setS] = useState<CheckinSettings | null>(null);
  const [form, setForm] = useState<Record<NumKey, string>>({ bookingBufferMinutes: "", minutesPerParty: "", maxWaitMinutes: "" });
  const [whatsapp, setWhatsapp] = useState("");
  const [shopUrl, setShopUrl] = useState("");
  const [qr, setQr] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);

  const load = (row: CheckinSettings) => {
    setS(row);
    setForm({
      bookingBufferMinutes: String(row.bookingBufferMinutes), minutesPerParty: String(row.minutesPerParty),
      maxWaitMinutes: String(row.maxWaitMinutes),
    });
    setWhatsapp(row.venueWhatsapp ?? "");
    setShopUrl(row.shopUrl);
  };
  const loadAreas = () => getCheckinAreas().then(setAreas).catch((e) => setError(e instanceof Error ? e.message : "Failed to load areas"));
  useEffect(() => {
    loadAreas();
    getCheckinSettings().then(load).catch((e) => setError(e instanceof Error ? e.message : "Failed to load settings"));
  }, []);

  const link = s ? `${window.location.origin}/check-a-table?t=${s.token}` : "";
  useEffect(() => {
    if (!link) return;
    QRCode.toDataURL(link, { width: 640, margin: 2, errorCorrectionLevel: "M" }).then(setQr).catch(() => setQr(""));
  }, [link]);

  const run = async (fn: () => Promise<void>, done: string) => {
    setError(""); setMsg(""); setSaving(true);
    try { await fn(); setMsg(done); } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } finally { setSaving(false); }
  };

  const save = () => run(async () => {
    load(await updateCheckinSettings({
      bookingBufferMinutes: Number(form.bookingBufferMinutes), minutesPerParty: Number(form.minutesPerParty),
      maxWaitMinutes: Number(form.maxWaitMinutes),
      venueWhatsapp: whatsapp.trim() || null, shopUrl: shopUrl.trim(),
    }));
  }, "Saved");

  const toggleEnabled = () => run(async () => { load(await updateCheckinSettings({ enabled: !s!.enabled })); }, s?.enabled ? "Check-in is off" : "Check-in is on");

  const toggleArea = (a: CheckinArea) => run(async () => {
    await setAreaOffered(a.id, !a.offered);
    await loadAreas();
  }, "Saved");

  const rotate = () => run(async () => { load(await rotateCheckinToken()); setConfirmRotate(false); }, "New code created. Reprint it, the old one no longer works.");

  const download = () => {
    const a = document.createElement("a");
    a.href = qr; a.download = "check-a-table-qr.png"; a.click();
  };
  const print = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<title>Check a Table</title><body style="font-family:Georgia,serif;text-align:center;margin:48px"><h1>Find your table</h1><p>Scan to check availability and join the waiting list.</p><img src="${qr}" style="width:360px"><script>onload=()=>print()<\/script>`);
    w.document.close();
  };

  if (!s) return error ? <p className="text-sm text-destructive">{error}</p> : <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <DashCard title="Guest check-in page">
          <p className="text-xs text-muted-foreground mb-3">Guests scan the QR code, see if a table is free and join the waiting list.</p>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-foreground">{s.enabled ? "On: the page accepts check-ins." : "Off: the QR code shows a notice and nobody can join."}</p>
            <button
              onClick={toggleEnabled} disabled={!canWrite || saving}
              className={`text-sm px-4 py-2 rounded-lg disabled:opacity-50 ${s.enabled ? "border border-border text-muted-foreground hover:bg-muted" : "bg-primary text-primary-foreground hover:opacity-90"}`}
            >{s.enabled ? "Turn off" : "Turn on"}</button>
          </div>
        </DashCard>

        <DashCard title="Areas guests can pick">
          <p className="text-xs text-muted-foreground mb-3">
            Every area with tables is offered automatically. Untick one to hide it. The largest party comes from the tables:
            the biggest group that may be merged, overflow seats included. Set that up under Locations &amp; Tables.
          </p>
          <div className="space-y-2">
            {areas.length === 0 && <p className="text-sm text-muted-foreground">No areas yet. Add them under Locations &amp; Tables.</p>}
            {areas.map((a) => (
              <label key={a.id} className={`flex items-center gap-2 text-sm ${a.tables === 0 ? "text-muted-foreground" : "text-foreground"}`}>
                <input type="checkbox" checked={a.offered && a.tables > 0} disabled={!canWrite || saving || a.tables === 0} onChange={() => toggleArea(a)} />
                {areaLabel(a)}
                <span className="text-xs text-muted-foreground">{a.tables === 0 ? "no tables" : `up to ${a.maxParty} ${a.maxParty === 1 ? "guest" : "guests"}`}</span>
              </label>
            ))}
          </div>
        </DashCard>

        <DashCard title="Wait rules">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {NUMBERS.map((n) => (
              <div key={n.key}>
                <label className="text-xs text-muted-foreground block mb-1">{n.label}</label>
                <input type="number" min={0} className={field} value={form[n.key]} disabled={!canWrite}
                  onChange={(e) => setForm((f) => ({ ...f, [n.key]: e.target.value }))} />
                <p className="text-xs text-muted-foreground mt-1">{n.hint}</p>
              </div>
            ))}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Venue WhatsApp</label>
              <input className={field} value={whatsapp} placeholder="98765 43210" disabled={!canWrite} onChange={(e) => setWhatsapp(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">Guests message this number. A 10-digit number is treated as Indian.</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Shop link</label>
              <input className={field} value={shopUrl} disabled={!canWrite} onChange={(e) => setShopUrl(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-xs text-destructive mt-3">{error}</p>}
          {msg && <p className="text-xs text-muted-foreground mt-3">{msg}</p>}
          {canWrite && (
            <div className="mt-4 flex justify-end">
              <button onClick={save} disabled={saving} className="text-sm px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
              </button>
            </div>
          )}
        </DashCard>
      </div>

      <DashCard title="On-site QR code">
        <p className="text-xs text-muted-foreground mb-3 text-center">Print it for the door and tables. Anyone with the link can check in, so rotate it if it leaks.</p>
        <div className="flex flex-col items-center gap-4">
          {qr ? <img src={qr} alt="QR code for the check-in page" className="w-64 h-64 rounded-lg border border-border bg-white" /> : <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
          <code className="text-xs text-muted-foreground break-all text-center">{link}</code>
          <div className="flex flex-wrap justify-center gap-2">
            <button onClick={print} disabled={!qr} className="text-sm px-3 py-2 rounded-lg border border-border hover:bg-muted flex items-center gap-1.5 disabled:opacity-50"><Printer className="w-4 h-4" /> Print</button>
            <button onClick={download} disabled={!qr} className="text-sm px-3 py-2 rounded-lg border border-border hover:bg-muted flex items-center gap-1.5 disabled:opacity-50"><Download className="w-4 h-4" /> Download</button>
            {canWrite && (
              <button onClick={() => setConfirmRotate(true)} className="text-sm px-3 py-2 rounded-lg border border-border text-destructive hover:bg-muted flex items-center gap-1.5"><RefreshCw className="w-4 h-4" /> Rotate code</button>
            )}
          </div>
        </div>
      </DashCard>

      <ConfirmDialog
        open={confirmRotate} onOpenChange={setConfirmRotate}
        title="Rotate the QR code?"
        description="Every printed code and saved link stops working until you reprint the new one."
        confirmLabel="Rotate" destructive loading={saving}
        onConfirm={rotate}
      />
    </div>
  );
}
