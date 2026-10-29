// Public guest self check-in. Reached from the QR code at the venue
// (/check-a-table?t=<token>). Logged out, mobile first, its own warm look.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  rememberToken, savedSpotId, saveSpotId, getConfig, checkTable, joinList, getSpot, leaveList, getMenu,
  type CheckResult, type Spot,
} from "@/api/publicCheckinApi";
import { localDigits, formatLocal, waLink, venueMessage, rupees } from "@/lib/checkin";

const STYLES = `
.cat{--bg:#faf7f2;--card:#fff;--ink:#241f1a;--mut:#7a6f64;--acc:#c2410c;--acc2:#fff;--ok:#15803d;--okbg:#e7f6ec;--wt:#b45309;--wtbg:#fdf0dc;--bd:#e6ded3;
background:var(--bg);color:var(--ink);font-family:Georgia,"Times New Roman",serif;min-height:100vh;box-sizing:border-box}
@media (prefers-color-scheme:dark){.cat{--bg:#16130f;--card:#201c17;--ink:#f3ece3;--mut:#a89c8e;--acc:#f97316;--acc2:#1a1208;--ok:#4ade80;--okbg:#12301c;--wt:#fbbf24;--wtbg:#3a2a0c;--bd:#352f27;color-scheme:dark}}
.cat *{box-sizing:border-box}
.cat main{max-width:460px;margin:0 auto;padding:28px 18px 110px}
.cat h1{font-size:30px;margin:0 0 4px;letter-spacing:-.5px}
.cat .sub{color:var(--mut);margin:0 0 24px;font:15px system-ui,sans-serif}
.cat label.t{display:block;font:600 12px system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);margin:22px 0 8px}
.cat .row{display:grid;gap:8px}
.cat .sizes{grid-template-columns:repeat(5,1fr)}
.cat button.opt{font:600 16px system-ui,sans-serif;padding:14px 4px;border:1.5px solid var(--bd);background:var(--card);color:var(--ink);border-radius:12px;cursor:pointer}
.cat button.opt[aria-pressed="true"]{border-color:var(--acc);background:var(--acc);color:var(--acc2)}
.cat .venues button.opt{padding:18px 4px}
.cat .wa{display:flex;border:1.5px solid var(--bd);border-radius:12px;background:var(--card);overflow:hidden}
.cat .wa span{padding:14px 12px;font:600 16px system-ui,sans-serif;color:var(--mut);border-right:1px solid var(--bd)}
.cat input.txt,.cat .wa input{flex:1;min-width:0;border:0;background:transparent;color:var(--ink);font:16px system-ui,sans-serif;padding:14px 12px;outline:none}
.cat input.txt{width:100%;border:1.5px solid var(--bd);background:var(--card);border-radius:12px}
.cat .go{display:block;width:100%;margin-top:26px;padding:16px;border:0;border-radius:12px;background:var(--acc);color:var(--acc2);font:700 17px system-ui,sans-serif;cursor:pointer}
.cat .go:disabled{opacity:.6;cursor:default}
.cat .ghost{display:block;width:100%;margin-top:12px;padding:12px;border:1.5px solid var(--bd);border-radius:12px;background:transparent;color:var(--ink);font:600 15px system-ui,sans-serif;cursor:pointer}
.cat .err{color:#dc2626;font:14px system-ui,sans-serif;margin-top:8px;min-height:18px}
.cat .res{margin-top:24px;border-radius:16px;padding:22px;font-family:system-ui,sans-serif}
.cat .res.ok{background:var(--okbg);color:var(--ok)}
.cat .res.wait{background:var(--wtbg);color:var(--wt)}
.cat .res .big{font:700 34px Georgia,serif;margin:6px 0}
.cat .res p{margin:4px 0;color:var(--ink);font-size:15px}
.cat .res a.wal{display:block;margin-top:16px;text-align:center;background:#25d366;color:#fff;text-decoration:none;font-weight:700;padding:14px;border-radius:12px}
.cat .stat{margin-top:18px;color:var(--mut);font:13px system-ui,sans-serif;text-align:center}
.cat .bar{position:fixed;left:0;right:0;bottom:0;display:flex;gap:10px;padding:12px 16px calc(12px + env(safe-area-inset-bottom,0px));background:var(--card);border-top:1px solid var(--bd);z-index:5}
.cat .bar button,.cat .bar a{flex:1;padding:14px;border-radius:12px;font:700 16px system-ui,sans-serif;cursor:pointer;border:1.5px solid var(--acc);background:transparent;color:var(--acc);text-align:center;text-decoration:none}
.cat .bar .fill{background:var(--acc);color:var(--acc2)}
.cat .sheet{position:fixed;inset:0;background:var(--bg);z-index:10;display:flex;flex-direction:column}
.cat .sh{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid var(--bd)}
.cat .sh h2{margin:0;font-size:24px}
.cat .sh button{border:0;background:var(--card);color:var(--ink);width:36px;height:36px;border-radius:18px;font-size:18px;cursor:pointer}
.cat .tabs{display:flex;gap:8px;padding:12px 18px 0}
.cat .tabs button{flex:1;padding:10px 4px;border:1.5px solid var(--bd);background:var(--card);color:var(--ink);border-radius:10px;font:600 14px system-ui,sans-serif;cursor:pointer}
.cat .tabs button[aria-pressed="true"]{background:var(--acc);border-color:var(--acc);color:var(--acc2)}
.cat .list{flex:1;overflow-y:auto;padding:8px 18px 24px;max-width:520px;width:100%;margin:0 auto}
.cat .list h3{font:600 12px system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);margin:20px 0 6px}
.cat .it{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--bd)}
.cat .it b{display:block;font-size:17px}
.cat .it small{color:var(--mut);font:13px system-ui,sans-serif}
.cat .pr{font:600 15px system-ui,sans-serif;white-space:nowrap}
.cat .empty{color:var(--mut);font:15px system-ui,sans-serif;padding:24px 0;text-align:center}
`;

type Phase = "form" | "result";

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="cat"><style>{STYLES}</style>{children}</div>;
}

function MenuSheet({ token, areas, startArea, onClose }: {
  token: string; areas: { id: string; name: string }[]; startArea: string; onClose: () => void;
}) {
  const [areaId, setAreaId] = useState(startArea);
  const q = useQuery({ queryKey: ["checkin-menu", areaId], queryFn: () => getMenu(token, areaId) });
  return (
    <div className="sheet" role="dialog" aria-label="Menu">
      <div className="sh"><h2>Menu</h2><button type="button" onClick={onClose} aria-label="Close">{"✕"}</button></div>
      {areas.length > 1 && (
        <div className="tabs">
          {areas.map((a) => (
            <button key={a.id} type="button" aria-pressed={a.id === areaId} onClick={() => setAreaId(a.id)}>{a.name}</button>
          ))}
        </div>
      )}
      <div className="list">
        {q.isLoading && <div className="empty">Loading...</div>}
        {q.data && q.data.length === 0 && <div className="empty">The menu isn't online yet. Ask our host.</div>}
        {q.data?.map((s) => (
          <div key={s.id}>
            <h3>{s.name}</h3>
            {s.items.map((i) => (
              <div className="it" key={i.id}>
                <div><b>{i.name}</b>{i.description && <small>{i.description}</small>}</div>
                <span className="pr">{rupees(i.priceInr)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CheckATable() {
  const [params] = useSearchParams();
  const [token] = useState(() => rememberToken(params.get("t")));
  const [areaId, setAreaId] = useState<string | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const cfg = useQuery({ queryKey: ["checkin-config", token], queryFn: () => getConfig(token!), enabled: !!token, retry: false });

  // Come back to an existing spot after a refresh.
  useEffect(() => {
    const id = savedSpotId();
    if (!token || !id) return;
    getSpot(token, id)
      .then((s) => (s.state === "left" ? saveSpotId(null) : setSpot(s)))
      .catch(() => saveSpotId(null));
  }, [token]);

  // Keep the spot fresh while waiting.
  useEffect(() => {
    if (!token || !spot || spot.state === "left" || spot.state === "seated") return;
    const t = setInterval(() => {
      getSpot(token, spot.id).then(setSpot).catch(() => { /* keep the last known state */ });
    }, 20_000);
    return () => clearInterval(t);
  }, [token, spot]);

  const area = cfg.data?.areas.find((a) => a.id === areaId) ?? null;
  const venueWa = cfg.data?.venueWhatsapp ?? null;

  const reset = useCallback(() => {
    saveSpotId(null);
    setSpot(null);
    setResult(null);
    setPhase("form");
    setError("");
  }, []);

  if (!token || (cfg.error as { status?: number } | null)?.status === 403) {
    return (
      <Shell><main>
        <h1>Find your table</h1>
        <p className="sub">Please scan the code at the venue to use this page.</p>
      </main></Shell>
    );
  }
  if (cfg.isLoading) return <Shell><main><p className="sub">Loading...</p></main></Shell>;
  if (cfg.error || !cfg.data) {
    return <Shell><main><h1>Find your table</h1><p className="sub">Something went wrong. Please speak to our host.</p></main></Shell>;
  }
  const config = cfg.data;

  const runCheck = async () => {
    if (!area) return setError("Please choose where you would like to sit.");
    if (!size) return setError("Please choose the number of people.");
    setError("");
    setBusy(true);
    try {
      setResult(await checkTable(token, area.id, size));
      setPhase("result");
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    if (!area || !size) return;
    const digits = localDigits(phone);
    if (!digits) return setError("Enter a valid 10-digit WhatsApp number.");
    setError("");
    setBusy(true);
    try {
      const r = await joinList(token, { areaId: area.id, partySize: size, phone: digits, name: name.trim() || undefined });
      saveSpotId(r.spot.id);
      setSpot(r.spot);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (!spot) return;
    setBusy(true);
    try {
      await leaveList(token, spot.id);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const bar = (
    <div className="bar">
      <button type="button" onClick={() => setMenuOpen(true)}>Browse menu</button>
      <a className="fill" href={config.shopUrl} target="_blank" rel="noopener noreferrer">Shop</a>
    </div>
  );
  const sheet = menuOpen && (
    <MenuSheet token={token} areas={config.areas} startArea={areaId ?? config.areas[0]?.id ?? ""} onClose={() => setMenuOpen(false)} />
  );

  // On the list (or seated): show the spot instead of the form.
  if (spot) {
    
    const msg = `Hi! I'm on your list at the ${spot.areaName ?? "venue"} for ${spot.partySize}. Spot ${spot.id.slice(0, 6)}.`;
    return (
      <Shell>
        <main>
          <h1>Find your table</h1>
          {spot.state === "seated" && (
            <div className="res ok"><b>You're seated</b><div className="big">Enjoy your visit</div><p>Our host has taken you to your table.</p></div>
          )}
          {spot.state === "ready" && (
            <div className="res ok"><b>Your table is ready</b><div className="big">Please come in</div><p>Show this screen to our host.</p></div>
          )}
          {spot.state === "waiting" && (
            <div className="res wait">
              <b>You're on the list</b>
              <div className="big">{spot.position ? `No. ${spot.position}` : "Waiting"}</div>
              <p>
                {spot.areaName ?? "Venue"}, party of {spot.partySize}.
                {spot.quotedWaitMinutes ? ` We quoted about ${spot.quotedWaitMinutes} min.` : " A table was free when you joined."}
              </p>
              <p>We'll message you on WhatsApp when your table is ready.</p>
              {venueWa && <a className="wal" href={waLink(venueWa!, msg)} target="_blank" rel="noopener noreferrer">Message the venue on WhatsApp</a>}
            </div>
          )}
          <div className="err">{error}</div>
          {spot.state === "waiting" || spot.state === "ready"
            ? <button className="ghost" type="button" disabled={busy} onClick={leave}>Leave the list</button>
            : <button className="ghost" type="button" onClick={reset}>Check another table</button>}
        </main>
        {bar}{sheet}
      </Shell>
    );
  }

  const title = area?.name ?? "";
  return (
    <Shell>
      <main>
        <h1>Find your table</h1>
        <p className="sub">Tell us where and how many. We'll check availability right away.</p>

        <label className="t">Where would you like to sit?</label>
        <div className="row venues" style={{ gridTemplateColumns: `repeat(${Math.min(3, Math.max(1, config.areas.length))},1fr)` }}>
          {config.areas.map((a) => (
            <button key={a.id} type="button" className="opt" aria-pressed={a.id === areaId}
              onClick={() => { setAreaId(a.id); setPhase("form"); setResult(null); }}>{a.name}</button>
          ))}
        </div>

        <label className="t">Number of people</label>
        <div className="row sizes">
          {Array.from({ length: config.maxPartySize }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" className="opt" aria-pressed={n === size}
              onClick={() => { setSize(n); setPhase("form"); setResult(null); }}>{n < 10 ? `0${n}` : n}</button>
          ))}
        </div>

        <button className="go" type="button" disabled={busy} onClick={runCheck}>Check availability</button>
        {phase === "form" && <div className="err">{error}</div>}

        {phase === "result" && result && (
          <div ref={resultRef}>
            {result.status === "too_large" && (
              <div className="res wait"><b>Sorry</b><div className="big">Too large</div>
                <p>We can't seat {size} together in the {title}. Please speak to our host.</p></div>
            )}
            {result.status === "long_wait" && (
              <div className="res wait"><b>Busy right now</b><div className="big">Long wait</div>
                <p>The {title} has a long wait. Please speak to our host.</p></div>
            )}
            {result.status === "available" && (
              <div className="res ok"><b>Good news</b><div className="big">Table available {"✓"}</div>
                <p>A table for {size}{result.joined ? " (two tables joined)" : ""} is ready in the {title}. Tell us you're coming and walk in.</p></div>
            )}
            {result.status === "wait" && (
              <div className="res wait"><b>Estimated wait</b><div className="big">~ {result.minutes} min</div>
                <p>All suitable tables in the {title} are reserved or occupied
                  {result.partiesAhead ? ` and ${result.partiesAhead} ${result.partiesAhead > 1 ? "parties are" : "party is"} ahead of you` : ""}.</p></div>
            )}
            {(result.status === "available" || result.status === "wait") && (
              <>
                <label className="t">Your name (optional)</label>
                <input className="txt" value={name} maxLength={60} autoComplete="given-name" placeholder="So we can call you"
                  onChange={(e) => setName(e.target.value)} />
                <label className="t">Your WhatsApp number</label>
                <div className="wa">
                  <span>+91</span>
                  <input type="tel" inputMode="numeric" placeholder="98765 43210" maxLength={14} autoComplete="tel-national"
                    value={phone} onChange={(e) => setPhone(formatLocal(e.target.value))} />
                </div>
                <div className="err">{error}</div>
                <button className="go" type="button" disabled={busy} onClick={join} style={{ marginTop: 8 }}>
                  {result.status === "available" ? "Tell the host I'm coming" : "Join the waiting list"}
                </button>
                {venueWa && size && (
                  <a className="ghost" style={{ textAlign: "center", textDecoration: "none" }} target="_blank" rel="noopener noreferrer"
                    href={waLink(venueWa, venueMessage(title, size, localDigits(phone) ?? phone.replace(/\D/g, "")))}>
                    Message the venue on WhatsApp instead
                  </a>
                )}
              </>
            )}
            <div className="stat">{result.tablesFree} of {result.tablesTotal} tables free in the {title} right now</div>
          </div>
        )}
      </main>
      {bar}{sheet}
    </Shell>
  );
}
