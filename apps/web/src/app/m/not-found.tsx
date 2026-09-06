import Link from "next/link";
import { Compass } from "lucide-react";

/**
 * Mobile 404 — matches the warm palette of the /m surface.
 * Uses inline styles consistent with v2 mobile primitives.
 */
export default function MobileNotFound() {
  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center"
    >
      <div
        className="flex size-12 items-center justify-center rounded-[0.625rem]"
        style={{
          backgroundColor: "var(--color-paper)",
          border: "1px solid var(--color-line)",
          color: "var(--color-ink-400)",
        }}
      >
        <Compass className="size-5" />
      </div>
      <div className="space-y-1.5">
        <h2
          className="text-m-section font-extrabold tracking-tight"
          style={{ color: "var(--color-ink-950)" }}
        >
          Page not found
        </h2>
        <p
          className="mx-auto max-w-xs text-m-body leading-relaxed"
          style={{ color: "var(--color-ink-500)" }}
        >
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
      </div>
      <Link
        href="/m"
        className="touch-lg rounded-[0.625rem] border-2 px-5 py-2.5 text-m-body font-bold press"
        style={{
          borderColor: "var(--color-ink-950)",
          color: "var(--color-ink-950)",
        }}
      >
        Back to Home
      </Link>
    </div>
  );
}
