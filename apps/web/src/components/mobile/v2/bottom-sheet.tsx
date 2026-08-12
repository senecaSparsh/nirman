"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/**
 * Mobile bottom sheet modal — slides up from the bottom of the screen.
 * Used for forms, pickers, and quick actions on mobile pages.
 */
export function BottomSheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        className="relative w-full max-w-md rounded-t-[0.75rem] border-t max-h-[85vh] overflow-y-auto"
        style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
      >
        {/* Drag handle + header */}
        <div className="sticky top-0 z-10 pt-2 pb-1" style={{ backgroundColor: "var(--color-paper)" }}>
          <div className="w-8 h-0.5 rounded-full mx-auto mb-2" style={{ backgroundColor: "var(--color-ink-300)" }} />
          <div className="flex items-center justify-between px-3 pb-2 border-b" style={{ borderColor: "var(--color-line)" }}>
            <p className="text-[0.75rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
              {title}
            </p>
            <button onClick={onClose} className="press" aria-label="Close">
              <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
            </button>
          </div>
        </div>
        <div className="p-3">
          {children}
        </div>
      </div>
    </div>
  );
}
