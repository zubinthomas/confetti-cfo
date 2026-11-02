// Compliance Payment Tracker tables (server/routes/compliance.ts). Read-only -
// re-upload the source workbook via /data/import is the only update path.
import { get } from "./http";

export interface CompliancePayment {
  id: string;
  createdDate: string;
  category: "licence_tax" | "insurance";
  location: string;
  itemName: string;
  detail: string | null;
  policyNumber: string | null;
  dueDateRaw: string | null;
  dueDate: string | null;
  amount: number | null;
  paymentStatus: string | null;
  paidOn: string | null;
  scheduledFollowUpRaw: string | null;
  scheduledFollowUp: string | null;
  remarks: string | null;
  sourceSheet: string;
  sourceRow: number;
  matchKey: string;
}

export interface ComplianceDocument {
  id: string;
  createdDate: string;
  documentName: string;
  documentType: string | null;
  documentNumber: string | null;
  issueDateRaw: string | null;
  issueDate: string | null;
  filingDateRaw: string | null;
  filingDate: string | null;
  expiryDateRaw: string | null;
  expiryDate: string | null;
  status: string | null;
  remarks: string | null;
  matchKey: string;
}

export interface ComplianceTrademark {
  id: string;
  createdDate: string;
  applicationNo: string;
  niceClass: number | null;
  dateOfApplicationRaw: string | null;
  dateOfApplication: string | null;
  markName: string | null;
  tmType: string | null;
  status: string | null;
  remarks: string | null;
}

export interface ComplianceDirector {
  id: string;
  createdDate: string;
  din: string;
  name: string | null;
  designation: string | null;
  dateOfAppointmentRaw: string | null;
  dateOfAppointment: string | null;
  aadhaarNumber: string | null;
  panNumber: string | null;
  email: string | null;
  contactNumber: string | null;
}

export const getCompliancePayments = (category?: "licence_tax" | "insurance") =>
  get<CompliancePayment[]>(category ? `/compliance/payments?category=${category}` : "/compliance/payments");

export const getComplianceDocuments = () => get<ComplianceDocument[]>("/compliance/documents");

export const getComplianceTrademarks = () => get<ComplianceTrademark[]>("/compliance/trademarks");

export const getComplianceDirectors = () => get<ComplianceDirector[]>("/compliance/directors");
