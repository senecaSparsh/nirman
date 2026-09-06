"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronDown,
  Check,
  Loader2,
  RefreshCw,
  WifiOff,
  Wifi,
  MoreVertical,
  Search,
} from "lucide-react";
import { useSession, signOut as authSignOut } from "@/lib/auth-client";
import { CommandPalette } from "@/components/command-palette";
import { usePullToRefresh } from "@/components/mobile/use-pull-to-refresh";
import { useOfflineQueue } from "@/lib/offline/use-offline-queue";
import { NavSheet } from "@/components/mobile/v2/nav-sheet";
import { VoiceAgentButton } from "@/components/mobile/v2/voice-agent-button";
import { MobileGlobalSearch } from "@/components/mobile/v2/mobile-global-search";
import { useCompanySwitch } from "@/lib/use-company-switch";
import { useRecentPages } from "@/lib/use-nav-preferences";
import { usePageContext } from "@/components/mobile/v2/page-context";
import { useDeviceTierWithCaps } from "@/lib/device-tier-client";
import { upHref as manifestUpHref, activeTabFor as manifestActiveTabFor, badgeEndpointsFor as manifestBadgeEndpointsFor, titleFor as manifestTitleFor, matchRoute as manifestMatchRoute, type NavContext } from "@/lib/route-manifest";
import {
  tabsForRole,
  roleToPersona,
  type ModuleTab,
  type Persona,
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
  parentCompanyId: string | null;
  permissions: string[];
}

type CompanyOption = {
  id: string;
  name: string;
  businessType: string | null;
  parentName: string | null;
  parentCompanyId: string | null;
  isCurrent: boolean;
};

export function MobileShellV2({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = useSession();

  // ── Device tier detection — runs once on every page, sets cookie for server ──
  // This ensures the device tier cookie is always set, even on pages that don't
  // use AdaptiveData. The server reads this cookie to decide SSR vs client-fetch.
  useDeviceTierWithCaps();
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({
    name: "Nirman",
    role: "PROJECT_MANAGER",
    parentCompanyId: null,
    permissions: [],
  });
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companySwitcherOpen, setCompanySwitcherOpen] = useState(false);
  const [switchingCompanyId, setSwitchingCompanyId] = useState<string | null>(null);
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({});
  const [searchOpen, setSearchOpen] = useState(false);

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
          // Preserve the current path so the user returns here after re-login.
          const current = window.location.pathname + window.location.search;
          router.replace(`/sign-in?redirect=${encodeURIComponent(current)}`);
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
          parentCompanyId: company?.parentCompanyId ?? null,
          permissions: Array.isArray(me?.permissions) ? me.permissions : prev.permissions,
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
  // "nirman-company-switched" event after a successful switch. We also
  // re-fetch badge counts because pending approvals/requisitions/etc.
  // are scoped to the active company.
  // ── D9 fix: only fetch badges for the current persona's tabs ──
  // The old code fetched ALL_BADGE_TABS (every badge for every persona)
  // on every shell mount. Now we use the manifest's badgeEndpointsFor
  // which returns only the badges for the current user's tab set.
  const persona = roleToPersona(companyInfo.role);
  const refreshBadgeCounts = useCallback(() => {
    const ctx: NavContext = { permissions: companyInfo.permissions, persona };
    const badgeEndpoints = manifestBadgeEndpointsFor(ctx);
    if (badgeEndpoints.length === 0) return;
    let cancelled = false;
    Promise.all(
      badgeEndpoints.map(({ path, endpoint }) =>
        fetch(endpoint)
          .then((r) => (r.ok ? r.json() : []))
          .then((data) => ({
            href: path,
            count: Array.isArray(data) ? data.length : 0,
          }))
          .catch(() => ({ href: path, count: 0 })),
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
  }, [companyInfo.permissions, persona]);

  // ── Company switch via unified hook ───────────────────────
  // Uses useCompanySwitch for optimistic UI + generation-counter race
  // protection + event-with-data. The onOptimisticSwitch callback
  // updates the header instantly; onRevert restores on failure.
  const prevCompanyRef = useRef<{ name: string; parentCompanyId: string | null; companies: CompanyOption[] } | null>(null);

  const { switchCompany: doSwitch, isSwitching: isCompanySwitching } = useCompanySwitch({
    endpoint: "/api/company/switch",
    onOptimisticSwitch: (target) => {
      // Save previous state for rollback
      prevCompanyRef.current = {
        name: companyInfo.name,
        parentCompanyId: companyInfo.parentCompanyId,
        companies,
      };
      // Optimistic update — header + checkmark move instantly
      setCompanyInfo((prev) => ({
        ...prev,
        name: target.name,
        parentCompanyId: target.parentCompanyId ?? null,
      }));
      setCompanies((prev) => prev.map((c) => ({ ...c, isCurrent: c.id === target.id })));
      const newTitle = target.name !== "Nirman" ? `${target.name} · Nirman OS` : "Nirman Inventory OS";
      document.title = newTitle;
    },
    onRevert: () => {
      const prev = prevCompanyRef.current;
      if (prev) {
        setCompanyInfo((p) => ({ ...p, name: prev.name, parentCompanyId: prev.parentCompanyId }));
        setCompanies(prev.companies);
        document.title = prev.name !== "Nirman" ? `${prev.name} · Nirman OS` : "Nirman Inventory OS";
      }
      toast.error("Failed to switch company. Please try again.");
    },
  });

  useEffect(() => {
    function onCompanySwitched(e: Event) {
      const detail = (e as CustomEvent).detail as
        | { id: string; name: string; parentCompanyId: string | null }
        | undefined;
      // Update from event detail (instant — no second round-trip)
      if (detail?.name) {
        setCompanyInfo((prev) => ({
          ...prev,
          name: detail.name,
          parentCompanyId: detail.parentCompanyId ?? null,
        }));
      }
      // Also re-fetch /api/company for the full companies list (isCurrent flags)
      fetch("/api/company")
        .then((r) => (r.ok ? r.json() : null))
        .then((c) => {
          if (Array.isArray(c?.companies)) setCompanies(c.companies);
        })
        .catch(() => {});
      refreshBadgeCounts();
    }
    window.addEventListener("nirman-company-switched", onCompanySwitched as EventListener);
    return () => window.removeEventListener("nirman-company-switched", onCompanySwitched as EventListener);
  }, [refreshBadgeCounts]);

  // ── Switch company (delegates to useCompanySwitch hook) ───
  async function switchCompany(id: string) {
    const target = companies.find((c) => c.id === id);
    if (!target || target.isCurrent) {
      setCompanySwitcherOpen(false);
      return;
    }
    setCompanySwitcherOpen(false);
    setSwitchingCompanyId(id);
    await doSwitch({
      id: target.id,
      name: target.name,
      parentCompanyId: target.parentCompanyId,
    });
    setSwitchingCompanyId(null);
  }
  useEffect(() => {
    // Fetch badges from ALL tabs that carry a badge, across every persona.
    // The old code only fetched from MOBILE_TABS (legacy 5-tab array),
    // which missed tabs like POs, DPR, Tasks that aren't in MOBILE_TABS.
    return refreshBadgeCounts();
  }, [refreshBadgeCounts]);

  if (process.env.NEXT_PUBLIC_AUTH_BYPASS !== "true" && sessionLoading && !session) {
    return (
      <div className="flex min-h-dvh items-center justify-center" style={{ backgroundColor: "var(--color-paper-2)" }}>
        <Loader2 className="size-6 animate-spin" style={{ color: "var(--color-ink-300)" }} />
      </div>
    );
  }

  // Company switcher — any user with memberships in multiple companies
  // can switch between them. Each company is its own "world" with its own
  // hierarchy, projects, and staff. The owner explicitly wants all staff
  // to be able to pick which company they're working in.
  const canSwitchCompany = companies.length > 1;

  const personaTabs = tabsForRole(companyInfo.role);

  return (
    <MobileShellInner
      companyInfo={companyInfo}
      companies={companies}
      canSwitchCompany={canSwitchCompany}
      companySwitcherOpen={companySwitcherOpen}
      switchingCompanyId={switchingCompanyId}
      isCompanySwitching={isCompanySwitching}
      onToggleCompanySwitcher={() => setCompanySwitcherOpen((o) => !o)}
      onSwitchCompany={switchCompany}
      badgeCounts={badgeCounts}
      pathname={pathname}
      router={router}
      personaTabs={personaTabs}
      persona={persona}
      searchOpen={searchOpen}
      onSearchOpenChange={setSearchOpen}
    >
      {children}
    </MobileShellInner>
  );
}

/** Pure presentational shell */
function MobileShellInner({
  companyInfo,
  companies,
  canSwitchCompany,
  companySwitcherOpen,
  switchingCompanyId,
  isCompanySwitching,
  onToggleCompanySwitcher,
  onSwitchCompany,
  badgeCounts,
  pathname,
  router,
  personaTabs,
  persona,
  searchOpen,
  onSearchOpenChange,
  children,
}: {
  companyInfo: CompanyInfo;
  companies: CompanyOption[];
  canSwitchCompany: boolean;
  companySwitcherOpen: boolean;
  switchingCompanyId: string | null;
  isCompanySwitching: boolean;
  onToggleCompanySwitcher: () => void;
  onSwitchCompany: (id: string) => void;
  badgeCounts: Record<string, number>;
  pathname: string;
  router: ReturnType<typeof useRouter>;
  personaTabs: ModuleTab[];
  persona: Persona;
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [isOffline, setIsOffline] = useState(false);
  const [navSheetOpen, setNavSheetOpen] = useState(false);
  const companySwitcherRef = useRef<HTMLDivElement>(null);
  const { pending: offlineQueueCount, syncing: offlineSyncing, sync: _syncOfflineQueue } = useOfflineQueue();
  const { trackVisit } = useRecentPages();

  // ── Track page visits for NavSheet "Recent" section ──
  useEffect(() => {
    trackVisit(pathname);
  }, [pathname, trackVisit]);

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

  // ── Active tab from the route manifest (fixes D4) ──
  // The manifest's activeTabFor walks the parent chain to find the nearest
  // tab root, returning exactly ONE tab. The old isModuleActive compared
  // query-stripped hrefs and matched several tabs on /m/hr.
  const navCtx: NavContext = { permissions: companyInfo.permissions, persona };
  const activeTabPath = manifestActiveTabFor(pathname, navCtx);
  const activeTab = personaTabs.find((t) => t.href.split("?")[0] === activeTabPath);

  // A "drill-down" is any /m/* page that is NOT a tab root.
  // Uses the manifest's activeTabFor — if the active tab path equals the
  // current pathname, we're on a tab root (module home). Otherwise it's
  // a drill-down page that needs Up navigation.
  const isDrillDown = !activeTabPath || activeTabPath !== pathname;

  // ── Drill-down title ───────────────────────────────────────
  // Resolved from (in priority order):
  //   1. Page context label (set by detail pages via PageContextProvider)
  //   2. Active tab label (if the route matches a persona tab)
  //   3. URL path segment via pageTitleFromPath
  //
  // The page context store is module-level (useSyncExternalStore), so the
  // shell — which sits ABOVE the page content — can still read the entity
  // label that detail pages set. This fixes D3 (detail pages show list titles).
  //
  // IMPORTANT: We defer the title to after mount to guarantee server and
  // client produce identical HTML on first paint.
  const pageCtx = usePageContext();
  const computedTitle = pageCtx.label ?? activeTab?.label ?? manifestTitleFor(pathname);
  const computedSubtitle = pageCtx.subtitle;
  const [drillDownTitle, setDrillDownTitle] = useState("");
  const [drillDownSubtitle, setDrillDownSubtitle] = useState("");
  useEffect(() => {
    setDrillDownTitle(computedTitle);
    setDrillDownSubtitle(computedSubtitle ?? "");
  }, [computedTitle, computedSubtitle]);

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
      // Edge-swipe = Back (OS convention), not Up
      if (typeof window !== "undefined" && window.history.length > 1) {
        router.back();
      } else {
        goUp();
      }
    }
    touchStart.current = null;
    setSwipeOffset(0);
  };

  // ── Up navigation (deterministic, deep-link safe) ──
  // The header chevron is Up (parent from the route manifest), not Back.
  // Edge-swipe remains Back (router.back) to match OS convention.
  // Fixes D7: goBack() used to call router.back() which could leave the app
  // on a WhatsApp deep link. Now the chevron always goes to the parent route.
  const upTarget = manifestUpHref(pathname);
  function goUp() {
    if (upTarget) {
      router.push(upTarget);
    } else {
      // No parent — go home
      router.push("/m/home");
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
    <div className="flex h-dvh flex-col overflow-hidden" style={{ backgroundColor: "var(--color-paper)" }}>
      <CommandPalette userRole={companyInfo.role as string} />

      {/* ── Offline banner — subtle indicator, not an alarm ── */}
      {isOffline && (
        <div
          className="flex items-center justify-between gap-2 px-3 py-1 text-m-label font-semibold"
          style={{
            backgroundColor: "var(--color-signal-wash)",
            color: "var(--color-signal-dark)",
          }}
        >
          <div className="flex items-center gap-1.5">
            <WifiOff className="size-3" />
            <span>
              Offline
              {offlineQueueCount > 0 && ` · ${offlineQueueCount} queued`}
            </span>
          </div>
          {offlineQueueCount > 0 && (
            <Link
              href="/m/queue"
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-m-caption font-bold uppercase tracking-wide active:opacity-80"
              style={{
                backgroundColor: "var(--color-signal)",
                color: "var(--color-ink-950)",
              }}
            >
              {offlineSyncing ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <RefreshCw className="size-3" />
              )}
              {offlineSyncing ? "Syncing…" : "Queue"}
            </Link>
          )}
        </div>
      )}

      {/* ══ HEADER — minimal, matches Nirman OS ══ */}
      <header
        className="sticky top-0 z-30 px-4 py-2.5"
        style={{
          /* Apple §12 — translucent material, not an opaque bar. Content
             scrolls underneath; blur + saturate conveys hierarchy. Bright
             bottom edge = light catching the material. */
          backgroundColor: "color-mix(in srgb, var(--color-paper) 88%, transparent)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          borderBottom: "1px solid color-mix(in srgb, var(--color-paper) 60%, transparent)",
        }}
      >
        <div className="flex items-center justify-between gap-2">
          {/* Left: Up chevron (drill-down) + 3-dot menu (always) + name */}
          <div className="flex items-center gap-1 min-w-0">
            {isDrillDown && (
              <button
                onClick={goUp}
                aria-label="Up"
                className="press grid place-items-center size-9 rounded-[0.375rem] text-m-body"
                style={{ color: "var(--color-ink-700)" }}
              >
                <ChevronLeft className="size-5" />
              </button>
            )}
            <button
              onClick={() => setNavSheetOpen(true)}
              aria-label="All pages"
              className="press grid place-items-center size-9 rounded-[0.375rem]"
              style={{ color: "var(--color-ink-500)" }}
            >
              <MoreVertical className="size-5" />
            </button>
            {isDrillDown ? (
              <div className="min-w-0 flex flex-col justify-center">
                <span
                  className="text-m-body font-bold truncate leading-tight"
                  style={{ color: "var(--color-ink-950)" }}
                >
                  {drillDownTitle}
                </span>
                {drillDownSubtitle && (
                  <span
                    className="text-m-caption truncate leading-tight"
                    style={{ color: "var(--color-ink-500)" }}
                  >
                    {drillDownSubtitle}
                  </span>
                )}
              </div>
            ) : (
              <div ref={companySwitcherRef} className="relative min-w-0">
                <button
                  onClick={() => canSwitchCompany && onToggleCompanySwitcher()}
                  className="flex items-center gap-1 text-m-body font-bold truncate text-m-body press rounded-[0.25rem] px-0.5 py-0.5"
                  style={{ color: "var(--color-ink-950)" }}
                  aria-label="Switch company"
                >
                  <span className="truncate">{companyInfo.name}</span>
                  {canSwitchCompany && (
                    <ChevronDown
                      className="size-3 shrink-0 transition-transform"
                      style={{
                        color: "var(--color-ink-500)",
                        transform: companySwitcherOpen ? "rotate(180deg)" : "none",
                      }}
                    />
                  )}
                </button>
                {companySwitcherOpen && canSwitchCompany && (
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
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-m-body press disabled:opacity-50"
                          style={{
                            backgroundColor: c.isCurrent ? "var(--color-concrete)" : "transparent",
                          }}
                        >
                          <div className="min-w-0 flex-1">
                            <p
                              className="text-m-body font-semibold truncate"
                              style={{ color: "var(--color-ink-950)" }}
                            >
                              {c.name}
                            </p>
                            {c.businessType && (
                              <p
                                className="text-m-caption truncate"
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

          {/* Right: search + voice assistant + online status + sync badge */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Persistent search — available on every page (fixes D1 reach) */}
            <button
              onClick={() => onSearchOpenChange(true)}
              aria-label="Search"
              className="press grid place-items-center size-9 rounded-[0.375rem]"
              style={{ color: "var(--color-ink-500)" }}
            >
              <Search className="size-4" />
            </button>

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
                className="inline-flex items-center gap-1 rounded-[0.375rem] px-1.5 py-0.5 text-m-caption font-bold uppercase tracking-wide"
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
        className="m-shell-content relative flex-1 overflow-y-auto pb-nav"
        data-switching={isCompanySwitching ? "true" : undefined}
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
          className="mx-auto w-full max-w-md px-3.5 py-3 overflow-x-hidden fade-in"
          style={swipeOffset > 0 ? { transform: `translateX(${swipeOffset * 0.3}px)` } : undefined}
        >
          {children}
        </div>
      </main>

      {/* ══ BOTTOM NAV — persona-based tabs ══ */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30"
        style={{
          /* Apple §12 — translucent material, not an opaque bar. Content
             scrolls underneath; the blur + saturate conveys hierarchy
             without stealing focus. Bright top edge = light catching the
             material (Apple's vibrancy detail). */
          backgroundColor: "color-mix(in srgb, var(--color-paper) 88%, transparent)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          borderTop: "1px solid color-mix(in srgb, var(--color-paper) 60%, transparent)",
        }}
        aria-label="Module navigation"
      >
        <div className="mx-auto w-full max-w-[34rem] flex items-stretch px-2 pb-safe">
          {personaTabs.map((tab) => (
            <TabButton
              key={tab.id}
              tab={tab}
              active={tab.href.split("?")[0] === activeTabPath}
              badge={badgeCounts[tab.href]}
            />
          ))}
        </div>
      </nav>

      {/* ══ GLOBAL SEARCH OVERLAY ══ */}
      <MobileGlobalSearch open={searchOpen} onClose={() => onSearchOpenChange(false)} />

      {/* ══ NAV SHEET — 3-dot overflow menu ══ */}
      <NavSheet
        open={navSheetOpen}
        onClose={() => setNavSheetOpen(false)}
        moduleId={activeTab?.id ?? manifestMatchRoute(pathname)?.module ?? "home"}
        persona={persona}
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

      {/* Label */}
      <span
        className="text-m-caption font-semibold tracking-wide"
        style={{ color: active ? "var(--color-ink-950)" : "var(--color-ink-500)" }}
      >
        {tab.label}
      </span>
    </Link>
  );
}

/** Minimal cn helper (avoids importing from @/lib/utils which uses cool tokens). */
function cn(...inputs: (string | false | null | undefined)[]): string {
  return inputs.filter(Boolean).join(" ");
}
