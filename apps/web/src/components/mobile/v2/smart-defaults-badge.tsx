"use client";

import { Sparkles, X } from "lucide-react";
import { useState } from "react";

/**
 * SmartDefaultsBadge — a small dismissible hint that shows when form fields
 * have been pre-filled from last-used values.
 */
export function SmartDefaultsBadge({ onDismiss }: { onDismiss?: () => void }) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;
  return (
    <div
      className="flex items-center gap-1.5 rounded-[0.375rem] px-2 py-1 text-[0.5625rem] font-medium"
      style={{
        backgroundColor: "color-mix(in srgb, var(--color-steel) 8%, transparent)",
        color: "var(--color-steel)",
      }}
    >
      <Sparkles className="size-2.5" />
      Pre-filled from last time
      <button
        onClick={() => {
          setVisible(false);
          onDismiss?.();
        }}
        className="ml-0.5 press"
        aria-label="Dismiss"
      >
        <X className="size-2.5" />
      </button>
    </div>
  );
}
