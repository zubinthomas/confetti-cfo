// The live, on-premises slice of the guest register: today's physical queue
// (Waiting) and who's currently seated. Shared by Guest Register
// (GuestRegister.tsx) and Floor View's Waiting panel (RestaurantFloorView.tsx),
// so the two can never disagree about who's waiting. The "Signed out" history
// browsing stays in GuestRegister.tsx only - it's lookback, not live service.
// Same discipline as useFloorData.ts: this hook owns the data and mutations,
// callers decide when to (re)load (mount, polling, after a dialog closes).
import { useState, useMemo } from "react";
import {
  listSignIns, extendSignIn, notifyGuest, reorderSignIn, signOutGuest, deleteSignIn,
  type GuestSignIn,
} from "@/api/guestSignInsApi";
import { listTableMerges, type TableMerge } from "@/api/reservationsApi";
import { checkWaitlistMatch } from "@/lib/waitlistMatch";
import { waPhone, waLink, tableReadyMessage } from "@/lib/checkin";

export function useGuestQueue() {
  const [onPremises, setOnPremises] = useState<GuestSignIn[] | null>(null);
  const [merges, setMerges] = useState<TableMerge[]>([]);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  const load = async () => {
    setError("");
    try {
      const [live, ms] = await Promise.all([
        listSignIns({ onPremisesOnly: true }),
        listTableMerges().catch(() => [] as TableMerge[]),
      ]);
      setOnPremises(live);
      setMerges(ms);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load the register");
    }
  };

  // The physical queue at the door: on premises, no table yet. Sorted the
  // same way the server does for unseatedOnly, so the up/down reorder
  // buttons match what's on screen.
  const waiting = useMemo(
    () => (onPremises ?? [])
      .filter((s) => !s.tableId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.signedInAt.localeCompare(b.signedInAt)),
    [onPremises],
  );
  const seated = useMemo(() => (onPremises ?? []).filter((s) => s.tableId), [onPremises]);

  // Tables with a walk-in sitting at them now, so the merge picker can skip
  // them. Seated *bookings* aren't in this list (the register doesn't load
  // reservations) but the server re-checks occupancy on merge-and-seat.
  const occupiedTableIds = useMemo(
    () => new Set((onPremises ?? []).filter((s) => s.tableId).map((s) => s.tableId as string)),
    [onPremises],
  );

  const runAction = async (fn: () => Promise<unknown>) => {
    setActionError("");
    try { await fn(); await load(); return true; }
    catch (err) { setActionError(err instanceof Error ? err.message : "Action failed"); return false; }
  };

  const doExtend = (id: string, minutes: number) => runAction(() => extendSignIn(id, minutes));

  // With a usable number the host messages the guest on WhatsApp (a prefilled
  // link, opened before any await so the browser lets the tab through), then
  // the entry is marked notified. Without one it is the plain "staff called" mark.
  const doNotify = async (s: GuestSignIn) => {
    const phone = waPhone(s.guestPhone);
    if (phone) {
      window.open(waLink(phone, tableReadyMessage(s.guestName, s.partySize, s.areaName)), "_blank", "noopener");
    }
    setNotifyingId(s.id);
    await runAction(() => notifyGuest(s.id, phone ? "whatsapp" : undefined));
    setNotifyingId(null);
  };

  const doReorder = async (s: GuestSignIn, direction: "up" | "down") => {
    setReorderingId(s.id);
    await runAction(() => reorderSignIn(s.id, direction));
    setReorderingId(null);
  };

  const doSignOut = async (s: GuestSignIn) => {
    const done = await runAction(() => signOutGuest(s.id));
    if (done && s.tableId && s.tableName && s.areaId) {
      checkWaitlistMatch({
        name: s.tableName, areaId: s.areaId,
        capacity: s.tableCapacity ?? 0, maxExtraCapacity: s.tableMaxExtraCapacity ?? 0,
      });
    }
    return done;
  };

  const doDelete = (id: string) => runAction(() => deleteSignIn(id));

  return {
    onPremises, merges, occupiedTableIds, waiting, seated,
    error, setError, actionError, setActionError,
    load,
    notifyingId, reorderingId,
    doNotify, doReorder, doExtend, doSignOut, doDelete,
  };
}
