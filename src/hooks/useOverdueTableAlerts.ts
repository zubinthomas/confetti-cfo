// App-wide watch for occupied tables running past their estimated end, so
// staff get told even while working a different page entirely (HR,
// Inventory, ...) rather than only noticing by looking at the floor. There's
// no push/notification channel in this app - this is a poll-and-toast, so
// "notified" really means "every currently-open, permitted tab noticed."
import { useEffect, useRef } from "react";
import { listReservations, type Reservation } from "@/api/reservationsApi";
import { listSignIns, type GuestSignIn } from "@/api/guestSignInsApi";
import { endTime, isOverdueBooking, isOverdueSignIn } from "@/components/reservations/reservationUi";
import { istDateStr, istClock } from "@/lib/ist";
import { toast } from "@/components/ui/use-toast";

const POLL_MS = 30_000;
const REMINDER_MS = 15 * 60_000;

/** Polls today's seated bookings and named walk-ins; toasts the moment one
 *  runs past its estimated end, then again every REMINDER_MS while it stays
 *  overdue and unattended. `enabled` is the caller's "has permission to see
 *  the queue at all" check - false makes this a no-op. */
export function useOverdueTableAlerts(enabled: boolean) {
  const lastNotified = useRef(new Map<string, number>());

  useEffect(() => {
    if (!enabled) return;

    const check = async () => {
      if (document.hidden) return;
      const [bookings, signIns] = await Promise.all([
        listReservations({ date: istDateStr() }).catch(() => [] as Reservation[]),
        // Not date-filtered - a sign-in nobody ever signed out can be
        // overdue from a previous calendar day, not just today.
        listSignIns({ onPremisesOnly: true }).catch(() => [] as GuestSignIn[]),
      ]);
      const now = new Date();
      const seen = new Set<string>();

      const overdue: { id: string; message: string }[] = [];
      for (const b of bookings) {
        if (!isOverdueBooking(b, now)) continue;
        overdue.push({ id: b.id, message: `Table ${b.tableName} (${b.areaName}) was due to clear at ${endTime(b.time, b.durationMinutes)} - ${b.guestName}` });
      }
      for (const g of signIns) {
        if (!isOverdueSignIn(g, now)) continue;
        overdue.push({ id: g.id, message: `Table ${g.tableName} (${g.areaName}) was due to clear at ${istClock(g.expectedUntil)} - ${g.guestName}` });
      }

      for (const { id, message } of overdue) {
        seen.add(id);
        const last = lastNotified.current.get(id);
        if (last === undefined || now.getTime() - last >= REMINDER_MS) {
          toast({ title: "Table overdue", description: message });
          lastNotified.current.set(id, now.getTime());
        }
      }
      // Clear ids that are no longer overdue (freed, extended, signed out),
      // so a later, separate overdue episode starts its own fresh cycle.
      for (const id of lastNotified.current.keys()) {
        if (!seen.has(id)) lastNotified.current.delete(id);
      }
    };

    check();
    const timer = setInterval(check, POLL_MS);
    return () => clearInterval(timer);
  }, [enabled]);
}
