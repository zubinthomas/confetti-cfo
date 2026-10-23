// Shared by the day view and the All list on the Reservations tab.
import type { Reservation, ReservationStatus } from "@/api/reservationsApi";
import type { GuestSignIn } from "@/api/guestSignInsApi";

export const STATUS_LABELS: Record<ReservationStatus, string> = {
  pending: "Pending", confirmed: "Confirmed", seated: "Seated",
  completed: "Completed", cancelled: "Cancelled", no_show: "No-show",
};
export const STATUS_COLORS: Record<ReservationStatus, string> = {
  pending: "#f59e0b", confirmed: "#3b82f6", seated: "#8b5cf6",
  completed: "#10b981", cancelled: "#ef4444", no_show: "#6b7280",
};
export const ACTIVE_STATUSES: ReservationStatus[] = ["pending", "confirmed", "seated"];
export const NEXT_ACTIONS: Partial<Record<ReservationStatus, { label: string; status: ReservationStatus }[]>> = {
  pending: [{ label: "Confirm", status: "confirmed" }, { label: "Cancel", status: "cancelled" }],
  confirmed: [{ label: "Seat", status: "seated" }, { label: "No-show", status: "no_show" }, { label: "Cancel", status: "cancelled" }],
  seated: [{ label: "Complete", status: "completed" }],
};

export function endTime(time: string, durationMinutes: number) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + durationMinutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export type ListScope = "upcoming" | "past" | "all";

/** 'YYYY-MM-DD' shifted by whole days (calendar arithmetic, no timezone). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The date window and sort order for the All list. The scope sets a bound
 *  relative to today; the optional From / To inputs narrow it further, and an
 *  empty window (From after To) is left for the server to answer with no rows. */
export function scopeRange(scope: ListScope, today: string, from: string, to: string): { from?: string; to?: string; order: "asc" | "desc" } {
  const later = (a: string, b: string) => (a > b ? a : b);
  const earlier = (a: string, b: string) => (a < b ? a : b);
  if (scope === "upcoming") return { from: from ? later(from, today) : today, to: to || undefined, order: "asc" };
  if (scope === "past") {
    const yesterday = addDays(today, -1);
    return { from: from || undefined, to: to ? earlier(to, yesterday) : yesterday, order: "desc" };
  }
  return { from: from || undefined, to: to || undefined, order: "desc" };
}

/** "Thu, 22 Oct 2026" for a 'YYYY-MM-DD' date. */
export const prettyDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** "4" or "4 (+2)": seats, with the extra seats a table can stretch to. */
export const seatsLabel = (capacity: number, maxExtra: number) =>
  maxExtra > 0 ? `${capacity} (+${maxExtra})` : String(capacity);

/** Add the id to the list, or remove it if it is already there. */
export const toggleId = (ids: string[], id: string): string[] =>
  ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];

/** True when there is at least one area and every one of them is collapsed.
 *  Ids in `collapsed` that no longer exist are ignored. */
export const allCollapsed = (areaIds: string[], collapsed: string[]): boolean =>
  areaIds.length > 0 && areaIds.every((id) => collapsed.includes(id));

/** Collapse every listed area, keeping remembered ids for areas not in view
 *  (archived ones hidden right now). */
export const collapseAreas = (areaIds: string[], collapsed: string[]): string[] =>
  [...new Set([...collapsed, ...areaIds])];

/** Expand every listed area, keeping remembered ids for areas not in view. */
export const expandAreas = (areaIds: string[], collapsed: string[]): string[] =>
  collapsed.filter((id) => !areaIds.includes(id));

/** Live status of one table (or merged unit) on the selected day. */
export type FloorInfo = {
  state: "free" | "reserved" | "late" | "occupied";
  label: string;
  until: string | null;
  /** Start time of the next pending/confirmed booking, when state is "reserved". */
  nextTime?: string;
  /** A pending/confirmed booking whose window is running but who isn't seated:
   *  the table is "late" when free, and flagged here when someone else is on it. */
  lateBooking?: Reservation;
  seatedBooking?: Reservation;
  /** Named register entries: empty for someone without Guest Register access. */
  guests: GuestSignIn[];
  /** Walk-in parties we know are there but can't name. */
  hiddenWalkIns: number;
};

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** True when a pending/confirmed booking's window includes `nowMin` (minutes
 *  past midnight, IST): the party is due or overdue and not seated yet. */
export function isLateBooking(b: Pick<Reservation, "status" | "time" | "durationMinutes">, nowMin: number): boolean {
  if (b.status !== "pending" && b.status !== "confirmed") return false;
  const start = toMinutes(b.time);
  return start <= nowMin && nowMin < start + b.durationMinutes;
}

/** What the day view knows about one table or merged unit. */
export type FloorInput = {
  /** The unit's bookings for the selected day. */
  bookings: Reservation[];
  /** Named register entries still on premises at the unit (may be empty because
   *  the viewer can't read the register). */
  guests: GuestSignIn[];
  /** Anonymous live occupancy summed over the unit's tables, if any. */
  occupancy?: { parties: number; until: string };
  nowMin: number;
  isToday: boolean;
  /** 'HH:MM' for a register entry's expectedUntil instant. */
  clock: (iso: string) => string;
};

/** Live status of a unit. Only today has a live status: on any other date the
 *  bookings list is the whole story. Precedence: occupied, late, reserved, free.
 *  Occupied needs only that someone is there, so a viewer without register
 *  access still sees a walk-in party (as "Walk-in party"). */
export function floorInfoFor({ bookings, guests, occupancy, nowMin, isToday, clock }: FloorInput): FloorInfo {
  if (!isToday) return { state: "free", label: "Free", until: null, guests: [], hiddenWalkIns: 0 };

  const seatedBooking = bookings.find((b) => b.status === "seated");
  const lateBooking = bookings.find((b) => isLateBooking(b, nowMin));
  // A register entry linked to the seated booking is the same party.
  const walkIns = guests.filter((g) => !(seatedBooking && g.reservationId === seatedBooking.id));
  const knownParties = (seatedBooking ? 1 : 0) + walkIns.length;
  const hiddenWalkIns = Math.max(0, (occupancy?.parties ?? 0) - knownParties);

  if (seatedBooking || guests.length > 0 || hiddenWalkIns > 0 || occupancy) {
    const names = [
      ...(seatedBooking ? [seatedBooking.guestName] : []),
      ...walkIns.map((g) => g.guestName),
      ...(hiddenWalkIns === 1 ? ["Walk-in party"] : hiddenWalkIns > 1 ? [`${hiddenWalkIns} walk-in parties`] : []),
    ];
    const ends = [
      ...(seatedBooking ? [endTime(seatedBooking.time, seatedBooking.durationMinutes)] : []),
      ...guests.map((g) => (g.expectedUntil ? clock(g.expectedUntil) : "")),
      ...(occupancy ? [occupancy.until] : []),
    ].filter(Boolean).sort();
    return {
      state: "occupied",
      label: `Occupied${names.length ? ` · ${names.join(", ")}` : ""}`,
      until: ends.length ? ends[ends.length - 1] : null,
      lateBooking,
      seatedBooking,
      guests,
      hiddenWalkIns,
    };
  }
  if (lateBooking) {
    return {
      state: "late", label: `Late · ${lateBooking.guestName}, ${lateBooking.time} booking`, until: null,
      lateBooking, seatedBooking: undefined, guests: [], hiddenWalkIns: 0,
    };
  }
  const next = bookings.find((b) => (b.status === "pending" || b.status === "confirmed") && toMinutes(b.time) >= nowMin);
  if (next) {
    return { state: "reserved", label: `Next booking ${next.time}`, until: null, nextTime: next.time, seatedBooking: undefined, guests: [], hiddenWalkIns: 0 };
  }
  return { state: "free", label: "Free", until: null, seatedBooking: undefined, guests: [], hiddenWalkIns: 0 };
}

/** The short status line on a floor tile: "Free", "Next 19:00", "Late 19:00", "Occupied · until 20:30". */
export function tileStatus(floor: Pick<FloorInfo, "state" | "until" | "nextTime" | "lateBooking">): string {
  if (floor.state === "occupied") return floor.until ? `Occupied · until ${floor.until}` : "Occupied";
  if (floor.state === "late") return floor.lateBooking ? `Late · ${floor.lateBooking.time}` : "Late";
  if (floor.state === "reserved") return floor.nextTime ? `Next ${floor.nextTime}` : "Reserved";
  return "Free";
}

/** A second tile line when an occupied table has a party waiting for it. */
export function tileNote(floor: Pick<FloorInfo, "state" | "lateBooking">): string | null {
  return floor.state === "occupied" && floor.lateBooking ? `Waiting: ${floor.lateBooking.guestName}, ${floor.lateBooking.time}` : null;
}

/** "1 late · 2 occupied · 1 reserved · 9 free" for an area header; empty states are left out. */
export function floorSummary(floors: Pick<FloorInfo, "state">[]): string {
  const count = (state: FloorInfo["state"]) => floors.filter((f) => f.state === state).length;
  return (["late", "occupied", "reserved", "free"] as const)
    .map((state) => [count(state), state] as const)
    .filter(([n]) => n > 0)
    .map(([n, state]) => `${n} ${state}`)
    .join(" · ");
}

export const isIdList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

export type MergeKind = "free" | "linked" | "none";

/** How a table may merge with its neighbours, for the catalog tile. A free-merge
 *  table wins over a kept list of links (the list is only hidden while free merge is on). */
export function mergeSummary(table: { freeMerge: boolean; mergeableWith: string[] }): { kind: MergeKind; label: string } {
  if (table.freeMerge) return { kind: "free", label: "Merges: free" };
  const n = table.mergeableWith.length;
  if (n > 0) return { kind: "linked", label: `Merges: ${n} linked` };
  return { kind: "none", label: "No merging" };
}
