import { initializeApp, deleteApp } from "firebase/app";
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  updatePassword, 
  signOut 
} from "firebase/auth";
import { 
  getFirestore, 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager,
  doc, 
  getDocFromServer 
} from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

const app = initializeApp(firebaseConfig);

let firestoreInstance: ReturnType<typeof getFirestore>;
try {
  firestoreInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    }),
    ignoreUndefinedProperties: true
  }, firebaseConfig.firestoreDatabaseId);
} catch {
  firestoreInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

export const db = firestoreInstance;
export const auth = getAuth(app);

export interface TeamMemberRegisterResult {
  uid: string;
  isExistingAuth: boolean;
}

/**
 * Registers a new team member's Firebase Auth credentials on behalf of the Admin,
 * without logging out or disturbing the current active Admin session.
 * If the user's email was already registered in Firebase Auth, it attempts to
 * verify or reconnect the account using the provided password or common defaults.
 */
export async function registerTeamMemberByAdmin(
  email: string, 
  pass: string
): Promise<TeamMemberRegisterResult> {
  const secondaryAppName = `AdminUserCreate-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
  const secondaryAuth = getAuth(secondaryApp);
  try {
    try {
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
      const uid = userCredential.user.uid;
      await signOut(secondaryAuth);
      return { uid, isExistingAuth: false };
    } catch (createErr: any) {
      const errCode = (createErr?.code || "").toLowerCase();
      const errMsg = (createErr?.message || "").toLowerCase();

      if (errCode.includes("email-already-in-use") || errMsg.includes("email-already-in-use")) {
        // The email exists in Firebase Auth!
        // 1. Try to authenticate with the supplied password
        try {
          const cred = await signInWithEmailAndPassword(secondaryAuth, email, pass);
          const uid = cred.user.uid;
          await signOut(secondaryAuth);
          return { uid, isExistingAuth: true };
        } catch {
          // 2. Try default system passwords (e.g. mateha123, 123456, admin123)
          const fallbacks = ["mateha123", "admin123", "123456", "password"];
          for (const fallbackPass of fallbacks) {
            if (fallbackPass === pass) continue;
            try {
              const fallbackCred = await signInWithEmailAndPassword(secondaryAuth, email, fallbackPass);
              try {
                // Update to the desired new password
                await updatePassword(fallbackCred.user, pass);
              } catch (updErr) {
                console.warn("Could not update auth password:", updErr);
              }
              const uid = fallbackCred.user.uid;
              await signOut(secondaryAuth);
              return { uid, isExistingAuth: true };
            } catch {
              // continue trying next fallback
            }
          }

          // If password doesn't match any known defaults, throw structured error
          const customError = new Error(
            `Email atau username "${email}" sudah pernah didaftarkan di sistem otentikasi Firebase dengan kata sandi berbeda. Masukkan kata sandi yang sesuai untuk menghubungkan kembali, atau gunakan username/email lain.`
          );
          customError.name = "EmailAlreadyInUseError";
          throw customError;
        }
      }

      throw createErr;
    }
  } finally {
    try {
      await deleteApp(secondaryApp);
    } catch (e) {
      console.warn("Failed to delete secondary app:", e);
    }
  }
}

/**
 * Attempts to sync updated password into Firebase Auth for an existing user
 * using a secondary app instance.
 */
export async function syncUserAuthPassword(
  email: string,
  oldPass: string,
  newPass: string
): Promise<boolean> {
  const secondaryAppName = `SyncPass-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const cred = await signInWithEmailAndPassword(secondaryAuth, email, oldPass);
    await updatePassword(cred.user, newPass);
    await signOut(secondaryAuth);
    return true;
  } catch (err) {
    console.warn("Failed to sync password to Firebase Auth:", err);
    return false;
  } finally {
    try {
      await deleteApp(secondaryApp);
    } catch (e) {
      console.warn("Failed to delete secondary app:", e);
    }
  }
}

// Test Connection Mandated by guidelines
async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration.");
    } else if (error instanceof Error && error.message.toLowerCase().includes("quota")) {
      console.warn("Firestore quota limit reached for today. Operations may be restricted until reset.");
    }
  }
}
testConnection();

// Skill Mandated Error Categories
export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
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
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error("Firestore Error Detailed: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
