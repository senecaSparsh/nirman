"use client";

import { Coins } from "lucide-react";
import { useCurrencyMode } from "@/components/currency-provider";
import { cn } from "@/lib/utils";

/**
 * Currency precision toggle — switches between compact (₹1.2L) and
 * detailed (₹1,23,456.78) modes. Persists to localStorage via the
 * CurrencyProvider. Shows a small "L" or "₹" indicator.
 */
export function CurrencyToggle({ tone = "default" }: { tone?: "default" | "surface" }) {
  const { mode, toggle } = useCurrencyMode();
  const isCompact = mode === "compact";

  return (
    <button
      onClick={toggle}
      title={isCompact ? "Compact mode (₹1.2L). Click for detailed (₹1,23,456.78)" : "Detailed mode (₹1,23,456.78). Click for compact (₹1.2L)"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-caption font-medium transition-colors",
        tone === "surface"
          ? "text-muted-foreground hover:bg-elevated hover:text-foreground"
          : "text-muted-foreground hover:bg-subtle hover:text-foreground",
      )}
    >
      <Coins className="size-3.5" />
      <span className="tnum">{isCompact ? "₹1.2L" : "₹1,234"}</span>
    </button>
  );
}
