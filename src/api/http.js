// Thin fetch wrapper for the Express API (see server/).
const API_BASE = import.meta.env.VITE_API_URL || "/api";

export function getToken() {
  return localStorage.getItem("access_token");
}

export function setToken(token) {
  localStorage.setItem("access_token", token);
}

export function clearToken() {
  localStorage.removeItem("access_token");
}

export function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function request(method, endpoint, body) {
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
    throw Object.assign(new Error(json.message || res.statusText), {
      status: res.status,
      data: json,
    });
  }

  return res.json();
}

export const get = (url) => request("GET", url);
export const post = (url, body) => request("POST", url, body);
export const put = (url, body) => request("PUT", url, body);
export const del = (url) => request("DELETE", url);

export { API_BASE };
