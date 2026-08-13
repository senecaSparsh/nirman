"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  Loader2,
  RefreshCw,
  WifiOff,
  Wifi,
  AlertTriangle,
  MoreVertical,
} from "lucide-react";
import { useSession, signOut as authSignOut } from "@/lib/auth-client";
import { CommandPalette } from "@/components/command-palette";
import { usePullToRefresh } from "@/components/mobile/use-pull-to-refresh";
import { useOfflineQueue } from "@/lib/offline/use-offline-queue";
import { NavSheet } from "@/components/mobile/v2/nav-sheet";
import { AssistantChat } from "@/components/mobile/assistant/assistant-chat";
import {
  MOBILE_TABS,
  isModuleActive,
  type ModuleTab,
} from "@/lib/mobile-nav-v2";

/* ═══════════════════════════════════════════════════════════════════════════
   MOBILE SHELL V2 — "site-grade" minimal layout

   Matches Nirman OS's driver app layout:
   - Compact sticky header: company mark + name on left, online/sync/SOS
     on right. No project switcher, search, notifications, field mode,
     desktop switcher, or theme toggle (those moved to module homes /me).
   - Scrollable content area (max-w-[34rem], pb-nav).
   - Fixed bottom tab bar: 3 module tabs (Inventory / HR / Accounts),
     56px touch targets, amber underline for active, badges for pending.

   Preserved from old shell:
   - Auth guard (redirect to /sign-in when no session)
   - 401 fetch interceptor
   - /api/me role resolution (for CommandPalette)
   - Offline queue + online/offline listener
   - Pull-to-refresh
   - Command palette (keyboard only, no header icon)
   ═══════════════════════════════════════════════════════════════════════════ */

interface CompanyInfo {
  name: string;
  role: string;
}

export function MobileShellV2({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = useSession();
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({
    name: "Nirman",
    role: "MANAGER",
  });
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({});

  // ── Auth guard (all envs; skip only with NEXT_PUBLIC_AUTH_BYPASS) ──
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_AUTH_BYPASS === "true") return;
    if (!sessionLoading && !session) {
      authSignOut().catch(() => {});
      router.replace("/sign-in");
    }
  }, [session, sessionLoading, router]);

  // ── Global 401 interceptor ───────────────────────────
  useEffect(() => {
    if ((window as unknown as { __authInterceptorInstalled?: boolean }).__authInterceptorInstalled) return;
    (window as unknown as { __authInterceptorInstalled?: boolean }).__authInterceptorInstalled = true;
    const originalFetch = window.fetch;
    let redirecting = false;
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.startsWith("/api/") || url.startsWith("/api/auth/")) {
        return originalFetch(input, init);
      }
      return originalFetch(input, init).then((res) => {
        if (res.status === 401 && !redirecting) {
          redirecting = true;
          authSignOut().catch(() => {});
          router.replace("/sign-in");
        }
        return res;
      });
    };
    return () => {
      window.fetch = originalFetch;
      (window as unknown as { __authInterceptorInstalled?: boolean }).__authInterceptorInstalled = false;
    };
  }, [router]);

  // ── Resolve company name + role via /api/me ──────────
  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.role) {
          setCompanyInfo((prev) => ({ ...prev, role: d.role }));
        }
      })
      .catch(() => {});
    fetch("/api/company")
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (!cancelled && c?.name) {
          setCompanyInfo((prev) => ({ ...prev, name: c.name }));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Tab badge counts ─────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const badgeTabs = MOBILE_TABS.filter((t) => t.badge);
    Promise.all(
      badgeTabs.map((tab) =>
        fetch(tab.badge!.endpoint)
          .then((r) => (r.ok ? r.json() : []))
          .then((data) => ({
            href: tab.href,
            count: Array.isArray(data) ? data.length : 0,
          }))
          .catch(() => ({ href: tab.href, count: 0 })),
      ),
    ).then((results) => {
      if (cancelled) return;
      const map: Record<string, number> = {};
      for (const r of results) if (r.count > 0) map[r.href] = r.count;
      setBadgeCounts(map);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (process.env.NEXT_PUBLIC_AUTH_BYPASS !== "true" && sessionLoading && !session) {
    return (
      <div className="flex min-h-dvh items-center justify-center" style={{ backgroundColor: "var(--color-paper-2)" }}>
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--color-ink-300)" }} />
      </div>
    );
  }

  return (
    <MobileShellInner
      companyInfo={companyInfo}
      badgeCounts={badgeCounts}
      pathname={pathname}
      router={router}
    >
      {children}
    </MobileShellInner>
  );
}

/** Pure presentational shell */
function MobileShellInner({
  companyInfo,
  badgeCounts,
  pathname,
  router,
  children,
}: {
  companyInfo: CompanyInfo;
  badgeCounts: Record<string, number>;
  pathname: string;
  router: ReturnType<typeof useRouter>;
  children: React.ReactNode;
}) {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [navSheetOpen, setNavSheetOpen] = useState(false);
  const { pending: offlineQueueCount, syncing: offlineSyncing, sync: syncOfflineQueue } = useOfflineQueue();

  // ── Network offline listener ──
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const { pullDistance, refreshing, progress, showIndicator, bind } = usePullToRefresh(
    () => router.refresh(),
  );

  const initials = companyInfo.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const activeTab = MOBILE_TABS.find((t) => isModuleActive(pathname, t.href));
  const isDrillDown = Boolean(
    activeTab && pathname !== activeTab.href && !isModuleHome(pathname),
  );

  // ── Edge-swipe to go back (iOS-style) ──
  // Tracks a touch that starts within 24px of the left edge. If the user
  // swipes right by >80px without lifting, we call router.back().
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const onTouchStart = (e: React.TouchEvent) => {
    // Only track touches that start near the left edge
    const t = e.touches[0];
    if (!t) return;
    if (t.clientX < 24) {
      touchStart.current = { x: t.clientX, y: t.clientY, time: Date.now() };
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - touchStart.current.x;
    const dy = Math.abs(t.clientY - touchStart.current.y);
    // Only follow horizontal swipes (not vertical scrolls)
    if (dy > 40 && dx < 30) {
      touchStart.current = null;
      setSwipeOffset(0);
      return;
    }
    if (dx > 0) {
      setSwipeOffset(Math.min(dx, 120));
    }
  };

  const onTouchEnd = () => {
    if (!touchStart.current) {
      setSwipeOffset(0);
      return;
    }
    const elapsed = Date.now() - touchStart.current.time;
    if (swipeOffset > 80 || (swipeOffset > 40 && elapsed < 300)) {
      router.back();
    }
    touchStart.current = null;
    setSwipeOffset(0);
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden" style={{ backgroundColor: "var(--color-paper-2)" }}>
      <CommandPalette userRole={companyInfo.role as "OWNER" | "ADMIN" | "MANAGER" | "SUPERVISOR" | "SALES" | "ACCOUNTANT"} />

      {/* ── Offline banner ── */}
      {isOffline && (
        <div
          className="flex items-center justify-between gap-2 px-3 py-1.5 text-[0.6875rem] font-semibold"
          style={{ backgroundColor: "var(--color-stop)", color: "#fff" }}
        >
          <div className="flex items-center gap-2">
            <WifiOff className="size-3.5" />
            <span>
              Offline
              {offlineQueueCount > 0 && ` — ${offlineQueueCount} queued`}
            </span>
          </div>
          {offlineQueueCount > 0 && (
            <button
              onClick={() => void syncOfflineQueue()}
              disabled={offlineSyncing}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide active:opacity-80"
              style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "#fff" }}
            >
              {offlineSyncing ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <RefreshCw className="size-3" />
              )}
              {offlineSyncing ? "Syncing…" : "Sync"}
            </button>
          )}
        </div>
      )}

      {/* ══ HEADER — minimal, matches Nirman OS ══ */}
      <header
        className="sticky top-0 z-30 border-b px-4 py-2.5"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "color-mix(in srgb, var(--color-paper) 95%, transparent)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div className="flex items-center justify-between gap-2">
          {/* Left: 3-dot menu (home) / back chevron (drill-down) + name */}
          <div className="flex items-center gap-2 min-w-0">
            {isDrillDown ? (
              <button
                onClick={() => router.back()}
                aria-label="Back"
                className="press grid place-items-center size-9 rounded-[0.375rem]"
                style={{ color: "var(--color-ink-700)" }}
              >
                <ChevronLeft className="size-5" />
              </button>
            ) : (
              <button
                onClick={() => setNavSheetOpen(true)}
                aria-label="All pages"
                className="press grid place-items-center size-7 rounded-[0.375rem]"
                style={{ color: "var(--color-ink-500)" }}
              >
                <MoreVertical className="size-4" />
              </button>
            )}
            <span
              className="text-[0.6875rem] font-bold truncate"
              style={{ color: "var(--color-ink-950)" }}
            >
              {isDrillDown ? (activeTab?.label ?? companyInfo.name) : companyInfo.name}
            </span>
          </div>

          {/* Right: online status + sync badge */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Online/offline indicator */}
            {isOffline ? (
              <WifiOff className="size-3.5" style={{ color: "var(--color-stop)" }} />
            ) : (
              <Wifi className="size-3.5" style={{ color: "var(--color-go)" }} />
            )}

            {/* Pending sync badge */}
            {offlineQueueCount > 0 ? (
              <span
                className="inline-flex items-center gap-1 rounded-[0.375rem] px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide"
                style={{
                  backgroundColor: "var(--color-signal-wash)",
                  color: "var(--color-signal-dark)",
                }}
              >
                <RefreshCw className="size-2.5" /> {offlineQueueCount}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      {/* ══ CONTENT — scrollable, clears bottom nav ══ */}
      <main
        className="relative flex-1 overflow-y-auto pb-nav"
        {...bind}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Pull-to-refresh indicator */}
        {showIndicator && (
          <div
            className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-center justify-center"
            style={{ height: `${pullDistance}px` }}
          >
            <span
              className="flex size-8 items-center justify-center rounded-full border"
              style={{
                borderColor: "var(--color-line)",
                backgroundColor: "var(--color-paper)",
                opacity: refreshing ? 1 : progress,
              }}
            >
              <RefreshCw
                className={cn("size-4", refreshing && "animate-spin")}
                style={{
                  color: "var(--color-ink-500)",
                  transform: refreshing ? undefined : `rotate(${progress * 270}deg)`,
                }}
              />
            </span>
          </div>
        )}
        {/* Edge-swipe-back indicator — shows a back chevron that follows the finger */}
        {swipeOffset > 8 ? (
          <div
            className="pointer-events-none fixed top-1/2 -translate-y-1/2 z-40 flex items-center justify-center rounded-full"
            style={{
              left: `${Math.min(swipeOffset - 24, 60)}px`,
              width: "32px",
              height: "32px",
              backgroundColor: "var(--color-paper)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              opacity: Math.min(swipeOffset / 80, 1),
              transition: swipeOffset === 0 ? "opacity 0.2s, left 0.2s" : "none",
            }}
          >
            <ChevronLeft
              className="size-5"
              style={{ color: "var(--color-ink-700)" }}
            />
          </div>
        ) : null}
        {/* Centered content container — matches Nirman OS buyer/ops layout */}
        <div
          className="mx-auto w-full max-w-[34rem] px-3.5 py-3 fade-in"
          style={swipeOffset > 0 ? { transform: `translateX(${swipeOffset * 0.3}px)` } : undefined}
        >
          {children}
        </div>
      </main>

      {/* ══ BOTTOM NAV — 3 module tabs, matches Nirman OS ══ */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-paper) 97%, transparent)",
          borderColor: "var(--color-line)",
          backdropFilter: "blur(8px)",
        }}
        aria-label="Module navigation"
      >
        <div className="mx-auto w-full max-w-[34rem] flex items-stretch px-2 pb-safe">
          {MOBILE_TABS.map((tab) => (
            <TabButton
              key={tab.id}
              tab={tab}
              active={isModuleActive(pathname, tab.href)}
              badge={badgeCounts[tab.href]}
            />
          ))}
        </div>
      </nav>

      {/* ══ NAV SHEET — 3-dot overflow menu ══ */}
      <NavSheet
        open={navSheetOpen}
        onClose={() => setNavSheetOpen(false)}
        moduleId={activeTab?.id ?? "inventory"}
      />

      {/* ══ OWNER ASSISTANT — floating chat with voice (Hindi/English) ══ */}
      <AssistantChat />
    </div>
  );
}

/** A bottom tab button — 56px touch target, amber underline for active. */
function TabButton({ tab, active, badge }: { tab: ModuleTab; active: boolean; badge?: number }) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      className={[
        "press flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[3rem] relative",
        "transition-colors",
      ].join(" ")}
      style={{
        color: active ? "var(--color-ink-950)" : "var(--color-ink-500)",
      }}
    >
      {/* Active indicator — amber underline */}
      {active ? (
        <span
          className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-full"
          style={{ backgroundColor: "var(--color-signal)" }}
        />
      ) : null}

      {/* Icon + badge */}
      <span className="relative">
        <Icon
          className="size-[18px]"
          style={{ color: active ? "var(--color-ink-950)" : "var(--color-ink-500)" }}
        />
        {badge != null && badge > 0 ? (
          <span
            className="absolute -top-1.5 -right-2 min-w-[1rem] h-4 rounded-full px-1 text-[0.5625rem] font-bold grid place-items-center tabular-nums"
            style={{
              backgroundColor: "var(--color-signal)",
              color: "var(--color-ink-950)",
            }}
          >
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </span>

      {/* Label */}
      <span
        className="text-[0.5rem] font-semibold tracking-wide"
        style={{ color: active ? "var(--color-ink-950)" : "var(--color-ink-500)" }}
      >
        {tab.label}
      </span>
    </Link>
  );
}

/** Check if pathname is exactly a module home (not a drill-down). */
function isModuleHome(pathname: string): boolean {
  return MOBILE_TABS.some((t) => t.href === pathname);
}

/** Minimal cn helper (avoids importing from @/lib/utils which uses cool tokens). */
function cn(...inputs: (string | false | null | undefined)[]): string {
  return inputs.filter(Boolean).join(" ");
}
