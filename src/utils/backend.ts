import { getAuth } from "../lib/auth";
import { getFirestore } from "../lib/firestore";
import { apiFetch } from "../lib/api";

// Data and auth now come from the CodeIgniter 4 + MySQL backend (see backend/).
// The names below are kept so components did not need to change.
export const db = getFirestore();
export const auth = getAuth();

export interface TeamMemberRegisterResult {
  uid: string;
  isExistingAuth: boolean;
}

/**
 * Creates the login account for a new team member (admin only) and returns its uid.
 * The caller then saves the full profile to users/{uid}.
 */
export async function registerTeamMemberByAdmin(email: string, pass: string): Promise<TeamMemberRegisterResult> {
  return apiFetch<TeamMemberRegisterResult>("/admin/users", { method: "POST", body: { email, password: pass } });
}

/**
 * Kept for compatibility: password changes are applied by the backend when the
 * users/{uid} document is updated with a "password" field (it is hashed, never stored).
 */
export async function syncUserAuthPassword(_email: string, _oldPass: string, _newPass: string): Promise<boolean> {
  return true;
}

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) return data;
  if (Array.isArray(data)) {
    return data.map(item => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof data === "object" && !(data instanceof Date)) {
    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        clean[key] = sanitizeForFirestore(value);
      }
    }
    return clean as T;
  }
  return data;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    userId: auth.currentUser?.uid ?? null,
  };
  console.error("Data API Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
