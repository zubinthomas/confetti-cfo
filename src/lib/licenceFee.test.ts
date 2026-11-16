import { describe, it, expect } from "vitest";
import { feeInterval, amountFieldLabel, feeLabel, FEE_INTERVALS } from "./licenceFee";

describe("feeInterval", () => {
  it("finds a stored value", () => expect(feeInterval("quarterly").per).toBe("quarter"));
  it("falls back to annual for unknown or missing values", () => {
    expect(feeInterval(undefined).value).toBe("annual");
    expect(feeInterval(null).value).toBe("annual");
    expect(feeInterval("weekly").value).toBe("annual");
  });
  it("offers the four intervals with annual last", () => {
    expect(FEE_INTERVALS.map((i) => i.value)).toEqual(["monthly", "quarterly", "half_yearly", "annual"]);
  });
});

describe("amountFieldLabel", () => {
  it("keeps the old wording for annual", () => expect(amountFieldLabel("annual")).toBe("Annual fee (₹)"));
  it("names the interval otherwise", () => {
    expect(amountFieldLabel("quarterly")).toBe("Amount per quarter (₹)");
    expect(amountFieldLabel("half_yearly")).toBe("Amount per half-year (₹)");
    expect(amountFieldLabel("monthly")).toBe("Amount per month (₹)");
  });
});

describe("feeLabel", () => {
  it("formats with Indian grouping and the interval", () => {
    expect(feeLabel(5000, "quarterly")).toBe("₹5,000 / quarter");
    expect(feeLabel(125000, "annual")).toBe("₹1,25,000 / year");
  });
  it("treats a missing interval as annual and accepts numeric strings", () => {
    expect(feeLabel("1200", null)).toBe("₹1,200 / year");
  });
  it("shows nothing without a positive amount", () => {
    expect(feeLabel(0, "annual")).toBeNull();
    expect(feeLabel(null, "annual")).toBeNull();
    expect(feeLabel("", "annual")).toBeNull();
    expect(feeLabel(-5, "annual")).toBeNull();
  });
});
