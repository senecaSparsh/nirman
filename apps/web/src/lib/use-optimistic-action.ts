"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { haptic } from "@/lib/haptic";

/**
 * Optimistic action hook — for mobile mutations that should feel instant.
 *
 * Pattern:
 *   1. Apply the change to local state immediately (optimistic)
 *   2. Fire the API call in the background
 *   3. On success: confirm (haptic + toast) + router.refresh()
 *   4. On failure: revert local state + error haptic + toast
 *
 * Usage:
 *   const { execute, isPending } = useOptimisticAction({
 *     endpoint: `/api/purchase-orders/${po.id}`,
 *     method: "PATCH",
 *     body: { action: "approve" },
 *     optimisticUpdate: () => setLocalStatus("APPROVED"),
 *     revert: () => setLocalStatus("DRAFT"),
 *     successMessage: "PO approved",
 *     hapticOnSuccess: [10, 30, 10],
 *   });
 *   <button onClick={execute}>Approve</button>
 *
 * The hook uses useTransition so the optimistic state update doesn't
 * block the UI thread — React renders the new state in the next paint.
 */
interface UseOptimisticActionOptions {
  endpoint: string;
  method?: "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Apply the optimistic change to local state. Called before the API call. */
  optimisticUpdate?: () => void;
  /** Revert the optimistic change if the API call fails. */
  revert?: () => void;
  /** Toast message on success. If omitted, no toast. */
  successMessage?: string;
  /** Toast description on success. */
  successDescription?: string;
  /** Toast message on failure. If omitted, the server error is used. */
  errorMessage?: string;
  /** Haptic pattern on success. Default: 20 (medium tap). */
  hapticOnSuccess?: number | number[];
  /** Haptic pattern on failure. Default: [10, 40, 80] (error pattern). */
  hapticOnError?: number | number[];
  /** Whether to call router.refresh() on success. Default: true. */
  refreshOnSuccess?: boolean;
  /** Callback after successful completion. */
  onSuccess?: (data: unknown) => void;
}

export function useOptimisticAction({
  endpoint,
  method = "PATCH",
  body,
  optimisticUpdate,
  revert,
  successMessage,
  successDescription,
  errorMessage,
  hapticOnSuccess = 20,
  hapticOnError = [10, 40, 80],
  refreshOnSuccess = true,
  onSuccess,
}: UseOptimisticActionOptions) {
  const [, startTransition] = useTransition();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const execute = useCallback(
    async (overrideBody?: unknown) => {
      setError(null);
      setIsPending(true);

      // Apply optimistic update immediately
      if (optimisticUpdate) {
        startTransition(() => {
          optimisticUpdate();
        });
      }

      try {
        const res = await fetch(endpoint, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(overrideBody ?? body),
          credentials: "include",
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          const msg = errorMessage ?? (data?.error ?? data?.message ?? `HTTP ${res.status}`);
          throw new Error(msg);
        }

        // Success
        setIsPending(false);
        haptic(hapticOnSuccess);
        if (successMessage) {
          toast.success(successMessage, successDescription ? { description: successDescription } : undefined);
        }
        if (onSuccess) onSuccess(data);
        if (refreshOnSuccess) router.refresh();
        return data;
      } catch (err) {
        // Revert optimistic update
        setIsPending(false);
        if (revert) {
          startTransition(() => {
            revert();
          });
        }
        const msg = err instanceof Error ? err.message : "Something went wrong";
        setError(msg);
        haptic(hapticOnError);
        toast.error(msg);
        throw err;
      }
    },
    [
      endpoint,
      method,
      body,
      optimisticUpdate,
      revert,
      successMessage,
      successDescription,
      errorMessage,
      hapticOnSuccess,
      hapticOnError,
      refreshOnSuccess,
      onSuccess,
      router,
    ],
  );

  return { execute, isPending, error };
}
