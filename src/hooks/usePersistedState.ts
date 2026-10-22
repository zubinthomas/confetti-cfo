import { useCallback, useState } from "react";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** The stored value for `key`, or `initial` when storage is missing, throws, or
 *  holds something that isn't valid JSON or fails `isValid`. */
export function readPersisted<T>(key: string, initial: T, isValid: (value: unknown) => value is T, storage?: StorageLike): T {
  try {
    const raw = (storage ?? localStorage).getItem(key);
    if (raw === null) return initial;
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : initial;
  } catch {
    return initial;
  }
}

/** Write quietly: a failed write only means the value isn't remembered. */
export function writePersisted(key: string, value: unknown, storage?: StorageLike): void {
  try { (storage ?? localStorage).setItem(key, JSON.stringify(value)); } catch { /* keep it in memory only */ }
}

/** useState that remembers its value in localStorage. Storage can be missing or
 *  throw (private windows, blocked site data), and a stored value can be stale
 *  or hand-edited, so every access is guarded: anything that doesn't pass
 *  `isValid` falls back to `initial`, and a failed write just keeps the value
 *  for this visit. */
export function usePersistedState<T>(
  key: string,
  initial: T,
  isValid: (value: unknown) => value is T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readPersisted(key, initial, isValid));

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      writePersisted(key, resolved);
      return resolved;
    });
  }, [key]);

  return [value, set];
}
