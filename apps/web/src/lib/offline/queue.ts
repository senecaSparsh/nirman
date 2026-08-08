"use client";

/**
 * Offline Queue — the core of the field PWA's offline-first architecture.
 *
 * Site storekeepers operate at remote job sites with unstable cellular
 * connectivity. Stock movements (goods receipts, material issues, transfers)
 * are validated locally, assigned a temporary client UUID, and committed to
 * IndexedDB. When connectivity is restored, the sync processor pushes queued
 * transactions sequentially to the API gateway.
 *
 * Conflict resolution: server-wins with timestamp logic. The server is the
 * source of truth for stock state; a queued receipt that the server rejects
 * (e.g. PO no longer receivable, over-delivery) is marked FAILED with the
 * server error and retained for review — it is NOT silently dropped.
 *
 * This module is framework-agnostic (no React) so it can be unit-tested and
 * used by the service worker's sync event as well as the UI.
 */

// ── Types ───────────────────────────────────────────────────────

export type QueueStatus = "PENDING" | "SYNCING" | "COMPLETED" | "FAILED";

export interface QueuedOperation {
  /** Client-generated UUID — stable across retries. */
  id: string;
  /** Operation kind, maps to an API endpoint. */
  kind: "goods-receipt" | "material-issue" | "stock-transfer";
  /** Serialized JSON body to POST. */
  payload: unknown;
  status: QueueStatus;
  /** ISO timestamp — used for server-wins ordering + UI display. */
  createdAt: string;
  /** Last sync attempt timestamp. */
  attemptedAt?: string;
  /** Server response on completion (for UI confirmation). */
  result?: unknown;
  /** Server error message on failure (for review). */
  error?: string;
  /** Retry count. */
  attempts: number;
}

export interface SyncResult {
  processed: number;
  completed: number;
  failed: number;
  remaining: number;
}

// ── IndexedDB wrapper ────────────────────────────────────────────

const DB_NAME = "nirman-field";
const DB_VERSION = 1;
const STORE = "queue";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this environment"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    const request = fn(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

// ── UUID (crypto.randomUUID with fallback) ──────────────────────

export function newOpId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback (older browsers / insecure contexts)
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Public API ──────────────────────────────────────────────────

/** Enqueue a new operation. Returns the created QueuedOperation. */
export async function enqueue(
  kind: QueuedOperation["kind"],
  payload: unknown,
): Promise<QueuedOperation> {
  const op: QueuedOperation = {
    id: newOpId(),
    kind,
    payload,
    status: "PENDING",
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  await tx("readwrite", (store) => store.add(op));
  return op;
}

/** List all queued operations, oldest first (FIFO sync order). */
export async function listQueue(): Promise<QueuedOperation[]> {
  const all = await tx<QueuedOperation[]>("readonly", (store) => store.getAll());
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** List only operations still awaiting sync (PENDING or FAILED — failed ones retry). */
export async function pendingQueue(): Promise<QueuedOperation[]> {
  const all = await listQueue();
  return all.filter((op) => op.status === "PENDING" || op.status === "FAILED");
}

/** Count of pending operations (for the UI badge). */
export async function pendingCount(): Promise<number> {
  const pending = await pendingQueue();
  return pending.length;
}

/** Clear completed operations (housekeeping). */
export async function clearCompleted(): Promise<void> {
  const all = await listQueue();
  const completed = all.filter((op) => op.status === "COMPLETED");
  await tx("readwrite", (store) => {
    let last: IDBRequest = store.clear(); // fallback no-op
    for (const op of completed) last = store.delete(op.id);
    return last;
  });
}

async function updateOp(op: QueuedOperation): Promise<void> {
  await tx("readwrite", (store) => store.put(op));
}

// ── Sync processor ──────────────────────────────────────────────

/** Endpoint + auth for each operation kind. */
const ENDPOINTS: Record<QueuedOperation["kind"], string> = {
  "goods-receipt": "/api/goods-receipts",
  "material-issue": "/api/issue-materials",
  "stock-transfer": "/api/transfers",
};

/**
 * Push queued operations to the server sequentially. Processes PENDING and FAILED
 * operations in FIFO order. Server-wins: a server rejection marks the op FAILED
 * with the error message and retains it for review; it does not block subsequent ops.
 *
 * Call this on: app focus, online event, service-worker sync event, and after
 * enqueueing a new op while online.
 */
export async function syncQueue(
  fetchImpl: typeof fetch = fetch,
): Promise<SyncResult> {
  const pending = await pendingQueue();
  let completed = 0;
  let failed = 0;

  for (const op of pending) {
    op.status = "SYNCING";
    op.attemptedAt = new Date().toISOString();
    op.attempts += 1;
    await updateOp(op);

    const endpoint = ENDPOINTS[op.kind];
    try {
      const res = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(op.payload),
        credentials: "include",
      });
      if (res.ok) {
        const result = await res.json().catch(() => null);
        op.status = "COMPLETED";
        op.result = result;
        op.error = undefined;
        completed += 1;
      } else {
        const body = await res.json().catch(() => null);
        op.status = "FAILED";
        op.error = (body && (body.error || body.message)) || `HTTP ${res.status}`;
        failed += 1;
      }
    } catch (err: unknown) {
      // Network failure — leave it PENDING so it retries next sync.
      op.status = "PENDING";
      op.error = (err instanceof Error ? err.message : "Network error");
      // Stop syncing on network errors — the rest will likely fail too.
      await updateOp(op);
      break;
    }
    await updateOp(op);
  }

  const remaining = await pendingCount();
  return { processed: completed + failed, completed, failed, remaining };
}

/** True when the browser is online. */
export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}
