/**
 * Drop-in replacement for the subset of the Firebase Firestore SDK this app used,
 * backed by the CodeIgniter 4 + MySQL API.
 *
 * Realtime listeners (onSnapshot) are emulated with polling: identical listeners
 * share one poller, polling pauses while the tab is hidden, and every local write
 * refreshes the affected collection immediately.
 */
import { apiFetch, ApiError } from "./api";

export type DocumentData = Record<string, any>;

export interface Firestore {
  readonly kind: "database";
}

export interface CollectionReference {
  readonly type: "collection";
  readonly collection: string;
  readonly path: string;
}

export interface DocumentReference {
  readonly type: "document";
  readonly collection: string;
  readonly id: string;
  readonly path: string;
}

type WhereOp = "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "array-contains";

interface WhereConstraint {
  readonly kind: "where";
  readonly clause: [string, WhereOp, unknown];
}

interface OrderByConstraint {
  readonly kind: "orderBy";
  readonly clause: [string, "asc" | "desc"];
}

export type QueryConstraint = WhereConstraint | OrderByConstraint;

export interface Query {
  readonly type: "query";
  readonly collection: string;
  readonly where: [string, WhereOp, unknown][];
  readonly orderBy: [string, "asc" | "desc"][];
}

export interface DocumentSnapshot<T = DocumentData> {
  readonly id: string;
  readonly ref: DocumentReference;
  exists(): boolean;
  data(): T | undefined;
}

export interface QueryDocumentSnapshot<T = DocumentData> extends DocumentSnapshot<T> {
  data(): T;
}

export interface QuerySnapshot<T = DocumentData> {
  readonly docs: QueryDocumentSnapshot<T>[];
  readonly size: number;
  readonly empty: boolean;
  forEach(callback: (doc: QueryDocumentSnapshot<T>) => void): void;
}

export type FirestoreError = ApiError;

export const POLL_INTERVAL_MS = 5000;

const database: Firestore = { kind: "database" };

export function getFirestore(): Firestore {
  return database;
}

// ---------------------------------------------------------------------------
// References & queries
// ---------------------------------------------------------------------------

export function collection(_db: Firestore, name: string): CollectionReference {
  return { type: "collection", collection: name, path: name };
}

export function doc(parent: Firestore | CollectionReference, ...segments: string[]): DocumentReference {
  let coll: string;
  let id: string;

  if ("type" in parent && parent.type === "collection") {
    coll = parent.collection;
    id = segments[0] ?? randomId();
  } else {
    const parts = segments.flatMap((s) => s.split("/")).filter(Boolean);
    if (parts.length !== 2) throw new Error(`Invalid document path: ${segments.join("/")}`);
    [coll, id] = parts;
  }
  return { type: "document", collection: coll, id, path: `${coll}/${id}` };
}

export function where(field: string, op: WhereOp, value: unknown): WhereConstraint {
  return { kind: "where", clause: [field, op, value] };
}

export function orderBy(field: string, direction: "asc" | "desc" = "asc"): OrderByConstraint {
  return { kind: "orderBy", clause: [field, direction] };
}

export function query(ref: CollectionReference | Query, ...constraints: QueryConstraint[]): Query {
  const base: Query = ref.type === "query" ? ref : { type: "query", collection: ref.collection, where: [], orderBy: [] };
  return {
    type: "query",
    collection: base.collection,
    where: [...base.where, ...constraints.filter((c): c is WhereConstraint => c.kind === "where").map((c) => c.clause)],
    orderBy: [...base.orderBy, ...constraints.filter((c): c is OrderByConstraint => c.kind === "orderBy").map((c) => c.clause)],
  };
}

// ---------------------------------------------------------------------------
// Field transforms
// ---------------------------------------------------------------------------

export function arrayUnion(...values: unknown[]) {
  return { __op: "arrayUnion", values };
}

export function arrayRemove(...values: unknown[]) {
  return { __op: "arrayRemove", values };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function docSnapshot<T>(ref: DocumentReference, data: T | null): DocumentSnapshot<T> {
  return {
    id: ref.id,
    ref,
    exists: () => data !== null,
    data: () => (data === null ? undefined : data),
  };
}

function querySnapshot<T>(collectionName: string, docs: { id: string; data: T }[]): QuerySnapshot<T> {
  const snaps = docs.map((d) => {
    const ref = doc(database, collectionName, d.id);
    return { id: d.id, ref, exists: () => true, data: () => d.data } as QueryDocumentSnapshot<T>;
  });
  return {
    docs: snaps,
    size: snaps.length,
    empty: snaps.length === 0,
    forEach: (cb) => snaps.forEach(cb),
  };
}

const enc = encodeURIComponent;

async function fetchDoc(ref: DocumentReference): Promise<DocumentData | null> {
  const res = await apiFetch<{ exists: boolean; data: DocumentData | null }>(`/collections/${enc(ref.collection)}/${enc(ref.id)}`);
  return res.exists ? (res.data as DocumentData) : null;
}

async function fetchQuery(q: Query): Promise<{ id: string; data: DocumentData }[]> {
  const params = new URLSearchParams();
  if (q.where.length) params.set("where", JSON.stringify(q.where));
  if (q.orderBy.length) params.set("orderBy", JSON.stringify(q.orderBy));
  const qs = params.toString();
  const res = await apiFetch<{ docs: { id: string; data: DocumentData }[] }>(`/collections/${enc(q.collection)}${qs ? `?${qs}` : ""}`);
  return res.docs;
}

function asQuery(ref: CollectionReference | Query): Query {
  return ref.type === "query" ? ref : query(ref);
}

export async function getDoc<T = DocumentData>(ref: DocumentReference): Promise<DocumentSnapshot<T>> {
  return docSnapshot(ref, (await fetchDoc(ref)) as T | null);
}

export const getDocFromServer = getDoc;

export async function getDocs<T = DocumentData>(ref: CollectionReference | Query): Promise<QuerySnapshot<T>> {
  const q = asQuery(ref);
  return querySnapshot(q.collection, (await fetchQuery(q)) as { id: string; data: T }[]);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** JSON round-trip drops undefined values, like Firestore's ignoreUndefinedProperties. */
function clean(data: unknown) {
  return JSON.parse(JSON.stringify(data ?? {}));
}

export async function setDoc(ref: DocumentReference, data: DocumentData, options?: { merge?: boolean }): Promise<void> {
  await apiFetch(`/collections/${enc(ref.collection)}/${enc(ref.id)}`, {
    method: "PUT",
    body: { data: clean(data), merge: !!options?.merge },
  });
  notifyChanged(ref.collection);
}

export async function updateDoc(ref: DocumentReference, data: DocumentData): Promise<void> {
  await apiFetch(`/collections/${enc(ref.collection)}/${enc(ref.id)}`, { method: "PATCH", body: { data: clean(data) } });
  notifyChanged(ref.collection);
}

export async function deleteDoc(ref: DocumentReference): Promise<void> {
  await apiFetch(`/collections/${enc(ref.collection)}/${enc(ref.id)}`, { method: "DELETE" });
  notifyChanged(ref.collection);
}

export async function addDoc(ref: CollectionReference, data: DocumentData): Promise<DocumentReference> {
  const res = await apiFetch<{ id: string }>(`/collections/${enc(ref.collection)}`, { method: "POST", body: { data: clean(data) } });
  notifyChanged(ref.collection);
  return doc(database, ref.collection, res.id);
}

// ---------------------------------------------------------------------------
// Live listeners (polling)
// ---------------------------------------------------------------------------

interface Listener {
  next: (snap: any) => void;
  error?: (err: FirestoreError) => void;
}

interface Channel {
  key: string;
  collection: string;
  load: () => Promise<any>;
  listeners: Set<Listener>;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  lastJson: string | null;
  lastSnap: any;
}

const channels = new Map<string, Channel>();

async function poll(channel: Channel) {
  if (channel.inFlight) return;
  channel.inFlight = true;
  try {
    const { json, snap } = await channel.load();
    if (json !== channel.lastJson) {
      channel.lastJson = json;
      channel.lastSnap = snap;
      channel.listeners.forEach((l) => l.next(snap));
    }
  } catch (err) {
    channel.listeners.forEach((l) => l.error?.(err as FirestoreError));
  } finally {
    channel.inFlight = false;
    schedule(channel);
  }
}

function schedule(channel: Channel) {
  if (channel.timer) clearTimeout(channel.timer);
  if (channel.listeners.size === 0) return;
  channel.timer = setTimeout(() => {
    channel.timer = null;
    if (typeof document !== "undefined" && document.hidden) {
      schedule(channel);
      return;
    }
    poll(channel);
  }, POLL_INTERVAL_MS);
}

function notifyChanged(collectionName: string) {
  channels.forEach((channel) => {
    if (channel.collection === collectionName) poll(channel);
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) channels.forEach((channel) => poll(channel));
  });
}

export function onSnapshot(
  ref: DocumentReference | CollectionReference | Query,
  next: (snap: any) => void,
  error?: (err: FirestoreError) => void
): () => void {
  const isDoc = ref.type === "document";
  const q = isDoc ? null : asQuery(ref as CollectionReference | Query);
  const key = isDoc ? `doc:${ref.path}` : `query:${JSON.stringify(q)}`;

  let channel = channels.get(key);
  if (!channel) {
    const collectionName = ref.collection;
    channel = {
      key,
      collection: collectionName,
      listeners: new Set(),
      timer: null,
      inFlight: false,
      lastJson: null,
      lastSnap: null,
      load: isDoc
        ? async () => {
            const data = await fetchDoc(ref as DocumentReference);
            return { json: JSON.stringify(data), snap: docSnapshot(ref as DocumentReference, data) };
          }
        : async () => {
            const docs = await fetchQuery(q!);
            return { json: JSON.stringify(docs), snap: querySnapshot(q!.collection, docs) };
          },
    };
    channels.set(key, channel);
  }

  const listener: Listener = { next, error };
  channel.listeners.add(listener);

  if (channel.lastSnap !== null) {
    // Deliver the cached snapshot right away, then keep polling
    const snap = channel.lastSnap;
    queueMicrotask(() => channel!.listeners.has(listener) && next(snap));
    if (!channel.timer && !channel.inFlight) schedule(channel);
  } else {
    poll(channel);
  }

  return () => {
    const ch = channels.get(key);
    if (!ch) return;
    ch.listeners.delete(listener);
    if (ch.listeners.size === 0) {
      if (ch.timer) clearTimeout(ch.timer);
      channels.delete(key);
    }
  };
}

function randomId(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
