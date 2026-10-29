import { describe, expect, it } from "vitest";
import type { Reservation } from "@/api/reservationsApi";
import type { GuestSignIn } from "@/api/guestSignInsApi";
import { addDays, allCollapsed, bookingRows, collapseAreas, endTime, expandAreas, floorInfoFor, floorSummary, isIdList, isLateBooking, mergeSummary, scopeRange, seatsLabel, tileNote, tileStatus, toggleId } from "./reservationUi";

const TODAY = "2026-10-22";

const booking = (over: Partial<Reservation> = {}): Reservation => ({
  id: "b1", createdDate: "", tableId: "t1", tableName: "A4", tableCapacity: 4, areaId: "a1", areaName: "Cafe", floor: null,
  locationName: "Sienna", date: "2026-10-22", time: "19:00", durationMinutes: 90, partySize: 2, guestName: "Guest",
  guestPhone: null, guestEmail: null, status: "confirmed", notes: null, seatedAt: null, departedAt: null, tableMaxExtraCapacity: 0,
  ...over,
});

const signIn = (over: Partial<GuestSignIn> = {}): GuestSignIn => ({
  id: "g1", guestName: "Guest", tableId: "t1", reservationId: null, expectedUntil: null, signedOutAt: null,
  ...over,
} as GuestSignIn);

describe("addDays", () => {
  it("steps across month and year ends", () => {
    expect(addDays("2026-10-22", -1)).toBe("2026-10-21");
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("scopeRange", () => {
  it("upcoming runs from today, soonest first", () => {
    expect(scopeRange("upcoming", TODAY, "", "")).toEqual({ from: TODAY, to: undefined, order: "asc" });
  });
  it("upcoming never starts before today, whatever From says", () => {
    expect(scopeRange("upcoming", TODAY, "2026-10-01", "")).toMatchObject({ from: TODAY });
    expect(scopeRange("upcoming", TODAY, "2026-10-30", "2026-11-02")).toEqual({ from: "2026-10-30", to: "2026-11-02", order: "asc" });
  });
  it("past ends yesterday, newest first", () => {
    expect(scopeRange("past", TODAY, "", "")).toEqual({ from: undefined, to: "2026-10-21", order: "desc" });
  });
  it("past never reaches today, whatever To says", () => {
    expect(scopeRange("past", TODAY, "", "2026-12-31")).toMatchObject({ to: "2026-10-21" });
    expect(scopeRange("past", TODAY, "2026-09-01", "2026-09-30")).toEqual({ from: "2026-09-01", to: "2026-09-30", order: "desc" });
  });
  it("all uses the typed dates as they are, newest first", () => {
    expect(scopeRange("all", TODAY, "", "")).toEqual({ from: undefined, to: undefined, order: "desc" });
    expect(scopeRange("all", TODAY, "2026-01-01", "2026-12-31")).toEqual({ from: "2026-01-01", to: "2026-12-31", order: "desc" });
  });
});

describe("endTime", () => {
  it("adds minutes to a clock time", () => {
    expect(endTime("19:00", 90)).toBe("20:30");
    expect(endTime("09:15", 45)).toBe("10:00");
  });
});

describe("seatsLabel", () => {
  it("adds the stretch seats only when there are some", () => {
    expect(seatsLabel(4, 0)).toBe("4");
    expect(seatsLabel(4, 2)).toBe("4 (+2)");
  });
});

describe("area collapse helpers", () => {
  it("toggleId adds then removes", () => {
    expect(toggleId([], "a")).toEqual(["a"]);
    expect(toggleId(["a", "b"], "a")).toEqual(["b"]);
  });
  it("allCollapsed needs every listed area, ignores stale ids, and is false with no areas", () => {
    expect(allCollapsed(["a", "b"], ["a", "b", "gone"])).toBe(true);
    expect(allCollapsed(["a", "b"], ["a"])).toBe(false);
    expect(allCollapsed([], ["a"])).toBe(false);
  });
  it("collapse and expand all leave areas that are out of view alone", () => {
    expect(collapseAreas(["a", "b"], ["x", "a"]).sort()).toEqual(["a", "b", "x"]);
    expect(expandAreas(["a", "b"], ["x", "a", "b"])).toEqual(["x"]);
  });
});

describe("tileStatus", () => {
  it("reads the state at a glance", () => {
    expect(tileStatus({ state: "free", until: null })).toBe("Free");
    expect(tileStatus({ state: "reserved", until: null, nextTime: "19:00" })).toBe("Next 19:00");
    expect(tileStatus({ state: "occupied", until: "20:30" })).toBe("Occupied · until 20:30");
    expect(tileStatus({ state: "occupied", until: null })).toBe("Occupied");
    expect(tileStatus({ state: "late", until: null, lateBooking: booking({ time: "19:00" }) })).toBe("Late · 19:00");
  });
});

describe("tileNote", () => {
  it("only speaks when a late party is waiting on an occupied table", () => {
    const lateBooking = booking({ guestName: "Anita", time: "19:00" });
    expect(tileNote({ state: "occupied", lateBooking })).toBe("Waiting: Anita, 19:00");
    expect(tileNote({ state: "occupied" })).toBeNull();
    expect(tileNote({ state: "late", lateBooking })).toBeNull();
  });
});

describe("floorSummary", () => {
  it("counts each state and drops the empty ones", () => {
    const f = (state: "free" | "reserved" | "late" | "occupied") => ({ state });
    expect(floorSummary([f("occupied"), f("occupied"), f("reserved"), f("free"), f("free"), f("free")])).toBe("2 occupied · 1 reserved · 3 free");
    expect(floorSummary([f("late"), f("occupied"), f("free")])).toBe("1 late · 1 occupied · 1 free");
    expect(floorSummary([f("free"), f("free")])).toBe("2 free");
    expect(floorSummary([])).toBe("");
  });
});

describe("isLateBooking", () => {
  it("is true from the start minute until the window ends, for unseated bookings only", () => {
    const b = booking({ time: "19:00", durationMinutes: 90 });
    expect(isLateBooking(b, 18 * 60 + 59)).toBe(false);
    expect(isLateBooking(b, 19 * 60)).toBe(true);
    expect(isLateBooking(b, 20 * 60 + 29)).toBe(true);
    expect(isLateBooking(b, 20 * 60 + 30)).toBe(false);
    expect(isLateBooking({ ...b, status: "pending" }, 19 * 60 + 10)).toBe(true);
    for (const status of ["seated", "completed", "cancelled", "no_show"] as const) {
      expect(isLateBooking({ ...b, status }, 19 * 60 + 10)).toBe(false);
    }
  });
});

describe("floorInfoFor", () => {
  const base = { bookings: [] as Reservation[], guests: [] as GuestSignIn[], nowMin: 19 * 60 + 10, isToday: true, clock: (iso: string) => iso.slice(11, 16) };

  it("is free with nothing on the table", () => {
    expect(floorInfoFor(base).state).toBe("free");
  });

  it("is reserved for a booking later today, with its start time", () => {
    const info = floorInfoFor({ ...base, bookings: [booking({ time: "21:00" })] });
    expect(info).toMatchObject({ state: "reserved", nextTime: "21:00" });
  });

  it("is late, not free, once a pending or confirmed booking's window has started", () => {
    const info = floorInfoFor({ ...base, bookings: [booking({ time: "19:00", guestName: "Anita" })] });
    expect(info.state).toBe("late");
    expect(info.label).toBe("Late · Anita, 19:00 booking");
    expect(info.lateBooking?.guestName).toBe("Anita");
  });

  it("goes back to free when the late window has passed", () => {
    const info = floorInfoFor({ ...base, nowMin: 20 * 60 + 30, bookings: [booking({ time: "19:00", durationMinutes: 90 })] });
    expect(info.state).toBe("free");
  });

  it("is occupied by a seated booking, until its end", () => {
    const info = floorInfoFor({ ...base, bookings: [booking({ status: "seated", time: "18:30", durationMinutes: 90, guestName: "Raj" })] });
    expect(info).toMatchObject({ state: "occupied", until: "20:00", label: "Occupied · Raj" });
  });

  it("stays occupied, and flags the late party, when someone else is on the table", () => {
    const info = floorInfoFor({
      ...base,
      bookings: [booking({ time: "19:00", guestName: "Anita" })],
      guests: [signIn({ guestName: "Sam", expectedUntil: "2026-10-22T20:15:00Z" })],
      occupancy: { parties: 1, until: "20:15" },
    });
    expect(info.state).toBe("occupied");
    expect(info.lateBooking?.guestName).toBe("Anita");
    expect(info.label).toBe("Occupied · Sam");
    expect(tileNote(info)).toBe("Waiting: Anita, 19:00");
  });

  it("shows an unnamed walk-in when the viewer can't read the register", () => {
    const info = floorInfoFor({ ...base, occupancy: { parties: 1, until: "20:15" } });
    expect(info).toMatchObject({ state: "occupied", until: "20:15", label: "Occupied · Walk-in party", hiddenWalkIns: 1 });
    expect(info.guests).toEqual([]);
  });

  it("counts hidden walk-ins next to a visible seated booking", () => {
    const seated = booking({ status: "seated", time: "18:30", guestName: "Raj" });
    const info = floorInfoFor({ ...base, bookings: [seated], occupancy: { parties: 3, until: "21:00" } });
    expect(info.hiddenWalkIns).toBe(2);
    expect(info.label).toBe("Occupied · Raj, 2 walk-in parties");
    expect(info.until).toBe("21:00");
  });

  it("does not double count a register entry linked to the seated booking", () => {
    const seated = booking({ id: "r1", status: "seated", time: "18:30", guestName: "Raj" });
    const linked = signIn({ guestName: "Raj", reservationId: "r1" });
    const info = floorInfoFor({ ...base, bookings: [seated], guests: [linked], occupancy: { parties: 1, until: "20:00" } });
    expect(info.hiddenWalkIns).toBe(0);
    expect(info.label).toBe("Occupied · Raj");
  });

  it("has no live status on another date", () => {
    const info = floorInfoFor({
      ...base, isToday: false,
      bookings: [booking({ time: "19:00" }), booking({ status: "seated", time: "12:00" })],
      occupancy: { parties: 1, until: "20:15" },
    });
    expect(info.state).toBe("free");
  });
});

describe("bookingRows", () => {
  const unit = (name: string, bookings: Reservation[], merge?: { tableNames: string[] }) => ({ table: { name }, merge, bookings });

  it("lists bookings across tables, earliest first, and skips tables with none", () => {
    const rows = bookingRows([
      unit("A1", [booking({ id: "a", time: "20:00" })]),
      unit("A2", []),
      unit("A3", [booking({ id: "b", time: "18:30" }), booking({ id: "c", time: "21:00", status: "cancelled" })]),
    ]);
    expect(rows.map((r) => r.booking.id)).toEqual(["b", "a", "c"]);
    expect(rows[0].unit.table.name).toBe("A3");
  });

  it("breaks ties on table name in natural order", () => {
    const rows = bookingRows([
      unit("F10", [booking({ id: "x", time: "19:00" })]),
      unit("F2", [booking({ id: "y", time: "19:00" })]),
    ]);
    expect(rows.map((r) => r.booking.id)).toEqual(["y", "x"]);
  });

  it("is empty when nothing is booked", () => {
    expect(bookingRows([unit("A1", []), unit("A2", [])])).toEqual([]);
    expect(bookingRows([])).toEqual([]);
  });
});

describe("isIdList", () => {
  it("accepts only arrays of strings", () => {
    expect(isIdList(["a"])).toBe(true);
    expect(isIdList([])).toBe(true);
    expect(isIdList([1])).toBe(false);
    expect(isIdList("a")).toBe(false);
  });
});

describe("mergeSummary", () => {
  it("free merge wins over a kept list of links", () => {
    expect(mergeSummary({ freeMerge: true, mergeableWith: ["a"] })).toEqual({ kind: "free", label: "Merges: free" });
  });
  it("counts linked tables, and says none when there are no links", () => {
    expect(mergeSummary({ freeMerge: false, mergeableWith: ["a", "b"] })).toEqual({ kind: "linked", label: "Merges: 2 linked" });
    expect(mergeSummary({ freeMerge: false, mergeableWith: [] })).toEqual({ kind: "none", label: "No merging" });
  });
});
