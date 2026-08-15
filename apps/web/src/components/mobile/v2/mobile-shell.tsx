"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronDown,
  Check,
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
import { VoiceAgentButton } from "@/components/mobile/v2/voice-agent-button";
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

type CompanyOption = {
  id: string;
  name: string;
  businessType: string | null;
  parentName: string | null;
  isCurrent: boolean;
};

export function MobileShellV2({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = useSession();
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({
    name: "Nirman",
    role: "MANAGER",
  });
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companySwitcherOpen, setCompanySwitcherOpen] = useState(false);
  const [switchingCompanyId, setSwitchingCompanyId] = useState<string | null>(null);
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

  // ── Resolve company name + role via /api/me + /api/company ──
  // Both fetches run in parallel (Promise.all) to halve the waterfall.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/me").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/company").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([me, company]) => {
      if (cancelled) return;
      if (me?.role || company?.name) {
        setCompanyInfo((prev) => ({
          ...prev,
          role: me?.role ?? prev.role,
          name: company?.name ?? prev.name,
        }));
      }
      if (Array.isArray(company?.companies)) setCompanies(company.companies);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Update document title to the current company name ──────
  // Once we know the active company, the tab title becomes
  // "{companyName} · Nirman OS" so a user with multiple companies can
  // tell which books they're looking at from the browser tab.
  useEffect(() => {
    if (companyInfo.name && companyInfo.name !== "Nirman") {
      document.title = `${companyInfo.name} · Nirman OS`;
    } else {
      document.title = "Nirman Inventory OS";
    }
  }, [companyInfo.name]);

  // ── Re-fetch company info when the user switches company ──
  // The mobile company switcher (in /m/settings) dispatches a
  // "nirman-company-switched" event after a successful switch.
  useEffect(() => {
    function onCompanySwitched() {
      fetch("/api/company")
        .then((r) => (r.ok ? r.json() : null))
        .then((c) => {
          if (c?.name) setCompanyInfo((prev) => ({ ...prev, name: c.name }));
          if (Array.isArray(c?.companies)) setCompanies(c.companies);
        })
        .catch(() => {});
    }
    window.addEventListener("nirman-company-switched", onCompanySwitched);
    return () => window.removeEventListener("nirman-company-switched", onCompanySwitched);
  }, []);

  // ── Switch company ───────────────────────────────────────
  async function switchCompany(id: string) {
    if (id === companies.find((c) => c.isCurrent)?.id) {
      setCompanySwitcherOpen(false);
      return;
    }
    setSwitchingCompanyId(id);
    try {
      const res = await fetch("/api/company/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: id }),
      });
      if (res.ok) {
        setCompanySwitcherOpen(false);
        // Fetch the new company name and update state + title BEFORE
        // router.refresh(), which re-applies Next.js static metadata
        // and would overwrite document.title.
        const c = await fetch("/api/company").then((r) => r.json()).catch(() => null);
        if (c?.name) {
          setCompanyInfo((prev) => ({ ...prev, name: c.name }));
          if (Array.isArray(c?.companies)) setCompanies(c.companies);
          // Set the title now — router.refresh() may override it, so
          // we re-apply it after the refresh too.
          const newTitle = c.name !== "Nirman" ? `${c.name} · Nirman OS` : "Nirman Inventory OS";
          document.title = newTitle;
        }
        window.dispatchEvent(new CustomEvent("nirman-company-switched"));
        router.refresh();
        // Re-apply title after router.refresh() re-applies metadata.
        setTimeout(() => {
          if (c?.name && c.name !== "Nirman") {
            document.title = `${c.name} · Nirman OS`;
          }
        }, 300);
      }
    } finally {
      setSwitchingCompanyId(null);
    }
  }
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
      companies={companies}
      companySwitcherOpen={companySwitcherOpen}
      switchingCompanyId={switchingCompanyId}
      onToggleCompanySwitcher={() => setCompanySwitcherOpen((o) => !o)}
      onSwitchCompany={switchCompany}
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
  companies,
  companySwitcherOpen,
  switchingCompanyId,
  onToggleCompanySwitcher,
  onSwitchCompany,
  badgeCounts,
  pathname,
  router,
  children,
}: {
  companyInfo: CompanyInfo;
  companies: CompanyOption[];
  companySwitcherOpen: boolean;
  switchingCompanyId: string | null;
  onToggleCompanySwitcher: () => void;
  onSwitchCompany: (id: string) => void;
  badgeCounts: Record<string, number>;
  pathname: string;
  router: ReturnType<typeof useRouter>;
  children: React.ReactNode;
}) {
  const [isOffline, setIsOffline] = useState(false);
  const [navSheetOpen, setNavSheetOpen] = useState(false);
  const companySwitcherRef = useRef<HTMLDivElement>(null);
  const { pending: offlineQueueCount, syncing: offlineSyncing, sync: syncOfflineQueue } = useOfflineQueue();

  // ── Close company switcher on outside click ──────────────
  useEffect(() => {
    if (!companySwitcherOpen) return;
    const handler = (e: MouseEvent) => {
      if (companySwitcherRef.current && !companySwitcherRef.current.contains(e.target as Node)) {
        onToggleCompanySwitcher();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [companySwitcherOpen, onToggleCompanySwitcher]);

  // ── Network offline listener ──
  useEffect(() => {
    // Sync the real browser online status now that we're on the client.
    setIsOffline(!navigator.onLine);
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

  // A "drill-down" is any /m/* page that is NOT one of the 5 module homes.
  // This includes pages that don't fall under any tab prefix (e.g. /m/boq,
  // /m/projects, /m/reports) — those still need a back button.
  const isDrillDown = !isModuleHome(pathname) && pathname !== "/m";

  // ── Edge-swipe to go back (iOS-style) ──
  // Tracks a touch that starts within 28px of the left edge. If the user
  // swipes right by >80px without lifting, we call router.back().
  // Handlers are MERGED with pull-to-refresh below — both gestures coexist.
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);

  const onSwipeTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    // Track touches that start near the left edge (wider zone for reliability)
    if (t.clientX < 28) {
      touchStart.current = { x: t.clientX, y: t.clientY, time: Date.now() };
    }
  };

  const onSwipeTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - touchStart.current.x;
    const dy = Math.abs(t.clientY - touchStart.current.y);
    // Cancel if this is a vertical scroll, not a horizontal swipe
    if (dy > 50 && dx < 40) {
      touchStart.current = null;
      setSwipeOffset(0);
      return;
    }
    if (dx > 0) {
      setSwipeOffset(Math.min(dx, 120));
    }
  };

  const onSwipeTouchEnd = () => {
    if (!touchStart.current) {
      setSwipeOffset(0);
      return;
    }
    const elapsed = Date.now() - touchStart.current.time;
    if (swipeOffset > 80 || (swipeOffset > 40 && elapsed < 300)) {
      goBack();
    }
    touchStart.current = null;
    setSwipeOffset(0);
  };

  // ── Unified back navigation with fallback ──
  // If there's browser history, go back. If not (deep-link), fall back
  // to the active module home or /m/home as a last resort.
  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      const fallback = activeTab?.href ?? "/m/home";
      router.push(fallback);
    }
  }

  // ── Merge pull-to-refresh + edge-swipe touch handlers ──
  // Both gestures share the same <main> element. Without merging, the
  // later prop overrides the earlier one — breaking one of the two.
  const mergedTouchHandlers = {
    onTouchStart: (e: React.TouchEvent) => {
      bind.onTouchStart(e);
      onSwipeTouchStart(e);
    },
    onTouchMove: (e: React.TouchEvent) => {
      bind.onTouchMove(e);
      onSwipeTouchMove(e);
    },
    onTouchEnd: () => {
      bind.onTouchEnd();
      onSwipeTouchEnd();
    },
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
            <Link
              href="/m/queue"
              className="flex items-center gap-1 rounded px-2 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide active:opacity-80"
              style={{ backgroundColor: "rgba(255,255,255,0.2)", color: "#fff" }}
            >
              {offlineSyncing ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <RefreshCw className="size-3" />
              )}
              {offlineSyncing ? "Syncing…" : `${offlineQueueCount} Queued`}
            </Link>
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
                onClick={goBack}
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
            {isDrillDown ? (
              <span
                className="text-[0.6875rem] font-bold truncate"
                style={{ color: "var(--color-ink-950)" }}
              >
                {activeTab?.label ?? pageTitleFromPath(pathname)}
              </span>
            ) : (
              <div ref={companySwitcherRef} className="relative min-w-0">
                <button
                  onClick={() => companies.length > 1 && onToggleCompanySwitcher()}
                  className="flex items-center gap-1 text-[0.6875rem] font-bold truncate press rounded-[0.25rem] px-0.5 py-0.5"
                  style={{ color: "var(--color-ink-950)" }}
                  aria-label="Switch company"
                >
                  <span className="truncate">{companyInfo.name}</span>
                  {companies.length > 1 && (
                    <ChevronDown
                      className="size-3 shrink-0 transition-transform"
                      style={{
                        color: "var(--color-ink-500)",
                        transform: companySwitcherOpen ? "rotate(180deg)" : "none",
                      }}
                    />
                  )}
                </button>
                {companySwitcherOpen && companies.length > 1 && (
                  <div
                    className="absolute top-full left-0 z-50 mt-1 rounded-[0.5rem] border shadow-lg overflow-hidden min-w-[180px]"
                    style={{
                      borderColor: "var(--color-line)",
                      backgroundColor: "var(--color-paper)",
                    }}
                  >
                    <div className="max-h-60 overflow-y-auto">
                      {companies.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => onSwitchCompany(c.id)}
                          disabled={switchingCompanyId !== null}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-left press disabled:opacity-50"
                          style={{
                            backgroundColor: c.isCurrent ? "var(--color-concrete)" : "transparent",
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <p
                              className="text-[0.6875rem] font-semibold truncate"
                              style={{ color: "var(--color-ink-950)" }}
                            >
                              {c.name}
                            </p>
                            {c.businessType && (
                              <p
                                className="text-[0.5rem] truncate"
                                style={{ color: "var(--color-ink-500)" }}
                              >
                                {c.businessType}
                              </p>
                            )}
                          </div>
                          {c.isCurrent && (
                            <Check
                              className="size-3.5 shrink-0"
                              style={{ color: "var(--color-go)" }}
                            />
                          )}
                          {switchingCompanyId === c.id && (
                            <Loader2 className="size-3.5 shrink-0 animate-spin" style={{ color: "var(--color-ink-500)" }} />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: voice assistant + online status + sync badge */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Voice agent — tap to speak, no popup */}
            <VoiceAgentButton />

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
        {...mergedTouchHandlers}
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
    </div>
  );
}

/** A bottom tab button — 56px touch target, amber underline for active. */
function TabButton({ tab, active, badge }: { tab: ModuleTab; active: boolean; badge?: number }) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      prefetch
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

/**
 * Derive a human-readable page title from a /m/* pathname.
 * Used in the drill-down header when no active tab matches.
 * e.g. /m/boq → "Bill of Quantities", /m/projects/[id] → "Project Detail",
 *      /m/hr/leaves → "Leaves", /m/portal-listings/new → "New Listing"
 */
function pageTitleFromPath(pathname: string): string {
  // Strip /m/ prefix and split into segments
  const segments = pathname.replace(/^\/m\//, "").split("/").filter(Boolean);
  if (segments.length === 0) return "Home";

  const TITLE_MAP: Record<string, string> = {
    boq: "Bill of Quantities",
    wbs: "Work Breakdown Structure",
    "budget-variance": "Budget Variance",
    "measurement-book": "Measurement Book",
    "project-control": "Project Control",
    "standard-consumptions": "Standard Consumptions",
    "material-reconciliation": "Material Reconciliation",
    "work-orders": "Work Orders",
    "rate-contracts": "Rate Contracts",
    projects: "Projects",
    units: "Built Units",
    land: "Land & Parcels",
    customers: "Customers",
    sales: "Sales",
    rentals: "Rentals",
    "portal-listings": "Portal Listings",
    reports: "Reports",
    procurement: "Purchase Orders",
    requisitions: "Material Indents",
    suppliers: "Suppliers",
    "supplier-returns": "Supplier Returns",
    materials: "Materials",
    stock: "Stock Ledger",
    "stock-counts": "Stock Counts",
    transfers: "Transfers",
    equipment: "Equipment",
    "material-sales": "Material Sales",
    "scrap-generations": "Scrap",
    attendance: "Attendance",
    dprs: "Daily Progress Reports",
    employees: "Employees",
    leaves: "Leaves",
    tasks: "Tasks",
    books: "Books",
    finance: "Finance",
    payroll: "Payroll",
    receipts: "Receipts",
    gl: "Trial Balance",
    settings: "Settings",
    team: "Team",
    me: "My Profile",
    home: "Home",
    inventory: "Inventory",
    hr: "HR",
    accounts: "Accounts",
    queue: "Offline Queue",
    pulse: "Pulse",
    approvals: "Approvals",
    attention: "Attention",
    new: "New",
  };

  // For [id] segments (dynamic routes), use the parent segment's title
  const lastSegment = segments[segments.length - 1] ?? "";
  if (lastSegment === "new") return "New";
  // If the last segment looks like a cuid (starts with a letter, 20+ chars), use parent
  if (lastSegment.length > 20 && /^[a-z0-9]+$/i.test(lastSegment)) {
    const parent = segments[segments.length - 2] ?? "";
    return TITLE_MAP[parent] ?? parent.charAt(0).toUpperCase() + parent.slice(1);
  }

  return TITLE_MAP[lastSegment] ?? lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1);
}

/** Minimal cn helper (avoids importing from @/lib/utils which uses cool tokens). */
function cn(...inputs: (string | false | null | undefined)[]): string {
  return inputs.filter(Boolean).join(" ");
}
