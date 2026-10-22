/**
 * Minimal client for the CodeIgniter 4 backend (backend/).
 *
 * In development Vite proxies /api to the CI4 server (see vite.config.ts).
 * In production the CI4 app serves both the API and this frontend from the same origin.
 * Set VITE_API_BASE_URL only when the API lives on a different origin.
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const TOKEN_KEY = "mateha_api_token";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

let unauthorizedHandler: (() => void) | null = null;

/** Registered by the auth module so an expired token logs the user out everywhere. */
export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage unavailable (private mode): the session lasts until reload
  }
}

export async function apiFetch<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api${path}`, {
      method: init.method || "GET",
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "unavailable", "Tidak dapat terhubung ke server. Periksa koneksi internet Anda.");
  }

  const text = await res.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const code = payload?.code || (res.status === 403 ? "permission-denied" : res.status === 404 ? "not-found" : "internal");
    if (res.status === 401 && token && code === "unauthenticated") {
      setToken(null);
      unauthorizedHandler?.();
    }
    throw new ApiError(res.status, code, payload?.error || `Permintaan gagal (${res.status})`);
  }

  return payload as T;
}
