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
      className="w-full flex items-center gap-2.5 rounded-[0.625rem] border p-2.5 press text-left"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <span
        className="shrink-0 grid place-items-center w-7 h-7 rounded-[0.375rem]"
        style={{ backgroundColor: "var(--color-concrete)" }}
      >
        <Coins className="size-3.5" style={{ color: "var(--color-ink-500)" }} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.6875rem] font-semibold leading-tight" style={{ color: "var(--color-ink-950)" }}>
          {isCompact ? "Compact amounts" : "Detailed amounts"}
        </p>
        <p className="text-[0.5rem] mt-0.5" style={{ color: "var(--color-ink-500)" }}>
          {isCompact ? "₹1.2L format" : "₹1,23,456.78 format"}
        </p>
      </div>
      <span
        className="shrink-0 text-[0.5rem] font-bold uppercase tracking-wide px-2 py-1 rounded-[0.375rem] tabular-nums"
        style={{
          backgroundColor: isCompact ? "var(--color-ink-950)" : "var(--color-concrete)",
          color: isCompact ? "#fff" : "var(--color-ink-500)",
        }}
      >
        {isCompact ? "₹1.2L" : "₹1,234"}
      </span>
    </button>
  );
}
