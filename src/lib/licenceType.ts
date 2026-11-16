// The licence type dropdown has an "Other" entry. Picking it shows a text box,
// and what the user types is stored as the licence_type itself (the column is
// free text), so lists and exports show the real name instead of "Other".
export const OTHER_TYPE = "Other";

/** Dropdown value and free text for a stored type. A stored type that isn't one
 *  of the listed options (typed earlier under Other, or imported) reopens as
 *  Other with its text filled in. */
export function splitType(stored: string | null | undefined, known: readonly string[]): { type: string; other: string } {
  const value = (stored ?? "").trim();
  if (!value || (known.includes(value) && value !== OTHER_TYPE)) return { type: value, other: "" };
  return { type: OTHER_TYPE, other: value === OTHER_TYPE ? "" : value };
}

/** The type to store. Null when Other is picked with nothing typed. */
export function joinType(type: string, other: string): string | null {
  if (type !== OTHER_TYPE) return type;
  return other.trim() || null;
}
