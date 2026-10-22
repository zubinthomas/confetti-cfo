import { describe, expect, it } from "vitest";
import { addDays, allCollapsed, collapseAreas, endTime, expandAreas, floorSummary, isIdList, scopeRange, seatsLabel, tileStatus, toggleId } from "./reservationUi";

const TODAY = "2026-10-22";

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
  });
});

describe("floorSummary", () => {
  it("counts each state and drops the empty ones", () => {
    const f = (state: "free" | "reserved" | "occupied") => ({ state });
    expect(floorSummary([f("occupied"), f("occupied"), f("reserved"), f("free"), f("free"), f("free")])).toBe("2 occupied · 1 reserved · 3 free");
    expect(floorSummary([f("free"), f("free")])).toBe("2 free");
    expect(floorSummary([])).toBe("");
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
