// Auth calls against the Express server (server/routes/auth.js).
import { get, post, setToken, clearToken, API_BASE } from "./http";

export const auth = {
  login: async (email, password) => {
    const { access_token } = await post("/auth/login", { email, password });
    setToken(access_token);
  },

  register: (data) => post("/auth/register", data),

  verifyOtp: async ({ email, otpCode }) => {
    const result = await post("/auth/verify-otp", { email, otpCode });
    if (result.access_token) setToken(result.access_token);
    return result;
  },

  resendOtp: (email) => post("/auth/resend-otp", { email }),

  loginWithProvider: (provider, redirect) => {
    window.location.href = `${API_BASE}/auth/${provider}?redirect=${encodeURIComponent(redirect)}`;
  },

  me: () => get("/auth/me"),

  logout: (redirectUrl) => {
    clearToken();
    window.location.href = redirectUrl || "/login";
  },

  redirectToLogin: (redirectUrl) => {
    window.location.href = redirectUrl ? `/login?from=${encodeURIComponent(redirectUrl)}` : "/login";
  },

  setToken,

  resetPasswordRequest: (email) => post("/auth/reset-password-request", { email }),

  resetPassword: ({ resetToken, newPassword }) =>
    post("/auth/reset-password", { resetToken, newPassword }),
};
