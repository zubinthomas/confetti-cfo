// Auth calls against the Express server (server/routes/auth.ts).
import { get, post, setToken, clearToken } from "./http";

export interface Role {
  id: number;
  name: string;
  rank: number;
}

// Curated, read-only subset of the linked employees row - notes and
// internal_documents are deliberately excluded server-side (see
// server/db/employeeSelf.ts), not just hidden here.
export interface SelfEmployeeView {
  id: string;
  fullName: string | null;
  employeeId: string | null;
  division: string | null;
  role: string | null;
  employmentType: string | null;
  status: string | null;
  joiningDate: string | null;
  monthlySalary: number | null;
  phone: string | null;
  email: string | null;
  aadharNumber: string | null;
  panNumber: string | null;
  bloodGroup: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  address: string | null;
  policeVerificationStatus: string | null;
  idProofUrl: string | null;
  contractUrl: string | null;
  policeVerificationUrl: string | null;
  healthRecordUrl: string | null;
  aadharUrl: string | null;
  panUrl: string | null;
  offerLetterUrl: string | null;
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  roles: Role[];
  permissions: string[]; // "Resource:action", e.g. "Employee:write"
  divisionScope: string[]; // empty = unrestricted; see src/lib/hrDivisions.ts
  employee: SelfEmployeeView | null; // set only if this account is linked for self-service
}

export const auth = {
  login: async (email: string, password: string): Promise<void> => {
    const { access_token } = await post<{ access_token: string }>("/auth/login", { email, password });
    setToken(access_token);
  },

  me: () => get<User>("/auth/me"),

  logout: (redirectUrl?: string): void => {
    clearToken();
    window.location.href = redirectUrl || "/login";
  },

  redirectToLogin: (redirectUrl?: string): void => {
    window.location.href = redirectUrl ? `/login?from=${encodeURIComponent(redirectUrl)}` : "/login";
  },

  setToken,

  resetPasswordRequest: (email: string) => post("/auth/reset-password-request", { email }),

  resetPassword: ({ resetToken, newPassword }: { resetToken: string; newPassword: string }) =>
    post("/auth/reset-password", { resetToken, newPassword }),
};
