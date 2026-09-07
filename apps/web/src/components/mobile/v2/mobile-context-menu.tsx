"use client";

import { useEffect, type ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";

/**
 * MobileContextMenu — bottom sheet with a list of actions.
 *
 * Opens via long-press on a list item. Slides up from the bottom with a
 * backdrop. Tapping an action fires its callback and closes the sheet.
 * Tapping the backdrop or "Cancel" closes without action.
 */

export interface ContextAction {
  label: string;
  icon?: LucideIcon;
  color?: string; // overrides default ink color
  onPress: () => void;
  destructive?: boolean;
}

export function MobileContextMenu({
  open,
  onClose,
  title,
  subtitle,
  actions,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  actions: ContextAction[];
  children?: ReactNode; // optional extra content above actions (e.g. preview)
}) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[70]"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.4)" }}
        onClick={onClose}
      />

      {/* Bottom sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-[71] rounded-t-[1rem] overflow-hidden"
        style={{
          backgroundColor: "var(--color-paper)",
          paddingBottom: "env(safe-area-inset-bottom)",
          animation: "slideUp 0.2s ease-out",
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div
            className="w-9 h-1 rounded-full"
            style={{ backgroundColor: "var(--color-line)" }}
          />
        </div>

        {/* Title + subtitle */}
        <div className="px-4 pb-2 border-b" style={{ borderColor: "var(--color-line)" }}>
          <p className="text-m-section font-bold truncate" style={{ color: "var(--color-ink-950)" }}>
            {title}
          </p>
          {subtitle ? (
            <p className="text-m-label mt-0.5 truncate" style={{ color: "var(--color-ink-400)" }}>
              {subtitle}
            </p>
          ) : null}
        </div>

        {/* Optional children (preview content) */}
        {children ? <div className="px-2 py-2">{children}</div> : null}

        {/* Actions */}
        <div className="py-1">
          {actions.map((action, i) => {
            const Icon = action.icon;
            return (
              <button
                key={i}
                onClick={() => {
                  action.onPress();
                  onClose();
                }}
                className="text-m-body press w-full flex items-center gap-3 px-4 py-3 text-left"
              >
                {Icon ? (
                  <Icon
                    className="size-4 shrink-0"
                    style={{ color: action.destructive ? "var(--color-stop)" : (action.color ?? "var(--color-ink-700)") }}
                  />
                ) : null}
                <span
                  className="text-m-section font-medium"
                  style={{ color: action.destructive ? "var(--color-stop)" : (action.color ?? "var(--color-ink-950)") }}
                >
                  {action.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Cancel */}
        <div className="border-t" style={{ borderColor: "var(--color-line)" }}>
          <button
            onClick={onClose}
            className="text-m-body press w-full flex items-center justify-center gap-1.5 px-4 py-3.5"
          >
            <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
            <span className="text-m-section font-semibold" style={{ color: "var(--color-ink-500)" }}>
              Cancel
            </span>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
