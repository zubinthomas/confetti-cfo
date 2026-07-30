// The HR module's department categories - shared across HeadcountTab,
// RecruitmentTab, DocumentsTab, ComplianceTab, InventoryTab, and the
// department-scope picker in UsersTab's edit modal. Sourced from the real
// department structure in data-sources/HR Mastersheet for IT.xlsx (see
// memory), which is far finer-grained than the coarse 4-division model
// this replaced - several of these (Accounts, Legal, Marketing, Quality
// Control, Partner) don't belong to any prior "division" grouping, so
// this stays a flat list rather than inventing an ungrounded hierarchy.
export const DIVISIONS = [
  "Accounts", "Admin", "Batik Unit", "Culinary", "Driver", "F&B Services",
  "Jewellery", "Legal", "Marketing", "Partner", "Pottery",
  "Quality Control", "Retail", "Tailor", "Utility",
] as const;
