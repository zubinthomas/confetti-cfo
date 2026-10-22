// Shared by the day view and the All list on the Reservations tab.
import type { ReservationStatus } from "@/api/reservationsApi";

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
