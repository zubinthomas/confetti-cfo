// Client-side PDF generation for employee-facing documents - salary slips
// and ID cards. Used from both HeadcountTab.tsx (admin, for any employee)
// and MyProfile.tsx (an employee, for themselves only). No server
// involvement: jsPDF builds the file directly in the browser and triggers
// a download.
import { jsPDF } from "jspdf";

const COMPANY_NAME = "Confetti Exports";

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

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function safeFilenamePart(s: string | null): string {
  return (s || "employee").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
}

// jsPDF.addImage needs actual image data, not a remote URL - fetches and
// converts, and reports the format addImage needs from the blob's MIME type.
async function urlToImageData(url: string): Promise<{ dataUrl: string; format: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not load photo");
  const blob = await res.blob();
  const format = blob.type.split("/")[1]?.toUpperCase() || "JPEG";
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read photo"));
    reader.readAsDataURL(blob);
  });
  return { dataUrl, format };
}

export async function generateSalarySlip(employee: EmployeeDocInfo, record: { month: string; grossSalary: number | null }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 20;
  let y = 25;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(COMPANY_NAME, marginX, y);
  y += 8;

  doc.setFontSize(13);
  doc.setTextColor(90, 90, 90);
  doc.text(`Salary Slip - ${monthLabel(record.month)}`, marginX, y);
  doc.setTextColor(0, 0, 0);
  y += 4;
  doc.setDrawColor(200, 200, 200);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 12;

  const rows: [string, string][] = [
    ["Employee Name", employee.fullName || "-"],
    ["Employee ID", employee.employeeId || "-"],
    ["Division", employee.division || "-"],
    ["Role", employee.role || "-"],
  ];
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  for (const [label, value] of rows) {
    doc.setTextColor(110, 110, 110);
    doc.text(label, marginX, y);
    doc.setTextColor(0, 0, 0);
    doc.text(value, marginX + 55, y);
    y += 8;
  }

  y += 6;
  doc.setDrawColor(220, 220, 220);
  doc.setFillColor(248, 248, 248);
  doc.roundedRect(marginX, y, pageWidth - marginX * 2, 20, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Gross Salary", marginX + 6, y + 13);
  doc.setFontSize(14);
  const amount = record.grossSalary != null ? `Rs. ${record.grossSalary.toLocaleString("en-IN")}` : "-";
  doc.text(amount, pageWidth - marginX - 6, y + 13, { align: "right" });
  y += 30;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(150, 150, 150);
  doc.text(`Generated on ${new Date().toLocaleDateString("en-IN")}`, marginX, y);

  doc.save(`salary-slip-${safeFilenamePart(employee.fullName)}-${record.month}.pdf`);
}

export async function generateIdCard(employee: EmployeeDocInfo) {
  // CR80 card size (standard ID card), landscape.
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [85.6, 54] });
  const w = 85.6;
  const h = 54;

  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, w, 14, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(COMPANY_NAME, w / 2, 9, { align: "center" });

  const photoSize = 22;
  const photoX = 6;
  const photoY = 20;
  doc.setDrawColor(210, 210, 210);
  doc.setFillColor(240, 240, 240);
  doc.rect(photoX, photoY, photoSize, photoSize, "FD");

  if (employee.photoUrl) {
    try {
      const { dataUrl, format } = await urlToImageData(employee.photoUrl);
      doc.addImage(dataUrl, format, photoX, photoY, photoSize, photoSize);
    } catch {
      // No photo on the card if it couldn't be loaded - not fatal, the
      // rest of the card is still useful.
    }
  }

  const textX = photoX + photoSize + 6;
  let textY = 25;
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(employee.fullName || "-", textX, textY);
  textY += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(90, 90, 90);
  doc.text(`ID: ${employee.employeeId || "-"}`, textX, textY);
  textY += 5;
  doc.text([employee.role, employee.division].filter(Boolean).join(" - ") || "-", textX, textY);

  doc.setDrawColor(220, 220, 220);
  doc.line(6, h - 6, w - 6, h - 6);
  doc.setFontSize(6.5);
  doc.setTextColor(150, 150, 150);
  doc.text("Employee ID Card", w / 2, h - 3, { align: "center" });

  doc.save(`id-card-${safeFilenamePart(employee.fullName)}.pdf`);
}
