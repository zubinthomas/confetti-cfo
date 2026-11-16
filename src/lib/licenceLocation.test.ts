import { describe, it, expect } from "vitest";
import { LICENCE_LOCATIONS, locationOptions } from "./licenceLocation";

describe("locationOptions", () => {
  it("offers the four locations", () => {
    expect(locationOptions("Kolkata")).toEqual(["Kolkata", "Jodhpur Park", "Birbhum", "All Locations"]);
    expect([...LICENCE_LOCATIONS]).toEqual(["Kolkata", "Jodhpur Park", "Birbhum", "All Locations"]);
  });
  it("adds an unknown stored value last", () => {
    expect(locationOptions("Elsewhere")).toEqual(["Kolkata", "Jodhpur Park", "Birbhum", "All Locations", "Elsewhere"]);
  });
  it("ignores empty values", () => {
    expect(locationOptions("")).toHaveLength(4);
    expect(locationOptions(null)).toHaveLength(4);
    expect(locationOptions("  ")).toHaveLength(4);
  });
});
