"use client";

import { AlertCircle, RotateCw, Home } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * MobileErrorBoundary — friendly error UI for module-level error.tsx files.
 * Keeps the tab bar + header functional, offers "Try Again" + "Go Home".
 */
export default function MobileErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  // Log to console for debugging (can be replaced with a real logger)
  console.error("[MobileErrorBoundary]", error);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div
        className="grid place-items-center size-14 rounded-full mb-4"
        style={{ backgroundColor: "color-mix(in srgb, var(--color-stop) 12%, transparent)" }}
      >
        <AlertCircle className="size-7" style={{ color: "var(--color-stop)" }} />
      </div>
      <h2 className="text-m-section font-bold mb-1.5" style={{ color: "var(--color-ink-950)" }}>
        Something went wrong
      </h2>
      <p className="text-m-body mb-1" style={{ color: "var(--color-ink-500)" }}>
        {error.message || "An unexpected error occurred."}
      </p>
      {error.digest ? (
        <p className="text-m-caption font-mono mb-4" style={{ color: "var(--color-ink-300)" }}>
          {error.digest}
        </p>
      ) : (
        <div className="mb-4" />
      )}
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="flex items-center gap-1.5 rounded-[0.5rem] px-4 py-2 text-m-body font-bold text-m-body press"
          style={{ backgroundColor: "var(--color-ink-950)", color: "var(--color-paper)" }}
        >
          <RotateCw className="size-3.5" />
          Try Again
        </button>
        <button
          onClick={() => router.push("/m/home")}
          className="flex items-center gap-1.5 rounded-[0.5rem] px-4 py-2 text-m-body font-bold border text-m-body press"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)", color: "var(--color-ink-950)" }}
        >
          <Home className="size-3.5" />
          Go Home
        </button>
      </div>
    </div>
  );
}
