"use client";

import { useCallback, useRef, useState, startTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * useCompanySwitch — unified company-switching logic.
 *
 * Implements the patterns used by Linear / Vercel / GitHub:
 *
 *  1. **Optimistic UI** — the caller's `onOptimisticSwitch` fires BEFORE
 *     the network request, so the header label / checkmark / tab title
 *     move instantly. On failure, `onRevert` restores the previous state.
 *
 *  2. **Generation counter** — a ref-based counter discards superseded
 *     switches. If the user clicks Company A then Company B before A's
 *     fetch resolves, A's result is ignored and B wins. No race conditions.
 *
 *  3. **Event with data** — the `nirman-company-switched` CustomEvent
 *     carries the new company object in `detail`, so the shell can update
 *     its brand mark / title / badge counts WITHOUT a second round-trip
 *     to `/api/company`.
 *
 *  4. **`startTransition`** — `router.refresh()` is wrapped in a transition
 *     so the shell stays interactive while the page's Server Components
 *     re-render with the new company context.
 *
 *  5. **`isSwitching` flag** — exposed so the shell can dim/blur the
 *     content area during the refresh, eliminating the visual gap where
 *     the header says "Company B" but the page still shows Company A's data.
 */

export interface CompanySwitchTarget {
  id: string;
  name: string;
  parentCompanyId?: string | null;
}

export interface UseCompanySwitchOptions {
  /** Called synchronously BEFORE the fetch — update your optimistic UI here. */
  onOptimisticSwitch?: (target: CompanySwitchTarget) => void;
  /** Called on fetch failure / network error — restore previous state. */
  onRevert?: () => void;
  /** Override the switch endpoint (default: /api/companies/switch). */
  endpoint?: string;
  /** If true, skip router.refresh() (e.g. the caller navigates manually). */
  skipRefresh?: boolean;
}

export function useCompanySwitch(opts: UseCompanySwitchOptions = {}) {
  const router = useRouter();
  const { onOptimisticSwitch, onRevert, endpoint = "/api/companies/switch", skipRefresh = false } = opts;

  // Generation counter — increments on every switch attempt. If a later
  // switch starts before an earlier one resolves, the earlier one's
  // result is discarded (prevents race conditions during rapid clicking).
  const genRef = useRef(0);

  const [isSwitching, setIsSwitching] = useState(false);
  const [switchingToId, setSwitchingToId] = useState<string | null>(null);

  const switchCompany = useCallback(
    async (target: CompanySwitchTarget) => {
      // Increment generation — this call "owns" this generation number.
      const gen = ++genRef.current;

      // Optimistic update — fire BEFORE the network request.
      onOptimisticSwitch?.(target);
      setIsSwitching(true);
      setSwitchingToId(target.id);

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId: target.id }),
        });

        // Race check — if a newer switch started, discard this result.
        if (gen !== genRef.current) return;

        if (res.ok) {
          // Dispatch event WITH data so the shell updates instantly
          // without a second round-trip to /api/company.
          window.dispatchEvent(
            new CustomEvent("nirman-company-switched", {
              detail: {
                id: target.id,
                name: target.name,
                parentCompanyId: target.parentCompanyId ?? null,
              },
            }),
          );

          if (!skipRefresh) {
            startTransition(() => {
              router.refresh();
            });
          }
        } else {
          // Revert optimistic update on failure
          if (gen === genRef.current) {
            onRevert?.();
          }
        }
      } catch {
        // Network error — revert if this is still the latest switch
        if (gen === genRef.current) {
          onRevert?.();
        }
      } finally {
        // Only clear switching state if this is still the latest switch
        if (gen === genRef.current) {
          setIsSwitching(false);
          setSwitchingToId(null);
        }
      }
    },
    [endpoint, onOptimisticSwitch, onRevert, router, skipRefresh],
  );

  return { switchCompany, isSwitching, switchingToId };
}
