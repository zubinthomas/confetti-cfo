import { describe, it, expect } from "vitest";
import { localDigits, formatLocal, waLink, venueMessage, rupees, waPhone, tableReadyMessage } from "./checkin";

describe("localDigits", () => {
  it("accepts spaced and prefixed numbers", () => {
    expect(localDigits("98765 43210")).toBe("9876543210");
    expect(localDigits("+91 98765-43210")).toBe("9876543210");
    expect(localDigits("09876543210")).toBe("9876543210");
  });
  it("rejects short, long and non-mobile numbers", () => {
    expect(localDigits("98765")).toBeNull();
    expect(localDigits("12345 67890")).toBeNull();
    expect(localDigits("")).toBeNull();
  });
});

describe("formatLocal", () => {
  it("groups as 5+5 and caps at ten digits", () => {
    expect(formatLocal("98765")).toBe("98765");
    expect(formatLocal("9876543210999")).toBe("98765 43210");
  });
});

describe("waLink", () => {
  it("strips punctuation and encodes the text", () => {
    expect(waLink("+91 98765 43210", "Hi there & you")).toBe("https://wa.me/919876543210?text=Hi%20there%20%26%20you");
  });
  it("builds the venue message", () => {
    expect(venueMessage("Cafe", 4, "9876543210")).toContain("table at the Cafe for 4");
  });
});

describe("rupees", () => {
  it("uses Indian grouping", () => expect(rupees(100000)).toBe("₹1,00,000"));
});

describe("waPhone", () => {
  it("prefixes bare Indian numbers and keeps full ones", () => {
    expect(waPhone("98765 43210")).toBe("919876543210");
    expect(waPhone("+91 98765 43210")).toBe("919876543210");
    expect(waPhone("+44 7700 900123")).toBe("447700900123");
  });
  it("rejects what can't be a number", () => {
    expect(waPhone("12345")).toBeNull();
    expect(waPhone(null)).toBeNull();
  });
});

describe("tableReadyMessage", () => {
  it("names the area when there is one", () => {
    expect(tableReadyMessage("Asha", 4, "Cafe")).toBe("Hi Asha, your table for 4 at the Cafe is ready. Please come to the host stand.");
    expect(tableReadyMessage("Asha", 4, null)).toBe("Hi Asha, your table for 4 is ready. Please come to the host stand.");
  });
});
