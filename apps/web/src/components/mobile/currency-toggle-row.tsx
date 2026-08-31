"use client";

import { Coins } from "lucide-react";
import { useCurrencyMode } from "@/components/currency-provider";

/**
 * CurrencyToggleRow — a settings-style row that toggles between compact
 * (₹1.2L) and detailed (₹1,23,456.78) currency display.
 *
 * Uses the shared CurrencyProvider context, so it stays in sync with the
 * desktop CurrencyToggle. Styled to sit next to ThemeToggleRow in the
 * mobile settings "App" section.
 */
export function CurrencyToggleRow() {
  const { mode, toggle } = useCurrencyMode();
  const isCompact = mode === "compact";

  return (
    <button
      type="button"
      onClick={toggle}
      className="w-full flex items-center gap-2.5 rounded-[0.625rem] border p-2.5 text-m-body press text-left"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <span
        className="shrink-0 grid place-items-center w-7 h-7 rounded-[0.375rem]"
        style={{ backgroundColor: "var(--color-concrete)" }}
      >
        <Coins className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-m-body font-semibold leading-tight" style={{ color: "var(--color-ink-950)" }}>
          Currency format
        </p>
        <p className="text-m-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>
          {isCompact ? "Compact: ₹1.2L, ₹3.5Cr" : "Full: ₹1,23,456.78"}
        </p>
      </div>
      <span
        className="shrink-0 text-m-caption font-bold uppercase tracking-wide px-2 py-1 rounded-[0.375rem] tabular-nums"
        style={{
          backgroundColor: isCompact ? "var(--color-ink-950)" : "var(--color-concrete)",
          color: isCompact ? "var(--color-paper)" : "var(--color-ink-500)",
        }}
      >
        {isCompact ? "₹1.2L" : "₹1,234"}
      </span>
    </button>
  );
}
