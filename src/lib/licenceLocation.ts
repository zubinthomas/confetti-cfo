// The licence location dropdown. A licence saved under an older or free-typed
// location that isn't in the list keeps that value as an extra option, so
// opening it in the form doesn't blank the select and overwrite it on save.
export const LICENCE_LOCATIONS = ["Kolkata", "Jodhpur Park", "Birbhum", "All Locations"] as const;

export function locationOptions(current: string | null | undefined): string[] {
  const value = (current ?? "").trim();
  return value && !(LICENCE_LOCATIONS as readonly string[]).includes(value) ? [...LICENCE_LOCATIONS, value] : [...LICENCE_LOCATIONS];
}
