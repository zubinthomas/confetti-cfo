import { useCallback, useRef, useState } from "react";

// Debounces writes to localStorage so a draft isn't written on every
// keystroke - this hook is the only consumer right now, so it stays private
// rather than becoming a shared src/lib/debounce.ts.
function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), ms);
  };
}

// Offline draft-saving for in-progress form input. `key` should be unique
// per form, and per entity for a form that's reused across several entities
// (e.g. "offboard:<employeeId>") so a stale draft from one entity never
// surfaces while filling out the form for a different one.
export function useDraftPersistence<T>(key: string) {
  const storageKey = `draft:${key}`;

  const [draft] = useState<T | null>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  });

  const saveRef = useRef<((value: T) => void) | null>(null);
  if (!saveRef.current) {
    saveRef.current = debounce((value: T) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(value));
      } catch {
        // Storage full or unavailable (private browsing) - the draft is
        // best-effort, not a hard requirement, so just drop it silently.
      }
    }, 500);
  }

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [storageKey]);

  return { draft, save: saveRef.current, clear };
}
