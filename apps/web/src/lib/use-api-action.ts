"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

/**
 * useApiAction — a desktop-friendly mutation hook with optimistic updates,
 * automatic retry, and stale-while-revalidate semantics.
 *
 * Unlike useOptimisticAction (which is configured at hook-call time),
 * useApiAction returns a reusable `mutate` function that can be called
 * with different endpoints/bodies — ideal for dialogs with multiple actions.
 *
 * Features:
 *   1. Optimistic update — apply local state change before the API call
 *   2. Auto-retry — retries up to 2 times with exponential backoff on
 *      network errors (not on 4xx business errors)
 *   3. Revert on failure — restores local state if the API rejects
 *   4. Toast on success/error — with optional action button (e.g. "Retry")
 *   5. Stale-while-revalidate — calls router.refresh() in background
 *
 * Usage:
 *   const { mutate, isPending } = useApiAction();
 *   await mutate({
 *     endpoint: `/api/purchase-orders/${po.id}`,
 *     method: "PATCH",
 *     body: { action: "approve" },
 *     optimisticUpdate: () => setLocalStatus("APPROVED"),
 *     revert: () => setLocalStatus("DRAFT"),
 *     successMessage: "PO approved",
 *   });
 */

interface ApiActionOptions {
  endpoint: string;
  method?: "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Apply the optimistic change to local state. Called before the API call. */
  optimisticUpdate?: () => void;
  /** Revert the optimistic change if the API call fails (after retries). */
  revert?: () => void;
  /** Toast message on success. If omitted, no toast. */
  successMessage?: string;
  /** Toast description on success. */
  successDescription?: string;
  /** Toast action button (e.g. { label: "Receive Goods", onClick: fn }) */
  successAction?: { label: string; onClick: () => void };
  /** Toast message on failure. If omitted, the server error is used. */
  errorMessage?: string;
  /** Whether to call router.refresh() on success. Default: true. */
  refreshOnSuccess?: boolean;
  /** Callback after successful completion. */
  onSuccess?: (data: unknown) => void;
  /** Max retry attempts on network errors. Default: 2. */
  maxRetries?: number;
}

const RETRY_DELAYS = [500, 1500]; // exponential backoff: 500ms, 1.5s

export function useApiAction() {
  const [, startTransition] = useTransition();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  // Ref to hold the latest mutate function so the retry button can call it
  // without creating a circular dependency in useCallback.
  const mutateRef = useRef<((opts: ApiActionOptions) => Promise<unknown>) | null>(null);

  const mutate = useCallback(
    async (opts: ApiActionOptions) => {
      const {
        endpoint,
        method = "PATCH",
        body,
        optimisticUpdate,
        revert,
        successMessage,
        successDescription,
        successAction,
        errorMessage,
        refreshOnSuccess = true,
        onSuccess,
        maxRetries = 2,
      } = opts;

      setError(null);
      setIsPending(true);

      // Apply optimistic update immediately
      if (optimisticUpdate) {
        startTransition(() => optimisticUpdate());
      }

      let lastError: Error | null = null;

      // Retry loop — only retries on network errors, not 4xx/5xx business errors
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const res = await fetch(endpoint, {
            method,
            headers: { "Content-Type": "application/json" },
            body: body ? JSON.stringify(body) : undefined,
            credentials: "include",
          });

          const data = await res.json().catch(() => null);

          if (!res.ok) {
            // Business error (4xx) — don't retry, show error immediately
            const msg = errorMessage ?? (data?.error ?? data?.message ?? `HTTP ${res.status}`);
            throw new Error(msg);
          }

          // Success
          setIsPending(false);
          if (successMessage) {
            toast.success(successMessage, {
              ...(successDescription ? { description: successDescription } : {}),
              ...(successAction ? { action: successAction } : {}),
            });
          }
          if (onSuccess) onSuccess(data);
          if (refreshOnSuccess) router.refresh();
          return data;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error("Unknown error");

          // Don't retry on business errors (they have a message from the server)
          // Only retry on network errors (TypeError: Failed to fetch)
          const isNetworkError = err instanceof TypeError;
          if (!isNetworkError || attempt >= maxRetries) break;

          // Wait with exponential backoff before retrying
          await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt] ?? 2000));
        }
      }

      // All retries exhausted — revert and show error
      setIsPending(false);
      if (revert) {
        startTransition(() => revert());
      }
      const msg = lastError?.message ?? "Something went wrong";
      setError(msg);
      toast.error(msg, {
        action: {
          label: "Retry",
          onClick: () => mutateRef.current?.(opts),
        },
      });
      throw lastError;
    },
    [router],
  );

  // Keep the ref in sync so the retry button always calls the latest mutate
  useEffect(() => {
    mutateRef.current = mutate;
  }, [mutate]);

  return { mutate, isPending, error };
}
