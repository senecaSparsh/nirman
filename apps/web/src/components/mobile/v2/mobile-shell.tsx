"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
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
import { mutate } from "swr";
import { CommandPalette } from "@/components/command-palette";
import { usePullToRefresh } from "@/components/mobile/use-pull-to-refresh";
import { useOfflineQueue } from "@/lib/offline/use-offline-queue";
import { NavSheet } from "@/components/mobile/v2/nav-sheet";
import { TabSwitcher } from "@/components/mobile/v2/tab-switcher";
import { VoiceAgentButton } from "@/components/mobile/v2/voice-agent-button";
import { MobileGlobalSearch } from "@/components/mobile/v2/mobile-global-search";
import { useCompanySwitch } from "@/lib/use-company-switch";
import { useRecentPages } from "@/lib/use-nav-preferences";
import { usePageContext } from "@/components/mobile/v2/page-context";
import { useDeviceTierWithCaps } from "@/lib/device-tier-client";
import {
  upHref as manifestUpHref,
  activeTabFor as manifestActiveTabFor,
  badgeEndpointsFor as manifestBadgeEndpointsFor,
  titleFor as manifestTitleFor,
  matchRoute as manifestMatchRoute,
  tabsFor as manifestTabsFor,
  type NavContext,
  type RouteEntry,
} from "@/lib/route-manifest";
import { roleToPersona, type Persona } from "@/lib/mobile-nav-v2";
import type { NavBootstrap } from "@/lib/server";

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

export function MobileShellV2({
  children,
  initial,
}: {
  children: React.ReactNode;
  /** Server-resolved nav identity from the /m layout. When present, the
   * shell renders with the real role/permissions/company on first paint
   * (no client waterfall, no session spinner). */
  initial?: NavBootstrap | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = useSession();

  // ── Device tier detection — runs once on every page, sets cookie for server ──
  // This ensures the device tier cookie is always set, even on pages that don't
  // use AdaptiveData. The server reads this cookie to decide SSR vs client-fetch.
  useDeviceTierWithCaps();
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(() =>
    initial
      ? {
          name: initial.company.name,
          role: initial.me.role,
          parentCompanyId: initial.company.parentCompanyId,
          permissions: initial.me.permissions,
        }
      : {
          name: "Nirman",
          role: "PROJECT_MANAGER",
          parentCompanyId: null,
          permissions: [],
        },
  );
  const [companies, setCompanies] = useState<CompanyOption[]>(initial?.company.companies ?? []);
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
  // Skipped when `initial` is provided — the /m layout already resolved
  // the same data server-side, so refetching would just double the work.
  useEffect(() => {
    if (initial) return;
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
  }, [initial]);

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
      // Invalidate SWR caches so child components using usePermissions
      // or useSWR("/api/company") stay in sync after the switch —
      // permissions are company-scoped and must be re-fetched.
      mutate("/api/me");
      mutate("/api/company");
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

  // The session spinner only applies when the server did NOT already prove
  // a session exists (initial === undefined → unauthenticated or bootstrap
  // failed → keep the old gate so we still wait for useSession/redirect).
  if (
    !initial &&
    process.env.NEXT_PUBLIC_AUTH_BYPASS !== "true" &&
    sessionLoading &&
    !session
  ) {
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

  // ── Tab bar from the route manifest (single source of truth) ──
  // Previously this used tabsForRole() from mobile-nav-v2 while the ACTIVE tab
  // was resolved from the manifest. The two sets disagreed, so on 101 routes
  // (procurement persona) the highlighted tab wasn't even on screen, Settings
  // could never highlight at all, and badges — keyed by manifest path — never
  // matched the old `?tab=` hrefs. One source fixes all three.
  const personaTabs = manifestTabsFor({ permissions: companyInfo.permissions, persona });

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
  personaTabs: RouteEntry[];
  persona: Persona;
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [isOffline, setIsOffline] = useState(false);
  const [navSheetOpen, setNavSheetOpen] = useState(false);
  const [tabSwitcherOpen, setTabSwitcherOpen] = useState(false);
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
  const activeTab = personaTabs.find((t) => t.path === activeTabPath);

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
  const computedTitle = pageCtx.label ?? activeTab?.title ?? manifestTitleFor(pathname);
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
  //
  // ── Right-edge swipe → Tab Switcher ──
  // The opposite gesture: a touch starting within 28px of the RIGHT edge
  // that swipes LEFT by >80px opens the Safari-style tab overview. This is
  // the "opposite direction of going back" the owner requested.
  const touchStart = useRef<{ x: number; y: number; time: number; edge: "left" | "right" | null } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [rightSwipeOffset, setRightSwipeOffset] = useState(0);

  const onSwipeTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (!t) return;
    const winW = typeof window !== "undefined" ? window.innerWidth : 9999;
    // Track touches that start near the left edge (back) or right edge (tabs)
    let edge: "left" | "right" | null = null;
    if (t.clientX < 28) edge = "left";
    else if (winW - t.clientX < 28) edge = "right";
    if (edge) {
      touchStart.current = { x: t.clientX, y: t.clientY, time: Date.now(), edge };
    }
  };

  const onSwipeTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - touchStart.current.x;
    const dy = Math.abs(t.clientY - touchStart.current.y);
    // Cancel if this is a vertical scroll, not a horizontal swipe
    if (dy > 50 && Math.abs(dx) < 40) {
      touchStart.current = null;
      setSwipeOffset(0);
      setRightSwipeOffset(0);
      return;
    }
    if (touchStart.current.edge === "left" && dx > 0) {
      setSwipeOffset(Math.min(dx, 120));
    } else if (touchStart.current.edge === "right" && dx < 0) {
      setRightSwipeOffset(Math.min(Math.abs(dx), 120));
    }
  };

  const onSwipeTouchEnd = () => {
    if (!touchStart.current) {
      setSwipeOffset(0);
      setRightSwipeOffset(0);
      return;
    }
    const elapsed = Date.now() - touchStart.current.time;
    if (touchStart.current.edge === "left") {
      if (swipeOffset > 80 || (swipeOffset > 40 && elapsed < 300)) {
        // Edge-swipe = Back (OS convention), not Up
        if (typeof window !== "undefined" && window.history.length > 1) {
          router.back();
        } else {
          goUp();
        }
      }
    } else if (touchStart.current.edge === "right") {
      // Right-edge swipe left → open tab switcher
      if (rightSwipeOffset > 80 || (rightSwipeOffset > 40 && elapsed < 300)) {
        setTabSwitcherOpen(true);
      }
    }
    touchStart.current = null;
    setSwipeOffset(0);
    setRightSwipeOffset(0);
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
    <div className="flex h-dvh flex-col overflow-hidden" style={{ backgroundColor: "var(--color-paper-2)" }}>
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
             scrolls underneath; blur + saturate conveys hierarchy. Hairline
             bottom edge uses --color-line for a consistent separator on
             both light + dark themes. */
          backgroundColor: "color-mix(in srgb, var(--color-paper) 88%, transparent)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          borderBottom: "1px solid var(--color-line)",
        }}
      >
        <div className="flex items-center justify-between gap-2">
          {/* Left: Up chevron (drill-down) + 3-dot menu (always) + name */}
          <div className="flex items-center gap-0 min-w-0">
            {isDrillDown && (
              <button
                onClick={goUp}
                aria-label="Go back"
                className="press grid place-items-center size-8 rounded-[0.375rem] text-m-body"
                style={{ color: "var(--color-ink-700)" }}
              >
                <ChevronLeft className="size-5" />
              </button>
            )}
            <button
              onClick={() => setNavSheetOpen(true)}
              aria-label="Open menu"
              className="press grid place-items-center size-8 rounded-[0.375rem]"
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
              aria-label="Open search"
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
        {/* Right-edge swipe indicator — shows a tab-switcher icon that follows the finger */}
        {rightSwipeOffset > 8 ? (
          <div
            className="pointer-events-none fixed top-1/2 -translate-y-1/2 z-40 flex items-center justify-center rounded-full"
            style={{
              right: `${Math.min(rightSwipeOffset - 24, 60)}px`,
              width: "32px",
              height: "32px",
              backgroundColor: "color-mix(in srgb, var(--color-paper) 80%, transparent)",
              backdropFilter: "blur(12px) saturate(180%)",
              WebkitBackdropFilter: "blur(12px) saturate(180%)",
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              opacity: Math.min(rightSwipeOffset / 80, 1),
              transition: rightSwipeOffset === 0 ? "opacity 0.2s, right 0.2s" : "none",
            }}
          >
            <ChevronRight
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
             without stealing focus. Hairline top edge uses the design
             system's --color-line so it reads as an intentional separator
             on both light + dark themes, not a mismatched color seam. */
          backgroundColor: "color-mix(in srgb, var(--color-paper) 88%, transparent)",
          backdropFilter: "blur(20px) saturate(180%)",
          WebkitBackdropFilter: "blur(20px) saturate(180%)",
          borderTop: "1px solid var(--color-line)",
        }}
        aria-label="Module navigation"
      >
        <div className="mx-auto w-full max-w-[34rem] flex items-stretch px-2 pb-safe">
          {personaTabs.map((tab) => (
            <TabButton
              key={tab.path}
              tab={tab}
              active={tab.path === activeTabPath}
              badge={badgeCounts[tab.path]}
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
        moduleId={activeTab?.module ?? manifestMatchRoute(pathname)?.module ?? "home"}
        persona={persona}
        permissions={companyInfo.permissions}
      />

      {/* ══ TAB SWITCHER — right-edge swipe-left expands, persists as rail ══ */}
      <TabSwitcher
        open={tabSwitcherOpen}
        onCollapse={() => setTabSwitcherOpen(false)}
        onExpand={() => setTabSwitcherOpen(true)}
      />
    </div>
  );
}

/** A bottom tab button — 56px touch target, amber underline for active. */
function TabButton({ tab, active, badge }: { tab: RouteEntry; active: boolean; badge?: number }) {
  const Icon = tab.icon;
  const label = tab.title;
  return (
    <Link
      href={tab.path}
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
        {label}
      </span>
    </Link>
  );
}

/** Minimal cn helper (avoids importing from @/lib/utils which uses cool tokens). */
function cn(...inputs: (string | false | null | undefined)[]): string {
  return inputs.filter(Boolean).join(" ");
}
