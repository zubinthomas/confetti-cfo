// Duplicated from src/lib/hrDivisions.ts, not imported - server/ has no
// existing precedent or tsconfig path back into src/ (confirmed before
// writing parseHr.ts, which this was factored out of). Keep in sync by hand
// if the department list changes. Shared by any parser that needs to
// validate/normalize a Department-style column (parseHr.ts, parseRoster.ts).
export const DEPARTMENTS = [
  'Accounts', 'Admin', 'Batik Unit', 'Culinary', 'Driver', 'F&B Services',
  'Jewellery', 'Legal', 'Marketing', 'Partner', 'Pottery',
  'Quality Control', 'Retail', 'Tailor', 'Utility',
];
export const DEPARTMENTS_BY_LOWER = new Map(DEPARTMENTS.map((d) => [d.toLowerCase(), d]));
