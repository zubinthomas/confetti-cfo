// Shared name normalization for matching a parsed spreadsheet row against an
// existing `employees` row by full name. Factored out of mergeEmployees.ts
// (which uses it for aadhaar-less HR rows) so mergeShiftRoster.ts can reuse
// the same normalization instead of re-implementing it.
export const normalizeName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
