"use client";

import { RotateCcw, X } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";

/**
 * DraftBanner — compact single-line banner shown when a saved draft exists.
 * Parent controls visibility (typically `{hasDraft && !draftRestored && ...}`).
 * Restore loads the draft; Discard deletes it.
 */
export function DraftBanner({
  formName,
  updatedAt,
  onRestore,
  onDiscard,
}: {
  formName: string;
  updatedAt: string | null;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  const relativeTime = updatedAt ? formatRelativeTime(new Date(updatedAt)) : "earlier";

  return (
    <div
      className="flex items-center gap-2 rounded-[0.5rem] border px-2.5 py-1.5 mb-2"
      style={{
        borderColor: "var(--color-signal)",
        backgroundColor: "color-mix(in srgb, var(--color-signal) 6%, transparent)",
      }}
    >
      <span
        className="shrink-0 rounded-full px-1.5 py-px text-[0.375rem] font-bold uppercase tracking-wide"
        style={{ backgroundColor: "var(--color-signal-wash)", color: "var(--color-signal-dark)" }}
      >
        Draft
      </span>
      <p className="text-[0.5625rem] flex-1 min-w-0 truncate" style={{ color: "var(--color-ink-700)" }}>
        {formName} saved {relativeTime}
      </p>
      <button
        type="button"
        onClick={onRestore}
        className="shrink-0 flex items-center gap-1 rounded-[0.25rem] px-2 py-1 text-[0.5625rem] font-bold press"
        style={{ backgroundColor: "var(--color-ink-950)", color: "#fff" }}
      >
        <RotateCcw className="size-2.5" />
        Restore
      </button>
      <button
        type="button"
        onClick={onDiscard}
        className="shrink-0 grid place-items-center size-5 rounded-[0.25rem] press"
        style={{ color: "var(--color-ink-400)" }}
        aria-label="Discard draft"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}
