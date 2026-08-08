"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  personaForRole,
  personaForPath,
  tabColor,
  type PersonaDef,
  type PersonaTab,
} from "@/lib/mobile-nav";
import { useSession, signOut as authSignOut } from "@/lib/auth-client";
import { CommandPalette } from "@/components/command-palette";
import { usePullToRefresh } from "@/components/mobile/use-pull-to-refresh";

/**
 * MobileShell — the /m layout's client root.
 *
 * Responsibilities:
 *  1. Resolve the current user's role (via /api/me) → persona.
 *  2. Render a sticky top header (company mark + search trigger).
 *  3. Render the persona's bottom tab bar with active-tab highlight.
 *  4. Provide a scrollable content area for the page (children).
 *
 * It deliberately does NOT render a sidebar or hamburger drawer — the
 * tab bar + per-screen drill-downs replace navigation on mobile.
 *
 * Auth: mirrors AppShell's production guard + 401 interceptor so /m
 * routes are protected identically to desktop routes.
 */
export function MobileShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = useSession();
  const [persona, setPersona] = useState<PersonaDef | null>(null);
  const [companyName, setCompanyName] = useState("Nirman");
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({});

  // ── Auth guard (all envs; skip only with NEXT_PUBLIC_AUTH_BYPASS) ──
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_AUTH_BYPASS === "true") return;
    if (!sessionLoading && !session) {
      authSignOut().catch(() => {});
      router.replace("/sign-in");
    }
  }, [session, sessionLoading, router]);

  // ── Global 401 interceptor (same net as AppShell) ───────────
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

  // ── Resolve role → persona + company name + tab badges ──────
  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.role) setPersona(personaForRole(d.role));
      })
      .catch(() => {});
    fetch("/api/company")
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (!cancelled && c?.name) setCompanyName(c.name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Tab badge counts (only for the active persona's tabs) ───
  useEffect(() => {
    if (!persona) return;
    let cancelled = false;
    const badgeTabs = persona.tabs.filter((t) => t.badge);
    Promise.all(
      badgeTabs.map((tab) =>
        fetch(tab.badge!.endpoint)
          .then((r) => (r.ok ? r.json() : []))
          .then((data) => ({ href: tab.href, count: Array.isArray(data) ? data.length : 0 }))
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
  }, [persona]);

  // While resolving the persona (first paint), show a minimal loader.
  // Skip the session-loading gate only when NEXT_PUBLIC_AUTH_BYPASS=true.
  if (process.env.NEXT_PUBLIC_AUTH_BYPASS !== "true" && sessionLoading && !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!persona) {
    // Fallback: derive persona from the pathname's owner so the tab bar
    // still renders even before /api/me resolves (e.g. dev bypass).
    const fromPath = personaForPath(pathname);
    if (!fromPath) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }
    // Use the path-derived persona for this render; the /api/me effect
    // will reconcile it once the role resolves.
    return <MobileShellInner persona={fromPath} companyName={companyName} badgeCounts={badgeCounts}>{children}</MobileShellInner>;
  }

  return (
    <MobileShellInner persona={persona} companyName={companyName} badgeCounts={badgeCounts}>
      {children}
    </MobileShellInner>
  );
}

/** Pure presentational shell — used both by the resolved-persona path
 *  and the path-derived fallback. Keeps the render branch single. */
function MobileShellInner({
  persona,
  companyName,
  badgeCounts,
  children,
}: {
  persona: PersonaDef;
  companyName: string;
  badgeCounts: Record<string, number>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const initials = companyName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const activeTab = persona.tabs.find((t) => isActiveTab(pathname, t.href, persona.home));

  // Pull-to-refresh: re-fetches the current page's server data.
  const { pullDistance, refreshing, progress, showIndicator, bind } = usePullToRefresh(
    () => router.refresh(),
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <CommandPalette userRole={persona.roles[0]} />
      {/* ── Top header — brand mark, where you are, search ────
          The world colour sits as a 2px rule under the header, the
          same mark the desktop world panel uses. Wayfinding survives
          the change of device. */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/92 backdrop-blur-md">
        <div className="flex h-12 items-center gap-2 px-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand font-mono text-caption font-bold text-brand-foreground">
            N
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body font-semibold leading-tight text-foreground">
              {activeTab?.label ?? persona.label}
            </span>
            <span className="block truncate text-caption leading-tight text-muted-foreground">
              {companyName}
            </span>
          </span>
          <button
            className="touch flex items-center justify-center rounded-md text-muted-foreground transition-colors active:bg-accent"
            aria-label="Search"
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
          >
            <Search className="h-4 w-4" />
          </button>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-caption font-semibold text-muted-foreground">
            {initials}
          </span>
        </div>
        {activeTab && (
          <span
            className="block h-0.5 w-full"
            style={{ backgroundColor: tabColor(activeTab) }}
          />
        )}
      </header>

      {/* ── Scrollable content ───────────────────────────────
          Pull-to-refresh: touch handlers on the scroll container.
          The indicator sits at the top, translating down with the pull. */}
      <main
        className="relative flex-1 overflow-y-auto pb-[calc(3.5rem+env(safe-area-inset-bottom))]"
        {...bind}
      >
        {showIndicator && (
          <div
            className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-center justify-center"
            style={{ height: `${pullDistance}px` }}
          >
            <RefreshCw
              className={cn(
                "h-5 w-5 text-muted-foreground transition-opacity",
                refreshing && "animate-spin",
              )}
              style={{
                opacity: refreshing ? 1 : progress,
                transform: `rotate(${progress * 180}deg)`,
              }}
            />
          </div>
        )}
        {children}
      </main>

      {/* ── Bottom tab bar — thumb zone, safe-area aware ───── */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
        <div className="mx-auto flex max-w-md items-stretch justify-between">
          {persona.tabs.map((tab) => (
            <TabButton
              key={tab.href}
              tab={tab}
              active={isActiveTab(pathname, tab.href, persona.home)}
              badge={badgeCounts[tab.href]}
            />
          ))}
        </div>
      </nav>
    </div>
  );
}

/**
 * A single bottom tab. 48px tall — past the 44px minimum, compact
 * enough to leave maximum content space. The active tab is marked
 * three ways: a top rule in the world's colour, a tinted icon, and a
 * heavier label. Colour alone is never the only signal.
 */
function TabButton({ tab, active, badge }: { tab: PersonaTab; active: boolean; badge?: number }) {
  const Icon = tab.icon;
  const color = tabColor(tab);
  return (
    <Link
      href={tab.href}
      className={cn(
        "relative flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-micro transition-colors",
        active ? "text-foreground" : "text-muted-foreground active:bg-muted",
      )}
    >
      {active && (
        <span
          className="absolute inset-x-3 top-0 h-0.5 rounded-b-full"
          style={{ backgroundColor: color }}
        />
      )}
      <span className="relative">
        <Icon className="h-[17px] w-[17px]" style={active ? { color } : undefined} />
        {badge != null && badge > 0 && (
          <span className="absolute -right-2 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold tnum text-white ring-2 ring-card">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span className={cn("max-w-full truncate leading-none", active && "font-semibold")}>
        {tab.label}
      </span>
    </Link>
  );
}

/** Determine whether a tab is active for the current pathname. */
function isActiveTab(pathname: string, tabHref: string, personaHome: string): boolean {
  // The persona home tab is active only on the exact home path.
  if (tabHref === personaHome) return pathname === personaHome;
  // Otherwise active if the pathname starts with the tab's href.
  return pathname === tabHref || pathname.startsWith(tabHref + "/");
}

/** Re-exported for /m/page.tsx server-side redirect logic. */
export { personaForRole };
