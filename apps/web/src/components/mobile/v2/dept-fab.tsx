"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { LayoutGrid, Plus } from "lucide-react";
import { breadcrumbs, type RouteEntry } from "@/lib/route-manifest";

/* ═══════════════════════════════════════════════════════════════════════════
   DEPT FAB — centre button in the bottom nav that fans out the departments
   the user's tab bar couldn't fit.

   - Raised 56px circle straddling the bar's top edge (half in, half out).
   - Tap → chips fan in an upward arc, staggered, collapsing back into the
     FAB on close (symmetric path — they return where they came from).
   - Items are permission-filtered upstream by deptFanFor(); a department the
     user can't open never renders. A trailing "All" chip opens the NavSheet
     (the deep tree), so this fan is its fast front door rather than a sixth
     nav surface.
   - The scrim sits BELOW the nav bar (z-20 < nav z-30): the page dims but
     the bar stays lit and tappable — tapping a tab closes the fan via the
     pathname change.
   - Scrim + chips portal to <body>: the nav's backdrop-filter would make it
     the containing block for `position: fixed` descendants and trap them
     inside the bar.
   ═══════════════════════════════════════════════════════════════════════════ */

interface DeptFabProps {
  /** Department roots the user can open that aren't already tabs. */
  items: RouteEntry[];
  /** Live badge counts keyed by route path (same map the tab bar uses). */
  badges: Record<string, number>;
  /** Opens the full NavSheet ("All" chip). */
  onOpenAll: () => void;
}

/** Max chips in the arc including "All" — past this a fan stops being a fan. */
const MAX_CHIPS = 8;

const CHIP_SPRING = "cubic-bezier(0.34, 1.4, 0.64, 1)";

export function DeptFab({ items, badges, onOpenAll }: DeptFabProps) {
  const pathname = usePathname();
  const fabRef = React.useRef<HTMLButtonElement>(null);
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [center, setCenter] = React.useState({ x: 0, y: 0 });
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = React.useCallback(() => {
    setOpen(false);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setMounted(false), 260);
  }, []);

  const openFan = () => {
    const r = fabRef.current?.getBoundingClientRect();
    if (r) setCenter({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    setMounted(true);
    // Double rAF: let the closed state paint before transitioning to open.
    requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)));
  };

  // Route change closes the fan — covers tab taps (scrim is below the bar)
  // and chip navigations alike.
  React.useEffect(() => {
    close();
  }, [pathname, close]);

  React.useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, close]);

  React.useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  // Highlight the chip for the department the current page lives under —
  // walked via the manifest's parent chain so detail pages light their dept.
  const activeDept = React.useMemo(() => {
    const chain = new Set(breadcrumbs(pathname).map((b) => b.path));
    return items.find((i) => chain.has(i.path))?.path;
  }, [pathname, items]);

  // Fan geometry — a true semicircle blooming AROUND the FAB: every chip sits
  // on one circle, evenly spaced and symmetric about the vertical axis. The
  // circle's centre is lifted LIFT px above the FAB so the end chips (nearest
  // horizontal) still clear the tab bar and the corner FABs. Radius grows
  // with count so adjacent chips keep ~45px+ of arc between them.
  const shown = items.slice(0, MAX_CHIPS - 1);
  const chipCount = shown.length + 1; // + "All"
  const LIFT = 44;
  const spread = Math.min(140, (chipCount - 1) * 26); // degrees
  const radius = chipCount >= 7 ? 130 : chipCount === 6 ? 118 : 112;
  const angleFor = (i: number) =>
    chipCount === 1 ? 90 : 90 + spread / 2 - (i * spread) / (chipCount - 1);

  const chips: { route?: RouteEntry; all?: boolean }[] = [
    ...shown.map((route) => ({ route })),
    { all: true },
  ];

  return (
    <>
      {/* Gap in the tab row so tabs never slide under the FAB */}
      <div className="w-14 shrink-0" aria-hidden />

      <button
        ref={fabRef}
        type="button"
        data-tour="dept-fab"
        onClick={open ? close : openFan}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={open ? "Close departments" : "More departments"}
        className="press absolute left-1/2 top-0 z-10 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full"
        style={{
          backgroundColor: "var(--color-signal)",
          color: "var(--color-ink-950)",
          boxShadow:
            "0 6px 18px rgba(0, 0, 0, 0.28), 0 0 0 1px var(--color-line)",
        }}
      >
        <Plus
          className="size-6 transition-transform duration-200"
          style={{ transform: open ? "rotate(135deg)" : "none" }}
        />
      </button>

      {mounted &&
        createPortal(
          <>
            {/* Scrim — below the nav bar so the bar (and FAB) stays lit */}
            <div
              className="fixed inset-0 z-20"
              onClick={close}
              aria-hidden
              style={{
                backgroundColor: "rgba(0, 0, 0, 0.42)",
                opacity: open ? 1 : 0,
                transition: "opacity 160ms ease-out",
              }}
            />
            {/* Chip layer — above the nav bar, clicks pass through the gaps */}
            <div className="pointer-events-none fixed inset-0 z-40">
              {chips.map((chip, i) => {
                const angle = (angleFor(i) * Math.PI) / 180;
                const x = Math.cos(angle) * radius;
                const y = -Math.sin(angle) * radius - LIFT;
                const delay = open ? i * 35 : (chipCount - 1 - i) * 22;
                const label = chip.all
                  ? "All"
                  : chip.route!.path === "/m/settings"
                    ? "Settings" // titled "More" in the manifest — ambiguous beside "All"
                    : (chip.route!.shortTitle ?? chip.route!.title);
                const Icon = chip.all ? LayoutGrid : chip.route!.icon;
                const badge = chip.route ? badges[chip.route.path] : undefined;
                const isActive = chip.route?.path === activeDept;

                const inner = (
                  <>
                    <span
                      className="relative grid size-11 place-items-center rounded-full"
                      style={{
                        backgroundColor: "var(--color-paper)",
                        border: "1px solid var(--color-line)",
                        boxShadow: isActive
                          ? "0 4px 12px rgba(0,0,0,0.22), 0 0 0 2px var(--color-signal)"
                          : "0 4px 12px rgba(0,0,0,0.22)",
                      }}
                    >
                      <Icon
                        className="size-[18px]"
                        style={{ color: "var(--color-ink-950)" }}
                      />
                      {badge != null && badge > 0 ? (
                        <span
                          className="badge-pulse absolute -top-1.5 -right-2 min-w-[1rem] h-4 rounded-full px-1 text-m-caption font-bold grid place-items-center tabular-nums"
                          style={{
                            backgroundColor: "var(--color-signal)",
                            color: "var(--color-ink-950)",
                          }}
                        >
                          {badge > 9 ? "9+" : badge}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-m-caption font-semibold whitespace-nowrap"
                      style={{
                        backgroundColor: "var(--color-paper)",
                        border: "1px solid var(--color-line)",
                        color: "var(--color-ink-950)",
                        // Nudge toward the dome's axis — on the descending
                        // half a centered pill clips the next chip's circle.
                        transform: `translateX(${(-(x / radius) * 12).toFixed(1)}px)`,
                      }}
                    >
                      {label}
                    </span>
                  </>
                );

                const style: React.CSSProperties = {
                  left: center.x,
                  top: center.y,
                  // The "All" chip sits lowest on the arc's right end — paint
                  // it beneath dept chips so their label pills aren't clipped.
                  zIndex: chip.all ? 0 : 1,
                  transform: open
                    ? `translate(-50%, -50%) translate(${x}px, ${y}px) scale(1)`
                    : "translate(-50%, -50%) scale(0.6)",
                  opacity: open ? 1 : 0,
                  transition: `transform 280ms ${CHIP_SPRING} ${delay}ms, opacity 180ms ease-out ${delay}ms`,
                  pointerEvents: open ? "auto" : "none",
                };
                const cls =
                  "dept-fan-chip press fixed flex flex-col items-center gap-1";

                return chip.all ? (
                  <button
                    key="all"
                    type="button"
                    onClick={() => {
                      close();
                      onOpenAll();
                    }}
                    className={cls}
                    style={style}
                    aria-label="All pages"
                  >
                    {inner}
                  </button>
                ) : (
                  <Link
                    key={chip.route!.path}
                    href={chip.route!.path}
                    prefetch
                    onClick={close}
                    className={cls}
                    style={style}
                  >
                    {inner}
                  </Link>
                );
              })}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
