// Best-effort, client-side-only nudge: after a table frees up (day view's
// "Free table", Guest Register's sign-out, a merge split), check the queue
// (unseated, on-premises sign-ins) for the first party it could seat and
// toast staff. No server push - this just reflects what the mutation that
// just succeeded changed, so a stale read or a race with another terminal is
// harmless, not a data bug.
import { listSignIns } from "@/api/guestSignInsApi";
import { toast } from "@/components/ui/use-toast";
import type { ReservationTable } from "@/api/reservationsApi";

export function elapsedLabel(since: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${m ? ` ${m}m` : ""}`;
}

export async function checkWaitlistMatch(
  table: Pick<ReservationTable, "name" | "locationId" | "capacity" | "maxExtraCapacity">,
) {
  try {
    const entries = await listSignIns({ onPremisesOnly: true, unseatedOnly: true, locationId: table.locationId ?? undefined });
    const capacity = table.capacity + table.maxExtraCapacity;
    const match = entries.find((e) => e.partySize <= capacity);
    if (!match) return;
    toast({
      title: `${table.name} is free`,
      description: `Next up: ${match.guestName} (party of ${match.partySize}), waiting ${elapsedLabel(match.signedInAt)}.`,
    });
  } catch {
    // Best-effort only - never block or surface an error for this.
  }
}
