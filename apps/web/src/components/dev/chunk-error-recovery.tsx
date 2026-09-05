"use client";

/**
 * Chunk-Error Auto-Recovery (client-side)
 * =========================================
 *
 * Two scenarios cause chunk-loading errors in the browser:
 *
 *  **Development (Turbopack):** after HMR updates, Turbopack's in-memory
 *  module graph can desync from the on-disk chunk cache. The browser gets
 *  "module factory is not available" or "Loading chunk N failed", but the
 *  dev server keeps running (no stdout error for the server wrapper to
 *  catch). A hard reload forces Turbopack to recompile fresh chunks.
 *
 *  **Production (after deploys):** when a new build is deployed, chunk
 *  filenames change (content-hashed). A user with a stale tab tries to
 *  lazy-load a chunk that no longer exists on the server → "Failed to fetch
 *  dynamically imported module" or "Loading chunk N failed". A hard reload
 *  fetches the new HTML which references the new chunk hashes.
 *
 * This component installs global error handlers that detect these failures
 * and automatically hard-reload the page.
 *
 * Loop prevention: a sessionStorage flag ensures we only auto-reload ONCE
 * per session per error type. If the error persists after the reload, the
 * user sees the error and can manually clear cache. The flag auto-clears
 * after 30s so future sessions can recover.
 */

import { useEffect } from "react";

const RELOAD_FLAG = "__nirman_chunk_error_reloaded";
const RELOAD_FLAG_TS = "__nirman_chunk_error_reloaded_ts";
const FLAG_TTL_MS = 30_000; // auto-clear flag after 30s

// Error signatures that indicate a chunk-loading failure.
const CHUNK_ERROR_SIGNATURES: readonly string[] = [
  "module factory is not available",
  "It might have been deleted in an HMR update",
  "Loading chunk",
  "Loading CSS chunk",
  "ChunkLoadError",
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
  "error loading dynamically imported module",
  "Importing a module script failed.",
  "error loading dynamically imported module:",
] as const;

function isChunkError(message: string): boolean {
  const lower = message.toLowerCase();
  return CHUNK_ERROR_SIGNATURES.some((sig) =>
    lower.includes(sig.toLowerCase()),
  );
}

/** Check if we already auto-reloaded recently (loop prevention). */
function alreadyReloadedRecently(): boolean {
  try {
    const flag = sessionStorage.getItem(RELOAD_FLAG);
    const ts = sessionStorage.getItem(RELOAD_FLAG_TS);
    if (flag !== "1") return false;
    // If the flag is older than the TTL, clear it and allow another reload.
    if (ts && Date.now() - parseInt(ts, 10) > FLAG_TTL_MS) {
      sessionStorage.removeItem(RELOAD_FLAG);
      sessionStorage.removeItem(RELOAD_FLAG_TS);
      return false;
    }
    return true;
  } catch {
    return false; // sessionStorage may be unavailable (private mode)
  }
}

/** Mark that we're about to auto-reload (loop prevention). */
function markReloaded() {
  try {
    sessionStorage.setItem(RELOAD_FLAG, "1");
    sessionStorage.setItem(RELOAD_FLAG_TS, Date.now().toString());
  } catch {
    // Ignore — best-effort.
  }
}

export function ChunkErrorRecovery() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // If we already auto-reloaded recently, don't loop. Set a timer to
    // clear the flag so future errors can recover.
    if (alreadyReloadedRecently()) {
      const timer = setTimeout(() => {
        try {
          sessionStorage.removeItem(RELOAD_FLAG);
          sessionStorage.removeItem(RELOAD_FLAG_TS);
        } catch {}
      }, FLAG_TTL_MS);
      return () => clearTimeout(timer);
    }

    const doReload = (context: string, detail: unknown) => {
      if (alreadyReloadedRecently()) return; // double-check inside handler
      console.warn(`[chunk-recovery] ${context} — auto-reloading once.`, detail);
      markReloaded();
      // Hard reload — bypass browser cache to force fresh chunk fetch.
      // In production this picks up new chunk hashes from the new HTML.
      // In dev this forces Turbopack to recompile fresh chunks.
      window.location.reload();
    };

    const handleError = (event: ErrorEvent) => {
      const message = event.message || "";
      if (!isChunkError(message)) return;
      doReload("Chunk error detected", { message, filename: event.filename });
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = String(event.reason?.message || event.reason || "");
      if (!isChunkError(reason)) return;
      doReload("Dynamic import error detected", { reason });
    };

    // Catch unhandled errors (module-factory errors surface here).
    window.addEventListener("error", handleError);
    // Catch unhandled promise rejections (dynamic import failures surface here).
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}
