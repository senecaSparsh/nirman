"use client";

import { useEffect, useState, type ReactNode } from "react";
import { X, Loader2, type LucideIcon } from "lucide-react";
import { type ContextAction } from "@/components/mobile/v2/mobile-context-menu";

/**
 * ═══════════════════════════════════════════════════════════════════
 * MobileOverviewSheet — a centered popup that springs up on long-press
 * to show a quick, read-only overview of a list item's key details,
 * plus optional quick actions (View Details, Share, etc.).
 *
 * Reusable across any /m/* list page (equipment, vehicles, materials,
 * POs, suppliers, …). The caller controls what rows to show and what
 * actions to offer, so this component stays generic.
 *
 * Apple-style presentation (same feel as MobileFabModal):
 *  · Backdrop blurs + dims the background (material depth).
 *  · The popup scales up from the long-press point —
 *    `transform-origin` is anchored to where the user pressed, so the
 *    spatial relationship between the press and the content is obvious.
 *  · Critically-damped spring feel via cubic-bezier(0.32, 0.72, 0, 1)
 *    — fast in, graceful settle, no overshoot (damping ≈ 1.0).
 *  · The backdrop blur radius animates in tandem with scale, so the
 *    surface reads as a real material arriving, not a plain fade.
 *  · Reduced-motion: cross-fade only, no scale/blur animation.
 *  · Enter/exit animation: scales back down into the press point on
 *    close — symmetric paths, as Apple's principle requires.
 *
 * Usage:
 *   const [overviewOpen, setOverviewOpen] = useState(false);
 *   const [pressPoint, setPressPoint] = useState<{x: number; y: number} | null>(null);
 *   const { bind } = useLongPress((x, y) => {
 *     setPressPoint({ x, y });
 *     setOverviewOpen(true);
 *   });
 *   <MobileOverviewSheet
 *     open={overviewOpen}
 *     onClose={() => setOverviewOpen(false)}
 *     origin={pressPoint}
 *     title="EX-001 Cement Mixer"
 *     subtitle="Heavy Machinery"
 *     accentColor="var(--color-go)"
 *     rows={[...]}
 *     actions={[...]}
 *   />
 * ═══════════════════════════════════════════════════════════════════
 */

export interface OverviewRow {
  icon?: LucideIcon;
  label: string;
  value: ReactNode;
  mono?: boolean;
  valueColor?: string;
}

export function MobileOverviewSheet({
  open,
  onClose,
  origin,
  title,
  subtitle,
  accentColor,
  loading = false,
  rows,
  actions = [],
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** The {x, y} screen coordinates of the long-press, used to anchor
   *  the scale animation's transform-origin. Falls back to center. */
  origin?: { x: number; y: number } | null;
  title: string;
  subtitle?: string;
  accentColor?: string;
  loading?: boolean;
  rows: OverviewRow[];
  actions?: ContextAction[];
  children?: ReactNode;
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

  // Close on Escape + lock body scroll while open
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted) return null;

  // Compute transform-origin from the press point.
  // The popup grows outward from exactly where the user pressed.
  const originX = origin ? `${origin.x}px` : "50vw";
  const originY = origin ? `${origin.y}px` : "50vh";

  // ── Reduced motion: plain cross-fade, no scale or blur ──
  if (prefersReducedMotion) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
        style={{
          backgroundColor: visible
            ? "rgba(0, 0, 0, 0.45)"
            : "transparent",
          transition: "background-color 0.2s ease",
        }}
      >
        <OverviewPanel
          title={title}
          subtitle={subtitle}
          accentColor={accentColor}
          loading={loading}
          rows={rows}
          actions={actions}
          onClose={onClose}
          visible={visible}
          reducedMotion
        >
          {children}
        </OverviewPanel>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      style={{
        // Backdrop: dim + blur that animates in with the popup
        backgroundColor: visible
          ? "rgba(0, 0, 0, 0.45)"
          : "rgba(0, 0, 0, 0)",
        backdropFilter: visible ? "blur(8px)" : "blur(0px)",
        WebkitBackdropFilter: visible ? "blur(8px)" : "blur(0px)",
        transition:
          "background-color 0.3s cubic-bezier(0.32, 0.72, 0, 1), backdrop-filter 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
      }}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md">
        <OverviewPanel
          title={title}
          subtitle={subtitle}
          accentColor={accentColor}
          loading={loading}
          rows={rows}
          actions={actions}
          onClose={onClose}
          visible={visible}
          originX={originX}
          originY={originY}
        >
          {children}
        </OverviewPanel>
      </div>
    </div>
  );
}

/* ─── The actual panel content — split out so both motion paths share it ─── */
function OverviewPanel({
  title,
  subtitle,
  accentColor,
  loading,
  rows,
  actions,
  onClose,
  visible,
  originX,
  originY,
  reducedMotion = false,
  children,
}: {
  title: string;
  subtitle?: string;
  accentColor?: string;
  loading: boolean;
  rows: OverviewRow[];
  actions: ContextAction[];
  onClose: () => void;
  visible: boolean;
  originX?: string;
  originY?: string;
  reducedMotion?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className="relative w-full max-h-[85vh] overflow-y-auto rounded-[1rem] flex flex-col"
      style={{
        backgroundColor: "var(--color-paper)",
        ...(reducedMotion
          ? {
              opacity: visible ? 1 : 0,
              transition: "opacity 0.2s ease",
              boxShadow: "0 20px 60px -10px rgba(0,0,0,0.3)",
            }
          : {
              // Scale from the press point — the popup "grows" out of the touch
              transformOrigin: `${originX} ${originY}`,
              transform: visible ? "scale(1)" : "scale(0.2)",
              opacity: visible ? 1 : 0,
              // Critically-damped spring: fast in, graceful settle, no overshoot
              transition:
                "transform 0.4s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.25s cubic-bezier(0.32, 0.72, 0, 1), box-shadow 0.4s cubic-bezier(0.32, 0.72, 0, 1)",
              boxShadow: visible
                ? "0 20px 60px -10px rgba(0,0,0,0.3), 0 8px 20px -4px rgba(0,0,0,0.15)"
                : "0 0 0 rgba(0,0,0,0)",
            }),
      }}
    >
      {/* Drag handle — visual affordance that this is a floating panel */}
      <div className="flex justify-center pt-2.5 pb-1 shrink-0">
        <div
          className="h-1 w-9 rounded-full"
          style={{ backgroundColor: "var(--color-concrete)" }}
        />
      </div>

      {/* Title + subtitle + accent strip */}
      <div
        className="px-4 pb-2 border-b shrink-0 relative"
        style={{ borderColor: "var(--color-line)" }}
      >
        {accentColor ? (
          <div
            className="absolute left-0 top-0 bottom-0 w-1"
            style={{ backgroundColor: accentColor }}
          />
        ) : null}
        <p
          className="text-m-section font-bold truncate pl-1"
          style={{ color: "var(--color-ink-950)" }}
        >
          {title}
        </p>
        {subtitle ? (
          <p
            className="text-m-label mt-0.5 truncate pl-1"
            style={{ color: "var(--color-ink-400)" }}
          >
            {subtitle}
          </p>
        ) : null}
      </div>

      {/* Scrollable body */}
      <div className="overflow-y-auto flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2
              className="size-5 animate-spin"
              style={{ color: "var(--color-ink-400)" }}
            />
          </div>
        ) : (
          <>
            {/* Detail rows */}
            {rows.length > 0 ? (
              <div className="px-3 py-2 flex flex-col">
                {rows.map((row, i) => {
                  const Icon = row.icon;
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2.5 py-2"
                      style={{
                        borderBottom:
                          i < rows.length - 1
                            ? "1px solid var(--color-line)"
                            : "none",
                      }}
                    >
                      {Icon ? (
                        <Icon
                          className="size-3.5 shrink-0"
                          style={{ color: "var(--color-ink-400)" }}
                        />
                      ) : (
                        <div className="size-3.5 shrink-0" />
                      )}
                      <span
                        className="text-m-body shrink-0"
                        style={{ color: "var(--color-ink-500)" }}
                      >
                        {row.label}
                      </span>
                      <span
                        className={`text-m-body font-semibold text-right truncate ml-auto ${
                          row.mono ? "font-mono" : ""
                        }`}
                        style={{
                          color: row.valueColor ?? "var(--color-ink-950)",
                        }}
                      >
                        {row.value}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {/* Optional extra content (e.g. assignment card, history preview) */}
            {children ? <div className="px-3 pb-2">{children}</div> : null}

            {/* Actions */}
            {actions.length > 0 ? (
              <div
                className="py-1 border-t"
                style={{ borderColor: "var(--color-line)" }}
              >
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
                          style={{
                            color: action.destructive
                              ? "var(--color-stop)"
                              : (action.color ?? "var(--color-ink-700)"),
                          }}
                        />
                      ) : null}
                      <span
                        className="text-m-section font-medium"
                        style={{
                          color: action.destructive
                            ? "var(--color-stop)"
                            : (action.color ?? "var(--color-ink-950)"),
                        }}
                      >
                        {action.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Close */}
      <div
        className="border-t shrink-0"
        style={{ borderColor: "var(--color-line)" }}
      >
        <button
          onClick={onClose}
          className="text-m-body press w-full flex items-center justify-center gap-1.5 px-4 py-3.5"
        >
          <X className="size-4" style={{ color: "var(--color-ink-500)" }} />
          <span
            className="text-m-section font-semibold"
            style={{ color: "var(--color-ink-500)" }}
          >
            Close
          </span>
        </button>
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
