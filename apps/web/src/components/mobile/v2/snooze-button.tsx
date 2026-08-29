"use client";

import { useState } from "react";
import { BellOff, Clock, CalendarDays } from "lucide-react";
import { useSnooze, type SnoozeDuration } from "@/lib/use-snooze";
import { haptic } from "@/lib/haptic";

/**
 * SnoozeButton — a compact button that opens a small popover with snooze
 * duration options. Used on attention banner items and approval queue items.
 */
export function SnoozeButton({
  itemId,
  label,
  size = "sm",
}: {
  itemId: string;
  label: string;
  size?: "sm" | "md";
}) {
  const { snooze, isSnoozed, unsnooze } = useSnooze();
  const [open, setOpen] = useState(false);
  const snoozed = isSnoozed(itemId);

  if (snoozed) {
    return (
      <button
        onClick={() => {
          haptic(10);
          unsnooze(itemId);
        }}
        className={`flex items-center gap-1 rounded-[0.375rem] font-semibold press ${size === "sm" ? "px-2 py-1 text-[0.5625rem]" : "px-3 py-1.5 text-[0.6875rem]"}`}
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-ink-300) 12%, transparent)",
          color: "var(--color-ink-500)",
        }}
      >
        <BellOff className={size === "sm" ? "size-2.5" : "size-3"} />
        Snoozed
      </button>
    );
  }

  const options: { duration: SnoozeDuration; label: string; icon: typeof Clock }[] = [
    { duration: "4h", label: "4 hours", icon: Clock },
    { duration: "24h", label: "24 hours", icon: Clock },
    { duration: "monday", label: "Until Monday", icon: CalendarDays },
  ];

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          haptic(10);
          setOpen(!open);
        }}
        className={`flex items-center gap-1 rounded-[0.375rem] font-semibold press ${size === "sm" ? "px-2 py-1 text-[0.5625rem]" : "px-3 py-1.5 text-[0.6875rem]"}`}
        style={{
          backgroundColor: "var(--color-concrete)",
          color: "var(--color-ink-700)",
        }}
      >
        <BellOff className={size === "sm" ? "size-2.5" : "size-3"} />
        Snooze
      </button>

      {open ? (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[60]"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          />
          {/* Popover */}
          <div
            className="absolute right-0 top-full mt-1 z-[61] rounded-[0.5rem] border overflow-hidden min-w-[140px] shadow-lg"
            style={{
              borderColor: "var(--color-line)",
              backgroundColor: "var(--color-paper)",
            }}
          >
            {options.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.duration}
                  onClick={(e) => {
                    e.stopPropagation();
                    haptic(10);
                    snooze(itemId, opt.duration, label);
                    setOpen(false);
                  }}
                  className="press w-full flex items-center gap-2 px-3 py-2 text-left"
                >
                  <Icon className="size-3 shrink-0" style={{ color: "var(--color-ink-500)" }} />
                  <span className="text-[0.6875rem] font-medium" style={{ color: "var(--color-ink-950)" }}>
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
