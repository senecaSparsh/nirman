"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";

/**
 * useConcurrentEdit — hook for handling optimistic locking conflicts.
 *
 * Wraps a mutation function. If the server returns a 409 with
 * code: "CONCURRENT_EDIT", shows a toast and optionally a dialog
 * asking the user to reload and try again.
 *
 * Usage:
 *   const { mutate, conflictError, clearConflict } = useConcurrentEdit();
 *   const result = await mutate(async () => {
 *     const res = await fetch("/api/materials/[id]", { method: "PATCH", ... });
 *     return res;
 *   });
 */

interface ConflictInfo {
  message: string;
  entityType: string;
  id: string;
}

export function useConcurrentEdit() {
  const [conflictError, setConflictError] = useState<ConflictInfo | null>(null);

  const mutate = useCallback(async function <T>(
    fn: () => Promise<Response>,
  ): Promise<{ data?: T; error?: string; conflict?: boolean }> {
    try {
      const res = await fn();
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}));
        if (body.code === "CONCURRENT_EDIT") {
          setConflictError({
            message: body.error ?? "Concurrent edit detected",
            entityType: "record",
            id: "",
          });
          toast.error("Concurrent edit detected", {
            description: "Someone else modified this record. Please reload and try again.",
            duration: 6000,
          });
          return { error: body.error, conflict: true };
        }
        return { error: body.error ?? "Conflict", conflict: true };
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { error: body.error ?? "Request failed" };
      }
      const data = await res.json().catch(() => undefined);
      return { data };
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Network error" };
    }
  }, []);

  const clearConflict = useCallback(() => setConflictError(null), []);

  return { mutate, conflictError, clearConflict };
}
