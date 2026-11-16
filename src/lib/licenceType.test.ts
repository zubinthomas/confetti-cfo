import { describe, it, expect } from "vitest";
import { splitType, joinType, OTHER_TYPE } from "./licenceType";

const KNOWN = ["Trade Licence", "FSSAI", OTHER_TYPE];

describe("splitType", () => {
  it("keeps a listed type as is", () => {
    expect(splitType("FSSAI", KNOWN)).toEqual({ type: "FSSAI", other: "" });
  });
  it("reopens an unlisted type as Other with its text", () => {
    expect(splitType("Music Licence (PPL)", KNOWN)).toEqual({ type: OTHER_TYPE, other: "Music Licence (PPL)" });
  });
  it("treats a bare Other as Other with no text", () => {
    expect(splitType("Other", KNOWN)).toEqual({ type: OTHER_TYPE, other: "" });
  });
  it("handles empty values", () => {
    expect(splitType(null, KNOWN)).toEqual({ type: "", other: "" });
    expect(splitType("  ", KNOWN)).toEqual({ type: "", other: "" });
  });
});

describe("joinType", () => {
  it("passes a listed type through and ignores stray other text", () => {
    expect(joinType("FSSAI", "left over")).toBe("FSSAI");
  });
  it("stores the typed text for Other, trimmed", () => {
    expect(joinType(OTHER_TYPE, "  Music Licence ")).toBe("Music Licence");
  });
  it("is null when Other has no text", () => {
    expect(joinType(OTHER_TYPE, "   ")).toBeNull();
  });
});
