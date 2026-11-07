// Employee-facing document generation - salary slips and ID cards. Used from
// both HeadcountTab.tsx (admin, for any employee) and MyProfile.tsx (an
// employee, for themselves only). Each function fetches the relevant saved
// template (admin-authored via the Document Template Designer, or the
// seeded default) and hands it to renderDocument() along with this
// document's data - see src/lib/documentTemplates.ts for the interpreter,
// and server/db/documentTemplates.ts for where templates are stored.
import { fetchTemplateForRender } from "@/api/documentTemplatesApi";
import { renderDocument, type RenderData } from "./documentTemplates";

// Both call sites work with differently-shaped source data (HeadcountTab's
// generic entity rows are loosely-typed snake_case `any`; MyProfile's
// SelfEmployeeView is properly typed camelCase) - this is the one shape
// both map into before calling either generator below.
export interface EmployeeDocInfo {
  fullName: string | null;
  employeeId: string | null;
  division: string | null;
  role: string | null;
  photoUrl: string | null;
}

// Optional itemized breakdown fields, all nullable - a record with none of
// them set (every prior payroll record, plus any future gross-only one)
// still renders exactly as before this feature existed. Mirrors
// payrollRecords' columns (server/db/schema.ts) minus id/employeeId/
// division/month, which the call sites already pass separately.
export interface PayrollSlipRecord {
  month: string;
  grossSalary: number | null;
  basicPay?: number | null;
  hra?: number | null;
  otherAllowances?: number | null;
  bonus?: number | null;
  pfDeduction?: number | null;
  taxDeduction?: number | null;
  otherDeductions?: number | null;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function safeFilenamePart(s: string | null): string {
  return (s || "employee").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
}

export async function generateSalarySlip(employee: EmployeeDocInfo, record: PayrollSlipRecord, templateId?: string) {
  const template = await fetchTemplateForRender("salary_slip", templateId);
  const data: RenderData = {
    fullName: employee.fullName,
    employeeId: employee.employeeId,
    division: employee.division,
    role: employee.role,
    monthLabel: monthLabel(record.month),
    generatedDate: new Date().toLocaleDateString("en-IN"),
    grossSalary: record.grossSalary,
    basicPay: record.basicPay ?? null,
    hra: record.hra ?? null,
    otherAllowances: record.otherAllowances ?? null,
    bonus: record.bonus ?? null,
    pfDeduction: record.pfDeduction ?? null,
    taxDeduction: record.taxDeduction ?? null,
    otherDeductions: record.otherDeductions ?? null,
  };
  const doc = await renderDocument(template, data);
  doc.save(`salary-slip-${safeFilenamePart(employee.fullName)}-${record.month}.pdf`);
}

export async function generateIdCard(employee: EmployeeDocInfo, templateId?: string) {
  const template = await fetchTemplateForRender("id_card", templateId);
  const data: RenderData = {
    photo: employee.photoUrl,
    fullName: employee.fullName,
    employeeId: employee.employeeId,
    role: employee.role,
    division: employee.division,
    roleDivision: [employee.role, employee.division].filter(Boolean).join(" - ") || null,
  };
  const doc = await renderDocument(template, data);
  doc.save(`id-card-${safeFilenamePart(employee.fullName)}.pdf`);
}
