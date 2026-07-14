// Thin fetch wrapper for the Express API (see server/).
const API_BASE = import.meta.env.VITE_API_URL || "/api";

export function getToken(): string | null {
  return localStorage.getItem("access_token");
}

export function setToken(token: string): void {
  localStorage.setItem("access_token", token);
}

export function clearToken(): void {
  localStorage.removeItem("access_token");
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function request<T = unknown>(
  method: string,
  endpoint: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new ApiError(json.message || res.statusText, res.status, json);
  }

  return res.json() as Promise<T>;
}

export const get = <T = unknown>(url: string) => request<T>("GET", url);
export const post = <T = unknown>(url: string, body?: unknown) => request<T>("POST", url, body);
export const put = <T = unknown>(url: string, body?: unknown) => request<T>("PUT", url, body);
export const patch = <T = unknown>(url: string, body?: unknown) => request<T>("PATCH", url, body);
export const del = <T = unknown>(url: string) => request<T>("DELETE", url);

export { API_BASE };
