"use client";
import { SWRConfig } from "swr";

export const swrFetcher = async (url: string) => {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) {
    // Don't try to parse 204 No Content or empty bodies
    let msg = `HTTP ${r.status}`;
    if (r.status !== 204) {
      try {
        const body = await r.json();
        msg = body?.error ?? body?.message ?? msg;
      } catch {
        // Body wasn't JSON — keep the status code message
      }
    }
    const err = new Error(msg);
    // Attach status code so SWR's shouldRetryOnError can inspect it
    (err as Error & { status?: number }).status = r.status;
    throw err;
  }
  // 204 No Content or empty body — return null instead of throwing
  if (r.status === 204) return null;
  const text = await r.text();
  return text ? JSON.parse(text) : null;
};

/**
 * Determine if a fetch error should be retried by SWR.
 * - 4xx (client errors): NO — retrying won't help, the request is bad
 * - 5xx (server errors): YES — the server may recover
 * - Network errors (no status): YES — the network may recover
 */
function shouldRetryOnError(err: Error): boolean {
  const status = (err as Error & { status?: number }).status;
  if (status === undefined) return true; // network error — retry
  return status >= 500; // only retry server errors
}

export const swrConfig = {
  fetcher: swrFetcher,
  revalidateOnFocus: false,
  dedupingInterval: 2000,
  errorRetryCount: 3,
  shouldRetryOnError,
  isPaused: () => typeof navigator !== "undefined" && !navigator.onLine,
  onError: (err: Error, key: string) => {
    if (process.env.NODE_ENV === "development") {
      console.warn(`SWR fetch error for ${key}:`, err.message);
    }
  },
};

export { SWRConfig };
