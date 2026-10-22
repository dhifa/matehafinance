/**
 * Drop-in replacement for the subset of firebase/auth this app used,
 * backed by the CodeIgniter 4 token login (/api/auth/*).
 */
import { apiFetch, ApiError, getToken, onUnauthorized, setToken } from "./api";

export interface User {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
  tenantId: string | null;
  providerData: { providerId: string; email: string | null }[];
}

export interface Auth {
  readonly currentUser: User | null;
}

type Listener = (user: User | null) => void;

let currentUser: User | null = null;
let resolved = false;
let resolving: Promise<void> | null = null;
const listeners = new Set<Listener>();

const auth: Auth = {
  get currentUser() {
    return currentUser;
  },
};

export function getAuth(): Auth {
  return auth;
}

function toUser(u: { uid: string; email: string }): User {
  return {
    uid: u.uid,
    email: u.email,
    emailVerified: true,
    isAnonymous: false,
    tenantId: null,
    providerData: [{ providerId: "password", email: u.email }],
  };
}

function emit(user: User | null) {
  currentUser = user;
  resolved = true;
  listeners.forEach((l) => l(user));
}

onUnauthorized(() => emit(null));

/** Errors keep Firebase-style codes ("auth/invalid-credential") so existing UI messages still match. */
function authError(err: unknown): Error {
  if (err instanceof ApiError) {
    const e = new ApiError(err.status, `auth/${err.code}`, err.message);
    return e;
  }
  return err as Error;
}

function restoreSession(): Promise<void> {
  if (!resolving) {
    resolving = (async () => {
      if (!getToken()) {
        emit(null);
        return;
      }
      try {
        const res = await apiFetch<{ user: { uid: string; email: string } }>("/auth/me");
        emit(toUser(res.user));
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) setToken(null);
        // Network problems keep the user signed out until the next reload
        emit(null);
      }
    })();
  }
  return resolving;
}

export function onAuthStateChanged(_auth: Auth, callback: Listener): () => void {
  listeners.add(callback);
  if (resolved) queueMicrotask(() => listeners.has(callback) && callback(currentUser));
  else restoreSession();
  return () => listeners.delete(callback);
}

export async function signInWithEmailAndPassword(_auth: Auth, email: string, password: string) {
  try {
    const res = await apiFetch<{ token: string; user: { uid: string; email: string } }>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setToken(res.token);
    const user = toUser(res.user);
    emit(user);
    return { user };
  } catch (err) {
    throw authError(err);
  }
}

export async function signOut(_auth: Auth): Promise<void> {
  try {
    if (getToken()) await apiFetch("/auth/logout", { method: "POST" });
  } catch {
    // Logging out locally is enough when the server is unreachable
  } finally {
    setToken(null);
    emit(null);
  }
}

// --- Password change (ChangePasswordModal) ---------------------------------

let pendingCurrentPassword: string | null = null;

export const EmailAuthProvider = {
  credential(email: string, password: string) {
    return { email, password };
  },
};

/** Remembers the current password; the server verifies it in updatePassword(). */
export async function reauthenticateWithCredential(_user: User, credential: { email: string; password: string }) {
  pendingCurrentPassword = credential.password;
}

export async function updatePassword(_user: User, newPassword: string): Promise<void> {
  const currentPassword = pendingCurrentPassword;
  pendingCurrentPassword = null;
  if (currentPassword === null) {
    throw new ApiError(400, "auth/requires-recent-login", "Masukkan kata sandi lama Anda terlebih dahulu.");
  }
  try {
    await apiFetch("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } });
  } catch (err) {
    throw authError(err);
  }
}
