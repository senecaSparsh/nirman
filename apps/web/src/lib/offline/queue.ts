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
  /**
   * Company the op was queued under. Endpoints resolve the company from the
   * session, so an op queued under company A must never sync while company B
   * is active — it would silently land in the wrong tenant. The resolver is
   * registered by the app/mobile shell; ops stamped before a resolver exists
   * (companyId undefined) sync under whatever company is active (back-compat).
   */
  companyId?: string;
  /**
   * User the op was queued by. Sign-out wipes the queue, but an interrupted
   * sign-out (device dies mid-cleanup) can leave ops behind — stamping the
   * user lets sync refuse to replay user A's writes under user B's session.
   * Ops stamped before a resolver exists (userId undefined) sync under the
   * active session (back-compat).
   */
  userId?: string;
  /** Operation kind, maps to an API endpoint. */
  kind:
    | "goods-receipt"
    | "material-issue"
    | "stock-transfer"
    | "material-sale"
    | "requisition"
    | "stock-count"
    | "supplier-return"
    | "purchase-order"
    | "attendance"
    | "dpr";
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
const DB_VERSION = 2;
const STORE = "queue";
const DRAFTS_STORE = "drafts";

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
      // v2: add drafts store for auto-saving form state
      if (!db.objectStoreNames.contains(DRAFTS_STORE)) {
        const draftStore = db.createObjectStore(DRAFTS_STORE, { keyPath: "key" });
        draftStore.createIndex("formType", "formType", { unique: false });
        draftStore.createIndex("updatedAt", "updatedAt", { unique: false });
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

// ── Active-company resolver ──────────────────────────────────────
// Registered by the app/mobile shell (they know the session's active
// company). Used to stamp new ops and to refuse syncing ops that belong
// to a different tenant after a company switch.
let activeCompanyResolver: (() => string | null) | null = null;

export function setActiveCompanyResolver(fn: (() => string | null) | null) {
  activeCompanyResolver = fn;
}

export function getActiveCompanyId(): string | null {
  try {
    return activeCompanyResolver?.() ?? null;
  } catch {
    return null;
  }
}

// Same pattern for the active user — guards the queue against replaying one
// user's ops under a different user's session after an interrupted sign-out.
let activeUserResolver: (() => string | null) | null = null;

export function setActiveUserResolver(fn: (() => string | null) | null) {
  activeUserResolver = fn;
}

export function getActiveUserId(): string | null {
  try {
    return activeUserResolver?.() ?? null;
  } catch {
    return null;
  }
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
    companyId: getActiveCompanyId() ?? undefined,
    userId: getActiveUserId() ?? undefined,
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

/**
 * Auto-retry budget for FAILED ops. A rejection that can never succeed
 * (e.g. "insufficient stock", a deleted material) would otherwise re-attempt
 * on every sync forever — burning requests and holding the queue badge
 * non-zero. After this many attempts the op stays FAILED for review but is
 * excluded from automatic sync; the worker retries it deliberately via
 * retryOp() once the cause is fixed, or redoes the operation from the form.
 */
export const MAX_AUTO_RETRY = 5;

/** List only operations still awaiting sync (PENDING or FAILED — failed ones retry up to MAX_AUTO_RETRY). */
export async function pendingQueue(): Promise<QueuedOperation[]> {
  const all = await listQueue();
  return all.filter(
    (op) => op.status === "PENDING" || (op.status === "FAILED" && op.attempts < MAX_AUTO_RETRY),
  );
}

/**
 * Manually re-queue a FAILED op — resets it to PENDING and clears the retry
 * budget so the next sync re-attempts it. Call after the worker has fixed
 * whatever made it fail (e.g. restocked the material).
 */
export async function retryOp(id: string): Promise<void> {
  const all = await listQueue();
  const op = all.find((o) => o.id === id);
  if (!op || op.status !== "FAILED") return;
  op.status = "PENDING";
  op.error = undefined;
  op.attempts = 0;
  await updateOp(op);
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

/**
 * Wipe the entire queue — used on sign-out. Queued ops replay under
 * whatever session is active at sync time, so leaving them would leak
 * one user's pending work into the next sign-in on the same device.
 */
export async function clearAllOps(): Promise<void> {
  await tx("readwrite", (store) => store.clear());
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
  "material-sale": "/api/material-sales",
  "requisition": "/api/requisitions",
  "stock-count": "/api/stock-counts",
  "supplier-return": "/api/supplier-returns",
  "purchase-order": "/api/purchase-orders",
  // Both are upsert-style (attendance on [employeeId,date]; DPR on
  // [projectId,date]) so a queued retry after a half-committed network
  // failure is safe — the server resolves to the same record.
  "attendance": "/api/attendance",
  "dpr": "/api/dprs",
};

/**
 * Push queued operations to the server sequentially. Processes PENDING and FAILED
 * operations in FIFO order. Server-wins: a server rejection marks the op FAILED
 * with the error message and retains it for review; it does not block subsequent ops.
 *
 * Call this on: app focus, online event, service-worker sync event, and after
 * enqueueing a new op while online.
 *
 * Re-entrancy: all of those triggers can fire at once (online + focus +
 * post-enqueue + the SW message). Two overlapping runs both read the same
 * PENDING op and POST it twice — the first lands, the second hits the
 * server's dedup guard and flips the op to FAILED even though the data was
 * recorded. Concurrent calls therefore coalesce onto the single in-flight
 * run via `inflightSync`.
 */
let inflightSync: Promise<SyncResult> | null = null;

export function syncQueue(
  fetchImpl: typeof fetch = fetch,
): Promise<SyncResult> {
  if (inflightSync) return inflightSync;
  const run = (async () => {
    // Drain loop: an op enqueued mid-run wasn't in the pending list that run
    // read. Re-run while progress is being made (remaining count shrinking);
    // stop when a run makes no progress (e.g. it broke early on a network
    // error leaving ops PENDING) so we can't spin forever.
    let result = await syncQueueInner(fetchImpl);
    let lastRemaining = result.remaining;
    while (result.remaining > 0) {
      result = await syncQueueInner(fetchImpl);
      if (result.remaining >= lastRemaining) break;
      lastRemaining = result.remaining;
    }
    return result;
  })().finally(() => {
    inflightSync = null;
  });
  inflightSync = run;
  return run;
}

async function syncQueueInner(
  fetchImpl: typeof fetch,
): Promise<SyncResult> {
  const pending = await pendingQueue();
  let completed = 0;
  let failed = 0;

  for (const op of pending) {
    op.status = "SYNCING";
    op.attemptedAt = new Date().toISOString();
    op.attempts += 1;

    // Tenant guard: the endpoint resolves company from the session. If the
    // op was queued under a different company than the active one, posting
    // it would write to the wrong tenant. Mark FAILED (retained for review)
    // instead — the user can switch back to that company and retry.
    const activeCompany = getActiveCompanyId();
    if (op.companyId && activeCompany && op.companyId !== activeCompany) {
      op.status = "FAILED";
      op.error =
        "Queued under a different company. Switch back to that company to sync this item.";
      failed += 1;
      await updateOp(op);
      continue;
    }

    // User guard: an op queued by user A must never replay under user B's
    // session — it would attribute A's write to B. Sign-out wipes the queue,
    // but an interrupted cleanup can leave ops behind; fail closed instead.
    const activeUser = getActiveUserId();
    if (op.userId && op.userId !== activeUser) {
      op.status = "FAILED";
      op.error =
        "Queued by a different signed-in user. Sign back in as that user to sync this item.";
      failed += 1;
      await updateOp(op);
      continue;
    }

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
