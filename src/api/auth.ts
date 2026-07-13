// Auth calls against the Express server (server/routes/auth.ts).
import { get, post, setToken, clearToken, API_BASE } from "./http";

export interface User {
  id: string;
  email: string;
  full_name: string;
}

export const auth = {
  login: async (email: string, password: string): Promise<void> => {
    const { access_token } = await post<{ access_token: string }>("/auth/login", { email, password });
    setToken(access_token);
  },

  register: (data: { email: string; password: string; full_name?: string }) =>
    post("/auth/register", data),

  verifyOtp: async ({ email, otpCode }: { email: string; otpCode: string }) => {
    const result = await post<{ access_token?: string }>("/auth/verify-otp", { email, otpCode });
    if (result.access_token) setToken(result.access_token);
    return result;
  },

  resendOtp: (email: string) => post("/auth/resend-otp", { email }),

  loginWithProvider: (provider: string, redirect: string): void => {
    window.location.href = `${API_BASE}/auth/${provider}?redirect=${encodeURIComponent(redirect)}`;
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
