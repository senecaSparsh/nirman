"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * MobileModalSheet — the a11y shell for custom bottom sheets.
 *
 * Replaces the hand-rolled `fixed inset-0` overlay+panel pattern: callers
 * keep their own inner layout (headers, drag handles, scroll areas) while
 * this carries the modal contract — `role="dialog"`, `aria-modal`, focus
 * entry on open, index-walking Tab trap, Escape close, backdrop close,
 * body scroll lock, and focus restore to the trigger on close. The same
 * focus contract as Dialog and MobileFabModal.
 *
 * `open` renders/unmounts (no exit animation — callers' sheets are
 * instant-present). If your sheet needs the spring-from-FAB animation
 * path, use MobileFabModal instead.
 */
export function MobileModalSheet({
  open,
  onClose,
  label,
  children,
  className,
  style,
  contentStyle,
  zIndex = 50,
  align = "bottom",
}: {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the sheet — a short title. */
  label: string;
  children: React.ReactNode;
  /** Extra classes for the sheet panel (caller controls radius/width). */
  className?: string;
  /** Inline styles for the sheet panel. */
  style?: CSSProperties;
  /** Inline styles for the backdrop (custom dim color). */
  contentStyle?: CSSProperties;
  /** Stacking order — use 60 for sheets nested inside other modals. */
  zIndex?: number;
  /** "bottom" (default, items-end), "center" for alert-style panels,
   *  "full" for full-screen takeovers (panel fills the viewport). */
  align?: "bottom" | "center" | "full";
}) {
  const [panelEl, setPanelEl] = useState<HTMLElement | null>(null);
  const prevFocusRef = useRef<Element | null>(null);
  // Inline onClose handlers change identity every render — a ref keeps the
  // focus-lifecycle effect stable so cleanup only runs on open→close.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    prevFocusRef.current = document.activeElement;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      if (e.key === "Tab" && panelEl) {
        const focusable = [...panelEl.querySelectorAll<HTMLElement>(
          'a[href], button, input, select, textarea, [tabindex]',
        )].filter(
          (el) => !el.hasAttribute("disabled") && el.tabIndex >= 0 && el.offsetParent !== null,
        );
        if (focusable.length === 0) return;
        e.preventDefault();
        const idx = focusable.indexOf(document.activeElement as HTMLElement);
        const next =
          idx === -1
            ? 0
            : e.shiftKey
              ? (idx - 1 + focusable.length) % focusable.length
              : (idx + 1) % focusable.length;
        focusable[next]!.focus();
      }
    };
    window.addEventListener("keydown", handler);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prevOverflow;
      if (prevFocusRef.current instanceof HTMLElement) prevFocusRef.current.focus();
    };
    // panelEl arrives via ref callback after mount — re-run once it lands.
  }, [open, panelEl]);

  if (!open) return null;

  return createPortal(
    <div
      className={`fixed inset-0 flex justify-center ${align === "center" ? "items-center p-4" : align === "full" ? "" : "items-end"}`}
      style={{ backgroundColor: align === "full" ? "var(--color-paper)" : "rgba(0, 0, 0, 0.5)", zIndex, ...contentStyle }}
      onClick={onClose}
    >
      <div
        ref={(el) => {
          setPanelEl(el);
          if (el) el.focus();
        }}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`w-full outline-none ${align === "full" ? "h-full flex flex-col" : "max-w-md"} ${className ?? ""}`}
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Mobile bottom sheet modal — slides up from the bottom of the screen.
 * Used for forms, pickers, and quick actions on mobile pages.
 * Focus semantics (trap / Escape / restore / scroll lock) come from
 * MobileModalSheet — this component is the styled header+body layout.
 */
export function BottomSheet({
  open = true,
  title,
  children,
  onClose,
}: {
  /** Defaults true for legacy call sites that mount conditionally. */
  open?: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <MobileModalSheet
      open={open}
      onClose={onClose}
      label={title}
      className="relative rounded-t-[1rem] border-t max-h-[85vh] overflow-y-auto"
      style={{ backgroundColor: "var(--color-paper)", borderColor: "var(--color-line)" }}
      contentStyle={{ backgroundColor: "rgba(0, 0, 0, 0.4)" }}
    >
      {/* Drag handle + header */}
      <div className="sticky top-0 z-10 pt-2 pb-1" style={{ backgroundColor: "var(--color-paper)" }}>
        <div className="w-8 h-0.5 rounded-full mx-auto mb-2" style={{ backgroundColor: "var(--color-ink-300)" }} />
        <div className="flex items-center justify-between px-3 pb-2 border-b" style={{ borderColor: "var(--color-line)" }}>
          <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
            {title}
          </p>
          <button onClick={onClose} className="text-m-body press" aria-label="Close">
            <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
          </button>
        </div>
      </div>
      <div className="p-3">
        {children}
      </div>
    </MobileModalSheet>
  );
}
