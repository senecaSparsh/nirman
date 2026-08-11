"use client";

import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Draft Saving Hook — auto-saves form state to IndexedDB every 2 seconds.
 *
 * When a user starts filling out a form (e.g. attendance, DPR) and gets
 * distracted or loses connection, the draft is preserved. On next visit
 * to the same form, the draft is offered for restoration via a banner.
 *
 * Usage:
 *   const { draft, saveDraft, clearDraft, hasDraft } = useDrafts("attendance", formKey);
 *
 *   // Auto-save: call saveDraft(formState) in a useEffect with debounce
 *   // On mount: check hasDraft to show restoration banner
 *   // On submit: call clearDraft()
 */

export interface DraftData {
  key: string;
  formType: string;
  data: unknown;
  updatedAt: string;
}

const DB_NAME = "nirman-field";
const DRAFTS_STORE = "drafts";
const AUTOSAVE_INTERVAL_MS = 2000;
const DRAFT_EXPIRY_DAYS = 7;

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 2);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getDraft(key: string): Promise<DraftData | null> {
  try {
    const db = await openDraftDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DRAFTS_STORE, "readonly");
      const store = tx.objectStore(DRAFTS_STORE);
      const req = store.get(key);
      req.onsuccess = () => {
        const result = req.result as DraftData | undefined;
        // Check expiry
        if (result) {
          const age = Date.now() - new Date(result.updatedAt).getTime();
          if (age > DRAFT_EXPIRY_DAYS * 24 * 60 * 60 * 1000) {
            // Expired — delete it
            tx.oncomplete = () => db.close();
            const delTx = db.transaction(DRAFTS_STORE, "readwrite");
            delTx.objectStore(DRAFTS_STORE).delete(key);
            delTx.oncomplete = () => db.close();
            resolve(null);
            return;
          }
        }
        tx.oncomplete = () => db.close();
        resolve(result ?? null);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function putDraft(draft: DraftData): Promise<void> {
  try {
    const db = await openDraftDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DRAFTS_STORE, "readwrite");
      const store = tx.objectStore(DRAFTS_STORE);
      store.put(draft);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Silently fail — drafts are best-effort
  }
}

async function deleteDraft(key: string): Promise<void> {
  try {
    const db = await openDraftDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DRAFTS_STORE, "readwrite");
      const store = tx.objectStore(DRAFTS_STORE);
      store.delete(key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Silently fail
  }
}

export type DraftSaveStatus = "idle" | "saving" | "saved" | "unsaved";

export function useDrafts<T>(
  formType: string,
  formKey: string,
): {
  draft: T | null;
  hasDraft: boolean;
  draftUpdatedAt: string | null;
  saveStatus: DraftSaveStatus;
  saveDraft: (data: T) => void;
  clearDraft: () => void;
  restoreDraft: () => T | null;
} {
  const [draft, setDraft] = useState<T | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [draftUpdatedAt, setDraftUpdatedAt] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<DraftSaveStatus>("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDataRef = useRef<T | null>(null);

  // Load draft on mount
  useEffect(() => {
    let cancelled = false;
    getDraft(formKey).then((d) => {
      if (cancelled) return;
      if (d) {
        setDraft(d.data as T);
        setHasDraft(true);
        setDraftUpdatedAt(d.updatedAt);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [formKey]);

  // Debounced auto-save — saves 2 seconds after the last change
  const saveDraft = useCallback((data: T) => {
    pendingDataRef.current = data;
    setSaveStatus("unsaved");
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      if (pendingDataRef.current === null) return;
      setSaveStatus("saving");
      const draftData: DraftData = {
        key: formKey,
        formType,
        data: pendingDataRef.current,
        updatedAt: new Date().toISOString(),
      };
      void putDraft(draftData).then(() => {
        setSaveStatus("saved");
        setDraftUpdatedAt(draftData.updatedAt);
      }).catch(() => {
        setSaveStatus("unsaved");
      });
    }, AUTOSAVE_INTERVAL_MS);
  }, [formKey, formType]);

  const clearDraft = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    pendingDataRef.current = null;
    setDraft(null);
    setHasDraft(false);
    setDraftUpdatedAt(null);
    setSaveStatus("idle");
    void deleteDraft(formKey);
  }, [formKey]);

  const restoreDraft = useCallback(() => {
    return draft;
  }, [draft]);

  // Cleanup pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        // Flush pending save
        if (pendingDataRef.current !== null) {
          const draftData: DraftData = {
            key: formKey,
            formType,
            data: pendingDataRef.current,
            updatedAt: new Date().toISOString(),
          };
          void putDraft(draftData);
        }
      }
    };
  }, [formKey, formType]);

  return {
    draft,
    hasDraft,
    draftUpdatedAt,
    saveStatus,
    saveDraft,
    clearDraft,
    restoreDraft,
  };
}
