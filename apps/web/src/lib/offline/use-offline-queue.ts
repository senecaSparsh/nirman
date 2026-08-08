"use client";

import { useCallback, useEffect, useState } from "react";
import {
  enqueue as enqueueOp,
  listQueue,
  pendingCount,
  syncQueue,
  isOnline,
  type QueuedOperation,
  type SyncResult,
} from "./queue";

/**
 * React hook binding for the offline queue. Exposes the current queue, the
 * pending count (for a badge), online status, and an enqueue helper that
 * triggers an immediate sync when online. Re-syncs on `online` events and
 * on window focus.
 */
export function useOfflineQueue() {
  const [queue, setQueue] = useState<QueuedOperation[]>([]);
  const [pending, setPending] = useState(0);
  // Initialize to `true` so the first client render matches the server
  // render (where `isOnline()` returns true because `navigator` is absent).
  // The real value is read inside the effect below, after hydration.
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncResult | null>(null);

  const refresh = useCallback(async () => {
    const [q, p] = await Promise.all([listQueue(), pendingCount()]);
    setQueue(q);
    setPending(p);
  }, []);

  const sync = useCallback(async () => {
    if (!isOnline()) return null;
    setSyncing(true);
    try {
      const result = await syncQueue();
      setLastSync(result);
      await refresh();
      return result;
    } finally {
      setSyncing(false);
    }
  }, [refresh]);

  const enqueue = useCallback(
    async (kind: QueuedOperation["kind"], payload: unknown) => {
      await enqueueOp(kind, payload);
      await refresh();
      // If online, push immediately; otherwise it waits for the next sync.
      if (isOnline()) void sync();
    },
    [refresh, sync],
  );

  // Initial load + wire up online/offline + focus events.
  useEffect(() => {
    // Sync the real browser online status now that we're on the client.
    setOnline(isOnline());
    void refresh();
    const onOnline = () => {
      setOnline(true);
      void sync();
    };
    const onOffline = () => setOnline(false);
    const onFocus = () => void sync();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh, sync]);

  return { queue, pending, online, syncing, lastSync, enqueue, sync, refresh };
}
