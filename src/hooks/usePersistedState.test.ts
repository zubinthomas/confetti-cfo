import { describe, expect, it } from "vitest";
import { readPersisted, writePersisted } from "./usePersistedState";

const isIds = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const store = (items: Record<string, string> = {}) => ({
  getItem: (k: string) => items[k] ?? null,
  setItem: (k: string, v: string) => { items[k] = v; },
});
const broken = {
  getItem: () => { throw new Error("blocked"); },
  setItem: () => { throw new Error("blocked"); },
};

describe("readPersisted", () => {
  it("returns the stored value when it is valid", () => {
    expect(readPersisted("k", [], isIds, store({ k: '["a","b"]' }))).toEqual(["a", "b"]);
  });
  it("falls back when nothing is stored, the JSON is bad, or the shape is wrong", () => {
    expect(readPersisted("k", ["x"], isIds, store())).toEqual(["x"]);
    expect(readPersisted("k", ["x"], isIds, store({ k: "{oops" }))).toEqual(["x"]);
    expect(readPersisted("k", ["x"], isIds, store({ k: "[1,2]" }))).toEqual(["x"]);
  });
  it("falls back when storage throws", () => {
    expect(readPersisted("k", ["x"], isIds, broken)).toEqual(["x"]);
  });
});

describe("writePersisted", () => {
  it("stores JSON, and swallows a storage that throws", () => {
    const items: Record<string, string> = {};
    writePersisted("k", ["a"], store(items));
    expect(items.k).toBe('["a"]');
    expect(() => writePersisted("k", ["a"], broken)).not.toThrow();
  });
});
