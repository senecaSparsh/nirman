/**
 * Pending-photo store — keeps a photo's File blob in IndexedDB when its
 * upload failed because the user was offline.
 *
 * The field forms capture photos at the moment of truth (a delivery challan,
 * a cracked beam, a gate pass). If the upload fails offline and the File is
 * dropped, the evidence is gone silently. This store retains the blob so the
 * uploader can retry the upload on reconnect and the offline queue can resolve
 * the real URL before replaying the op — a photo captured offline is never
 * lost, it's uploaded when connectivity returns.
 *
 * Standalone IndexedDB (`nirman-photos`) so it doesn't couple to the op
 * queue's schema/version.
 */

const DB_NAME = "nirman-photos";
const DB_VERSION = 1;
const STORE = "pending";

export interface PendingPhoto {
  id: string;
  blob: Blob;
  fileName?: string;
}

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
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

/** Retain a photo blob so it can be uploaded later. */
export function putPendingPhoto(id: string, blob: Blob, fileName?: string): Promise<PendingPhoto> {
  return tx("readwrite", (s) => s.put({ id, blob, fileName })).then(() => ({ id, blob, fileName }));
}

/** Read a pending blob (does NOT delete it). */
export function getPendingPhoto(id: string): Promise<PendingPhoto | null> {
  return tx("readonly", (s) => s.get(id)).then((r) => r ?? null);
}

/** Remove a pending blob (after it's been uploaded, or the photo was removed). */
export function deletePendingPhoto(id: string): Promise<void> {
  return tx("readwrite", (s) => s.delete(id)).then(() => undefined);
}
