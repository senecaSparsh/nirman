"use client";

import { useEffect, useRef } from "react";

/**
 * ═══════════════════════════════════════════════════════════════════
 * ERROR CATCHER — captures all client-side errors and logs them
 *
 * This component is mounted once in the root layout. It captures:
 *   1. window.onerror — uncaught JS errors
 *   2. unhandledrejection — unhandled Promise rejections
 *   3. console.error — all console.error calls (wrapped)
 *
 * Errors are batched and sent to /api/error-logs every 5 seconds
 * (or when the buffer reaches 10 entries). This gives the developer
 * full visibility into what users are experiencing without requiring
 * Sentry or external services.
 *
 * The component is invisible — it renders nothing.
 * ═══════════════════════════════════════════════════════════════════
 */

interface ErrorEntry {
  type: "error" | "unhandledrejection" | "console.error";
  message: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
  url: string;
  timestamp: string;
}

const FLUSH_INTERVAL = 5000;
const MAX_BUFFER = 10;

export function ErrorCatcher() {
  const bufferRef = useRef<ErrorEntry[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Avoid double-mounting in React strict mode
    if ((window as unknown as { __errorCatcherMounted?: boolean }).__errorCatcherMounted) return;
    (window as unknown as { __errorCatcherMounted?: boolean }).__errorCatcherMounted = true;

    const pushError = (entry: ErrorEntry) => {
      bufferRef.current.push(entry);
      if (bufferRef.current.length >= MAX_BUFFER) {
        flush();
      }
    };

    const flush = async () => {
      if (bufferRef.current.length === 0) return;
      const batch = bufferRef.current.splice(0);
      try {
        await fetch("/api/error-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ errors: batch }),
          keepalive: true,
        });
      } catch {
        // Silently fail — error logging must never break the app
      }
    };

    // ── 1. Catch uncaught errors ──
    const handleError = (event: ErrorEvent) => {
      pushError({
        type: "error",
        message: event.message || "Unknown error",
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      });
    };

    // ── 2. Catch unhandled promise rejections ──
    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      pushError({
        type: "unhandledrejection",
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      });
    };

    // ── 3. Wrap console.error ──
    const originalConsoleError = console.error;
    const wrappedConsoleError = (...args: unknown[]) => {
      originalConsoleError.apply(console, args);
      const message = args
        .map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === "string" ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })()))
        .join(" ");
      pushError({
        type: "console.error",
        message,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      });
    };
    console.error = wrappedConsoleError;

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    // ── Flush timer ──
    flushTimerRef.current = setInterval(flush, FLUSH_INTERVAL);

    // ── Flush on page unload ──
    const handleUnload = () => {
      if (bufferRef.current.length > 0) {
        const batch = bufferRef.current.splice(0);
        const body = JSON.stringify({ errors: batch });
        try {
          // sendBeacon works even during page unload
          navigator.sendBeacon("/api/error-logs", new Blob([body], { type: "application/json" }));
        } catch {
          // Silently fail
        }
      }
    };
    window.addEventListener("pagehide", handleUnload);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
      window.removeEventListener("pagehide", handleUnload);
      console.error = originalConsoleError;
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
      flush();
      (window as unknown as { __errorCatcherMounted?: boolean }).__errorCatcherMounted = false;
    };
  }, []);

  return null;
}
