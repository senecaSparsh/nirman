"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * ═══════════════════════════════════════════════════════════════════
 * MobileFabModal — a centered modal that springs up from the FAB.
 *
 * Apple-style presentation:
 *  · Backdrop blurs + dims the background (material depth).
 *  · The dialog scales up from the FAB's on-screen position —
 *    `transform-origin` is anchored to the trigger, so the spatial
 *    relationship between the button and the content is obvious.
 *  · Critically-damped spring feel via cubic-bezier(0.32, 0.72, 0, 1)
 *    — fast in, graceful settle, no overshoot (damping ≈ 1.0).
 *  · The backdrop blur radius animates in tandem with scale, so the
 *    surface reads as a real material arriving, not a plain fade.
 *  · Reduced-motion: cross-fade only, no scale/blur animation.
 *
 * The FAB itself stays visible above the backdrop (z-60) with its
 * icon rotated 45° (Plus → ×). Clicking the × closes the modal,
 * which scales back down into the FAB — the reverse of the enter
 * path, as Apple's "symmetric paths" principle requires.
 * ═══════════════════════════════════════════════════════════════════
 */
export function MobileFabModal({
  open,
  onClose,
  originRect,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  /** The bounding rect of the FAB that triggered this modal.
   *  Used to anchor the scale animation's transform-origin. */
  originRect?: DOMRect | null;
  children: ReactNode;
  title?: string;
}) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  // Mount/unmount with enter/exit animation
  useEffect(() => {
    if (open) {
      setMounted(true);
      // Double rAF ensures the browser paints the initial (invisible)
      // state before we flip to visible — without this the transition
      // doesn't fire because the element never gets a "before" frame.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      // Wait for exit animation before unmounting
      const timer = setTimeout(() => setMounted(false), 320);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!mounted) return null;

  // Compute transform-origin from the FAB's position.
  // The dialog grows outward from exactly where the FAB sits.
  let originX = "calc(100vw - 2rem)";
  let originY = "calc(100vh - 6rem)";

  if (originRect) {
    originX = `${originRect.left + originRect.width / 2}px`;
    originY = `${originRect.top + originRect.height / 2}px`;
  }

  // Reduced motion: plain cross-fade, no scale or blur
  if (prefersReducedMotion) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
        style={{
          backgroundColor: visible
            ? "color-mix(in srgb, var(--color-ink-950) 45%, transparent)"
            : "transparent",
          transition: "background-color 0.2s ease",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-[1rem]"
          style={{
            backgroundColor: "var(--color-paper)",
            opacity: visible ? 1 : 0,
            transition: "opacity 0.2s ease",
            boxShadow: "0 20px 60px -10px rgba(0,0,0,0.3)",
          }}
        >
          {title ? (
            <div className="px-4 pt-4 pb-2">
              <h2 className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
                {title}
              </h2>
            </div>
          ) : null}
          <div className="px-4 pb-4 pt-1">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      style={{
        // Backdrop: dim + blur that animates in with the dialog
        backgroundColor: visible
          ? "color-mix(in srgb, var(--color-ink-950) 45%, transparent)"
          : "color-mix(in srgb, var(--color-ink-950) 0%, transparent)",
        backdropFilter: visible ? "blur(8px)" : "blur(0px)",
        WebkitBackdropFilter: visible ? "blur(8px)" : "blur(0px)",
        transition:
          "background-color 0.3s cubic-bezier(0.32, 0.72, 0, 1), backdrop-filter 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-[1rem]"
        style={{
          backgroundColor: "var(--color-paper)",
          // Scale from the FAB's position — the dialog "grows" out of the button
          transformOrigin: `${originX} ${originY}`,
          transform: visible ? "scale(1)" : "scale(0.2)",
          opacity: visible ? 1 : 0,
          // Critically-damped spring: fast in, graceful settle, no overshoot
          transition:
            "transform 0.4s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.25s cubic-bezier(0.32, 0.72, 0, 1), box-shadow 0.4s cubic-bezier(0.32, 0.72, 0, 1)",
          boxShadow: visible
            ? "0 20px 60px -10px rgba(0,0,0,0.3), 0 8px 20px -4px rgba(0,0,0,0.15)"
            : "0 0 0 rgba(0,0,0,0)",
        }}
      >
        {/* Drag handle — visual affordance that this is a floating panel */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div
            className="h-1 w-9 rounded-full"
            style={{ backgroundColor: "var(--color-concrete)" }}
          />
        </div>

        {/* Title bar */}
        {title ? (
          <div className="px-4 pb-2">
            <h2 className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
              {title}
            </h2>
          </div>
        ) : null}

        {/* Form content */}
        <div className="px-4 pb-4 pt-1">{children}</div>
      </div>
    </div>
  );
}

/** Hook: watch prefers-reduced-motion. */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}
