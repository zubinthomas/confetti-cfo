import { describe, expect, it } from "vitest";
import { addDays, endTime, scopeRange } from "./reservationUi";

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
