"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Smartphone, Monitor } from "lucide-react";
import { PERSONAS } from "@/lib/mobile-nav";

/**
 * ═══════════════════════════════════════════════════════════════════
 * RESPONSIVE SURFACE REDIRECTOR
 *
 * The app has two distinct UI surfaces on two route trees:
 *   · desktop  →  /, /materials, /gl, …           (AppShell, rail+panel)
 *   · mobile   →  /m, /m/site, /m/books, …        (MobileShell, tab bar)
 *
 * Initial-load routing is handled server-side: `middleware.ts` redirects
 * a mobile User-Agent at `/` to `/m`, and the sign-in page checks
 * `matchMedia` once after login. Neither of those responds to the
 * viewport *changing* after load — resizing a window narrow, or rotating
 * a tablet, left you stuck on the wrong surface.
 *
 * This component closes that gap. It watches `matchMedia("(max-width:
 * 1023px)")` and, on a surface mismatch, does one of two things:
 *
 *   1. HOME ROUTE (/ or a persona home like /m/site) → auto-redirect to
 *      the correct surface. No context is lost at a home/list root, so
 *      the swap is safe and instant.
 *   2. DEEP ROUTE (a form, a detail drawer, a ledger drill-down) → do
 *      NOT yank the user away. Show a single non-blocking toast offering
 *      to switch. Respecting in-progress work is the whole point — an
 *      ERP user mid-entry who gets redirected loses data and trust.
 *
 * It honours the existing `nirman-desktop=1` cookie (the "View desktop
 * site" escape hatch from the mobile More tab): if set, mobile is never
 * forced, so a phone user who explicitly chose desktop stays there.
 *
 * Resize events are debounced (250ms) so a drag doesn't fire a storm of
 * evaluations. The toast fires at most once per (mismatch-state, route)
 * pair, so repeated resize drags on the same deep page don't spam.
 * ═══════════════════════════════════════════════════════════════════
 */

const MOBILE_BREAKPOINT = "(max-width: 1023px)";
const DESKTOP_HOME = "/";

/** Routes where auto-redirect is safe — home/list roots only. */
const MOBILE_HOMES = new Set<string>([
  "/m",
  ...Object.values(PERSONAS).map((p) => p.home),
]);

function isMobileSurface(pathname: string): boolean {
  return pathname === "/m" || pathname.startsWith("/m/");
}

function isHomeRoute(pathname: string): boolean {
  if (pathname === DESKTOP_HOME) return true;
  return MOBILE_HOMES.has(pathname);
}

function hasDesktopOverride(): boolean {
  if (typeof document === "undefined") return false;
  return /(?:^|; )nirman-desktop=1/.test(document.cookie);
}

export function ResponsiveSurfaceRedirector() {
  const pathname = usePathname();
  const router = useRouter();
  // The last (mismatch, route) key we prompted for — prevents re-toasting
  // on every resize tick while the user stays on the same deep page.
  const lastPromptKey = useRef<string>("");

  useEffect(() => {
    // Bare routes (sign-in, print) must not run surface logic — same
    // exclusion as AppShell, kept here so this component is self-contained.
    if (
      pathname === "/sign-in" ||
      pathname.startsWith("/sign-in/") ||
      pathname === "/print" ||
      pathname.startsWith("/print/")
    ) {
      return;
    }

    const mql = window.matchMedia(MOBILE_BREAKPOINT);
    let timer: ReturnType<typeof setTimeout> | undefined;

    function evaluate() {
      const wantMobile = !hasDesktopOverride() && mql.matches;
      const onMobile = isMobileSurface(pathname);
      if (wantMobile === onMobile) {
        lastPromptKey.current = "";
        return;
      }

      // Safe to swap instantly at home/list roots — nothing in progress.
      if (isHomeRoute(pathname)) {
        router.replace(wantMobile ? "/m" : DESKTOP_HOME);
        return;
      }

      // Deep route: never auto-redirect. Prompt once per mismatch+route.
      const key = `${wantMobile ? "m" : "d"}:${pathname}`;
      if (lastPromptKey.current === key) return;
      lastPromptKey.current = key;

      const target = wantMobile ? "/m" : DESKTOP_HOME;
      const surfaceLabel = wantMobile ? "mobile" : "desktop";
      const Icon = wantMobile ? Smartphone : Monitor;
      toast(`Switch to the ${surfaceLabel} view?`, {
        description: `You're on a ${mql.matches ? "narrow" : "wide"} screen.`,
        icon: <Icon className="h-4 w-4" />,
        duration: 8000,
        action: {
          label: `Use ${surfaceLabel}`,
          onClick: () => router.push(target),
        },
      });
    }

    function onChange() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(evaluate, 250);
    }

    // Evaluate on mount and whenever the route changes.
    evaluate();
    mql.addEventListener("change", onChange);
    return () => {
      mql.removeEventListener("change", onChange);
      if (timer) clearTimeout(timer);
    };
  }, [pathname, router]);

  return null;
}
