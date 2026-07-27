// Auth calls against the Express server (server/routes/auth.ts).
import { get, post, setToken, clearToken } from "./http";

export interface Role {
  id: number;
  name: string;
  rank: number;
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  roles: Role[];
  permissions: string[]; // "Resource:action", e.g. "Employee:write"
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
