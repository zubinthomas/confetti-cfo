/**
 * Express-backed API client.
 *
 * Exports the same `{ base44 }` shape as the old @base44/sdk client so all
 * existing component imports work without changes.
 */

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// ── Token helpers ─────────────────────────────────────────────────────────────

function getToken() {
  return localStorage.getItem('access_token');
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

async function request(method, endpoint, body) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    const err = new Error(json.message || res.statusText);
    err.status = res.status;
    err.data = json;
    throw err;
  }

  return res.json();
}

const get  = (url)       => request('GET',    url);
const post = (url, body) => request('POST',   url, body);
const put  = (url, body) => request('PUT',    url, body);
const del  = (url)       => request('DELETE', url);

// ── Auth ──────────────────────────────────────────────────────────────────────

const auth = {
  loginViaEmailPassword: async (email, password) => {
    const { access_token } = await post('/auth/login', { email, password });
    localStorage.setItem('access_token', access_token);
  },

  register: (data) => post('/auth/register', data),

  verifyOtp: async ({ email, otpCode }) => {
    const result = await post('/auth/verify-otp', { email, otpCode });
    if (result.access_token) localStorage.setItem('access_token', result.access_token);
    return result;
  },

  resendOtp: (email) => post('/auth/resend-otp', { email }),

  loginWithProvider: (provider, redirect) => {
    window.location.href = `${API_BASE}/auth/${provider}?redirect=${encodeURIComponent(redirect)}`;
  },

  me: () => get('/auth/me'),

  logout: (redirectUrl) => {
    localStorage.removeItem('access_token');
    window.location.href = redirectUrl || '/login';
  },

  redirectToLogin: (redirectUrl) => {
    window.location.href = redirectUrl ? `/login?from=${encodeURIComponent(redirectUrl)}` : '/login';
  },

  setToken: (token) => localStorage.setItem('access_token', token),

  resetPasswordRequest: (email) => post('/auth/reset-password-request', { email }),

  resetPassword: ({ resetToken, newPassword }) =>
    post('/auth/reset-password', { resetToken, newPassword }),
};

// ── Entities (Proxy so any entity name works) ─────────────────────────────────

const entities = new Proxy(
  {},
  {
    get: (_, entityName) => ({
      list: (sort) =>
        get(`/entities/${entityName}${sort ? `?sort=${encodeURIComponent(sort)}` : ''}`),
      create: (data) => post(`/entities/${entityName}`, data),
      update: (id, data) => put(`/entities/${entityName}/${id}`, data),
      delete: (id) => del(`/entities/${entityName}/${id}`),
    }),
  },
);

// ── Integrations ──────────────────────────────────────────────────────────────

const integrations = {
  Core: {
    /** Upload a file; returns { file_url } */
    UploadFile: async ({ file }) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE}/integrations/upload`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || 'Upload failed');
      }
      return res.json();
    },

    /** Invoke LLM; returns the response text string (same as base44 SDK) */
    InvokeLLM: async ({ prompt }) => {
      const { text } = await post('/integrations/llm', { prompt });
      return text;
    },
  },
};

// ── Exported client ───────────────────────────────────────────────────────────

export const base44 = { auth, entities, integrations };
