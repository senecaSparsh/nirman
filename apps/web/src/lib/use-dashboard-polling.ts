"use client";

import { useEffect, useState } from "react";

/**
 * ═══════════════════════════════════════════════════════════════════
 * useDashboardPolling — 30-second polling for dashboard counts.
 *
 * Business Owner: "SSE is overkill. Just add a 30-second polling
 * interval to the dashboard counts."
 *
 * Replaces SSE (which was backlog) with a practical 80/20 solution.
 * Polls /api/dashboard-counts every 30 seconds and returns the fresh
 * counts. The interval is cleared on unmount.
 *
 * The hook is silent on failure — if the fetch fails (network blip,
 * auth expiry), it just keeps the last successful data and retries
 * on the next tick. No error UI, no toast, no cascade.
 * ═══════════════════════════════════════════════════════════════════
 */

export interface DashboardCounts {
  queues: { key: string; count: number; urgency: "blocking" | "soon" }[];
  totalQueues: number;
  blockingQueues: number;
  kpis: {
    totalPOs6mo: number;
    totalSpend6mo: number;
    lowStockCount: number;
    healthyStockCount: number;
    pendingActions: { label: string; value: number }[];
  };
}

const POLL_INTERVAL = 30_000; // 30 seconds

export function useDashboardPolling(): DashboardCounts | null {
  const [counts, setCounts] = useState<DashboardCounts | null>(null);

  useEffect(() => {
    let active = true;

    async function fetchCounts() {
      try {
        const res = await fetch("/api/dashboard-counts");
        if (!res.ok) return;
        const data = await res.json();
        if (active && data) setCounts(data as DashboardCounts);
      } catch {
        // Silent — keep last successful data, retry next tick
      }
    }

    // Fetch immediately on mount, then poll every 30 seconds
    fetchCounts();
    const interval = setInterval(fetchCounts, POLL_INTERVAL);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  return counts;
}
