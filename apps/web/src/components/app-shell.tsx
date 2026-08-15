"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronRight,
  ChevronsLeft,
  Menu,
  PanelLeft,
  X,
  Loader2,
  Search,
  LogOut,
  Settings,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  worldsFor,
  worldForPath,
  linkForPath,
  badgeLinksFor,
  settingsLinksFor,
  isSettingsPath,
  type World,
  type NavLink,
} from "@/lib/nav";
import { cn } from "@/lib/utils";
import { CommandPalette } from "@/components/command-palette";
import { AssistantChat } from "@/components/mobile/assistant/assistant-chat";
import { CompanySwitcher } from "@/components/company-switcher";
import { AlertBell } from "@/components/alert-bell";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { CurrencyToggle } from "@/components/currency-toggle";
import { BuildNavPanel } from "@/components/build/build-nav-panel";
import { useSession, signOut as authSignOut } from "@/lib/auth-client";

/**
 * ═══════════════════════════════════════════════════════════════════
 * APP SHELL — a rail of worlds, then one world at a time
 *
 * The old shell showed 45 links in a single scrolling column. You had
 * to read the whole sidebar to find anything, and the sidebar looked
 * identical no matter what you were doing.
 *
 * This shell has two levels:
 *
 *   ┌────┬──────────────┬──────────────────────────────┐
 *   │ ▮  │  MATERIALS   │  breadcrumb      ⌘K  co  ●   │
 *   │ ▮  │  raw material│──────────────────────────────│
 *   │ ▮  │              │                              │
 *   │ ▮  │  Ask & buy   │        page content          │
 *   │ ▮  │   · Requisit │                              │
 *   │ ▮  │   · Orders   │                              │
 *   └────┴──────────────┴──────────────────────────────┘
 *     ↑         ↑
 *   worlds   this world only (5–8 links, never more)
 *
 * The rail is dark (chrome); the world panel is light (content-
 * adjacent). That contrast is what makes "which world am I in" a
 * pre-attentive fact rather than something you have to read.
 *
 * The world's colour appears in exactly three places: the rail
 * indicator, the panel's top rule, and the breadcrumb dot. Never a
 * filled surface.
 * ═══════════════════════════════════════════════════════════════════
 */

const PANEL_KEY = "nirman.nav.panel";

/** True only for the mobile route group (/m, /m/…), not /materials etc. */
function isMobileRoute(pathname: string): boolean {
  return pathname === "/m" || pathname.startsWith("/m/");
}

/** Auth/public pages that render their own full-screen layout — no shell. */
function isAuthRoute(pathname: string): boolean {
  return pathname === "/sign-in" || pathname.startsWith("/sign-in/");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [companyName, setCompanyName] = useState("Nirman");
  const [companies, setCompanies] = useState<
    { id: string; name: string; businessType: string | null; parentName: string | null; isCurrent: boolean }[]
  >([]);
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({});
  const [userRole, setUserRole] = useState<string>("MANAGER");
  const [userName, setUserName] = useState<string>("");

  // ── Auth guard ───────────────────────────────────────────────
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!sessionLoading && !session) {
      authSignOut().catch(() => {});
      router.replace("/sign-in");
    }
  }, [session, sessionLoading, router]);

  // ── Global 401 interceptor ──────────────────────────────────
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

  /**
   * Collapse is a presentation preference, so it lives in the DOM (a root
   * data attribute + CSS) rather than in React state. The inline script in
   * the document head applies it before paint, which means no flash on
   * reload and no state restored from inside an effect.
   */
  function togglePanel() {
    const root = document.documentElement;
    const collapsed = root.dataset.nav === "collapsed";
    root.dataset.nav = collapsed ? "open" : "collapsed";
    try {
      localStorage.setItem(PANEL_KEY, collapsed ? "open" : "closed");
    } catch {
      /* private mode — the preference just won't persist */
    }
  }

  // ── Context fetches ─────────────────────────────────────────
  useEffect(() => {
    if (isMobileRoute(pathname) || isAuthRoute(pathname)) return;
    let cancelled = false;

    fetch("/api/company")
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (cancelled) return;
        if (c?.name) setCompanyName(c.name);
        if (Array.isArray(c?.companies)) setCompanies(c.companies);
      })
      .catch(() => {});

    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        if (d?.role) setUserRole(d.role);
        if (d?.name) setUserName(d.name);
      })
      .catch(() => {});

    Promise.all(
      badgeLinksFor(userRole).map((item) =>
        fetch(item.badge!.endpoint)
          .then((r) => (r.ok ? r.json() : []))
          .then((data) => ({ href: item.href, count: Array.isArray(data) ? data.length : 0 }))
          .catch(() => ({ href: item.href, count: 0 })),
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
  }, [pathname, userRole]);

  // ── Update document title to the current company name ──────
  // The layout's static metadata says "Nirman Inventory OS" (the product
  // name). Once we know the active company, the tab title becomes
  // "{companyName} · Nirman OS" so a user with multiple companies can
  // tell which books they're looking at from the browser tab.
  useEffect(() => {
    if (companyName && companyName !== "Nirman") {
      document.title = `${companyName} · Nirman OS`;
    } else {
      document.title = "Nirman Inventory OS";
    }
  }, [companyName]);

  // ── Re-fetch company info when the user switches company ──
  // The CompanySwitcher dispatches a "nirman-company-switched" event
  // after a successful switch. We listen for it and re-fetch /api/company
  // to update the brand mark, document title, and switcher list.
  useEffect(() => {
    if (isMobileRoute(pathname) || isAuthRoute(pathname)) return;
    function onCompanySwitched() {
      fetch("/api/company")
        .then((r) => (r.ok ? r.json() : null))
        .then((c) => {
          if (c?.name) {
            setCompanyName(c.name);
            // Set the title immediately — router.refresh() in the
            // switcher may re-apply Next.js metadata and overwrite it.
            const newTitle = c.name !== "Nirman" ? `${c.name} · Nirman OS` : "Nirman Inventory OS";
            document.title = newTitle;
            setTimeout(() => { document.title = newTitle; }, 300);
          }
          if (Array.isArray(c?.companies)) setCompanies(c.companies);
        })
        .catch(() => {});
    }
    window.addEventListener("nirman-company-switched", onCompanySwitched);
    return () => window.removeEventListener("nirman-company-switched", onCompanySwitched);
  }, [pathname]);

  // Mobile routes render their own shell.
  if (isMobileRoute(pathname)) return <>{children}</>;

  // Auth/public pages render their own full-screen layout — no nav chrome.
  if (isAuthRoute(pathname)) return <>{children}</>;

  if (process.env.NODE_ENV === "production" && sessionLoading && !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const worlds = worldsFor(userRole);
  const onSettings = isSettingsPath(pathname);
  const activeWorld = onSettings ? (worlds[0] ?? worldForPath(pathname)) : worldForPath(pathname);
  const activeLink = linkForPath(pathname);
  const settingsLinks = settingsLinksFor(userRole);

  // A world shows a dot on the rail if anything inside it needs attention.
  const worldBadge = (w: World) =>
    w.sections
      .flatMap((s) => s.items)
      .reduce((sum, i) => sum + (badgeCounts[i.href] ?? 0), 0);

  // ── Build alert items for the AlertBell ───────────────────────
  // Map each badge link to an urgency level based on its href.
  const alertItems = badgeLinksFor(userRole)
    .filter((link) => (badgeCounts[link.href] ?? 0) > 0)
    .map((link) => {
      const href = link.href;
      const count = badgeCounts[href] ?? 0;
      // Approvals and submitted requisitions are blocking.
      // POs in progress and pending tasks are "soon".
      const urgency: "blocking" | "soon" | "info" =
        href === "/approvals" || href === "/requisitions" ? "blocking" : "soon";
      // Use a shorter label for the bell dropdown
      const label = link.label;
      return { href, label, count, urgency };
    });

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── World rail — always visible, 64px, dark ──────────────── */}
      <WorldRail
        worlds={worlds}
        activeKey={activeWorld.key}
        worldBadge={worldBadge}
        companyName={companyName}
        userName={userName}
        userRole={userRole}
        settingsLinks={settingsLinks}
        onSettings={onSettings}
        className="fixed inset-y-0 left-0 z-40 hidden lg:flex"
      />

      {/* ── World panel — the current world's links ────────────────
          Always rendered; `.nav-panel` + the root data attribute decide
          whether it's shown, so the preference applies before paint. */}
      {onSettings ? (
        <SettingsPanel
          links={settingsLinks}
          pathname={pathname}
          onCollapse={togglePanel}
          className="nav-panel fixed inset-y-0 left-16 z-30 w-56"
        />
      ) : activeWorld.key === "build" ? (
        <BuildNavPanel
          world={activeWorld}
          pathname={pathname}
          badgeCounts={badgeCounts}
          onCollapse={togglePanel}
          className="nav-panel fixed inset-y-0 left-16 z-30 w-56"
        />
      ) : (
        <WorldPanel
          world={activeWorld}
          pathname={pathname}
          badgeCounts={badgeCounts}
          onCollapse={togglePanel}
          className="nav-panel fixed inset-y-0 left-16 z-30 w-56"
        />
      )}

      {/* ── Mobile drawer — rail + panel together ────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="drawer-backdrop absolute inset-0 bg-foreground/40 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex shadow-overlay">
            <WorldRail
              worlds={worlds}
              activeKey={activeWorld.key}
              worldBadge={worldBadge}
              companyName={companyName}
              userName={userName}
              userRole={userRole}
              settingsLinks={settingsLinks}
              onSettings={onSettings}
              className="flex"
            />
            {onSettings ? (
              <SettingsPanel
                links={settingsLinks}
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
                className="flex w-60"
              />
            ) : activeWorld.key === "build" ? (
              <BuildNavPanel
                world={activeWorld}
                pathname={pathname}
                badgeCounts={badgeCounts}
                onNavigate={() => setMobileOpen(false)}
                className="flex w-60"
              />
            ) : (
              <WorldPanel
                world={activeWorld}
                pathname={pathname}
                badgeCounts={badgeCounts}
                onNavigate={() => setMobileOpen(false)}
                className="flex w-60"
              />
            )}
          </div>
          <button
            className="absolute right-4 top-3.5 flex size-9 items-center justify-center rounded-full border border-border bg-elevated text-muted-foreground shadow-floating transition-colors hover:text-foreground"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* ── Main ─────────────────────────────────────────────────── */}
      <div className="nav-main flex min-w-0 flex-1 flex-col">
        {/*
          TOPBAR — 52px, and it holds only things that are true on every
          page: where you are, how to find anything, what needs you, and
          which company's books you're looking at.

          The search field is a *field*, not an icon. It is the fastest
          route to any of the 144 pages and 20k records in here, and an
          18px magnifier in a corner does not communicate that. It reads
          as the primary affordance in the bar, because it is.
        */}
        <header className="sticky top-0 z-20 flex h-[52px] shrink-0 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur-xl lg:px-6 no-print">
          <button
            className="-ml-1.5 flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-[18px]" />
          </button>

          {/* Only visible while the panel is collapsed — see `.nav-expand` */}
          <button
            onClick={togglePanel}
            className="nav-expand -ml-1.5 size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Show navigation"
            title="Show navigation"
          >
            <PanelLeft className="size-4" />
          </button>

          {/* Breadcrumb — world, then page. The dot carries the colour. */}
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-meta">
            <span
              className="size-1.5 shrink-0 rounded-full"
              style={{
                backgroundColor: onSettings ? "var(--color-world-admin)" : activeWorld.color,
              }}
            />
            {onSettings ? (
              <Link
                href="/settings"
                className="shrink-0 font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Settings
              </Link>
            ) : (
              <Link
                href={activeWorld.href}
                className="shrink-0 font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {activeWorld.label}
              </Link>
            )}
            {activeLink && activeLink.href !== activeWorld.href && !onSettings && (
              <>
                <ChevronRight className="size-3 shrink-0 text-faint" />
                <span className="truncate font-semibold text-foreground">{activeLink.label}</span>
              </>
            )}
            {onSettings && pathname !== "/settings" && (
              <>
                <ChevronRight className="size-3 shrink-0 text-faint" />
                <span className="truncate font-semibold text-foreground">
                  {settingsLinks.find((l) => pathname.startsWith(l.href) && l.href !== "/settings")
                    ?.label ?? "Settings"}
                </span>
              </>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() =>
                window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))
              }
              className={cn(
                "group flex h-8 items-center gap-2 rounded-md border border-input bg-card pl-2.5 pr-1.5 text-meta",
                "text-muted-foreground shadow-raised transition-colors",
                "hover:border-border-strong hover:text-foreground",
                "w-8 justify-center sm:w-56 sm:justify-start lg:w-64",
              )}
              title="Search anything (⌘K)"
            >
              <Search className="size-3.5 shrink-0" />
              <span className="hidden sm:inline">Search or jump to…</span>
              <kbd className="kbd ml-auto hidden sm:inline-flex">⌘K</kbd>
            </button>
            <AlertBell items={alertItems} />
            <NotificationBell />
            <CurrencyToggle tone="surface" />
            <ThemeToggle tone="surface" />
            <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
            <CompanySwitcher companies={companies} />
          </div>
        </header>

        {/*
          The measure cap lives here rather than on each page. 1400px is
          about 150 characters at our body size — past that a table row's
          first and last cell stop being readable as the same row.
        */}
        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-7">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>

      <CommandPalette userRole={userRole} />

      {/* ── Owner Assistant — floating chat with voice (Hindi/English) ── */}
      <AssistantChat />
    </div>
  );
}

// ── World rail ────────────────────────────────────────────────────

function WorldRail({
  worlds,
  activeKey,
  worldBadge,
  companyName,
  userName,
  userRole,
  settingsLinks,
  onSettings,
  className,
}: {
  worlds: World[];
  activeKey: string;
  worldBadge: (w: World) => number;
  companyName: string;
  userName: string;
  userRole: string;
  settingsLinks: NavLink[];
  onSettings: boolean;
  className?: string;
}) {
  const initials =
    (userName || companyName)
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "N";

  // The brand mark shows the first letter of the current company name,
  // so a user with multiple companies can tell at a glance which books
  // they're looking at. Falls back to "N" (for Nirman OS) before the
  // company name is fetched or if it's empty.
  const brandMark = (companyName || "Nirman").charAt(0).toUpperCase();

  /**
   * The rail is the only piece of chrome present on literally every
   * screen, so it earns two changes over v1:
   *
   *  · Each world now carries a 3-letter label under its icon. An icon
   *    alone is a memory test — five near-identical grey glyphs, and new
   *    users hover every one of them to find "Finance". A label costs
   *    8px of height and removes the test entirely.
   *  · The active world is marked by a filled tile *and* a world-coloured
   *    rule, so "which floor am I on" survives both a glance and a
   *    colour-vision deficiency.
   */
  return (
    <aside
      className={cn(
        "w-16 flex-col items-center gap-1 border-r border-sidebar-border bg-sidebar py-2.5",
        className,
      )}
    >
      {/* Brand mark — the one place amber fills a shape */}
      <Link
        href="/"
        className={cn(
          "mb-2 flex size-9 items-center justify-center rounded-lg bg-brand font-mono text-[15px] font-bold",
          "text-brand-foreground shadow-raised transition-transform hover:scale-105",
        )}
        title={companyName}
      >
        {brandMark}
      </Link>

      <nav className="flex w-full flex-1 flex-col items-center gap-0.5 px-1.5">
        {worlds.map((w) => {
          const active = w.key === activeKey;
          const Icon = w.icon;
          const count = worldBadge(w);
          return (
            <Link
              key={w.key}
              href={w.href}
              title={`${w.label} — ${w.tagline}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex w-full flex-col items-center gap-1 rounded-lg py-2 transition-colors",
                active
                  ? "bg-sidebar-accent text-white"
                  : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              {/* Active indicator — world colour, 2px, flush to the rail edge */}
              {active && (
                <span
                  className="absolute -left-1.5 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full"
                  style={{ backgroundColor: w.color }}
                />
              )}
              <span className="relative">
                <Icon className="size-[18px]" style={active ? { color: w.color } : undefined} />
                {count > 0 && (
                  <span className="absolute -right-1.5 -top-1 size-2 rounded-full bg-brand ring-2 ring-sidebar" />
                )}
              </span>
              <span
                className={cn(
                  "max-w-full truncate text-[9px] font-semibold uppercase leading-none tracking-wide",
                  active ? "text-white/85" : "text-sidebar-muted/80",
                )}
              >
                {w.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Settings gear — not a world, always at the bottom. Only shown
          if the role has at least one settings link. */}
      {settingsLinks.length > 0 && (
        <div className="mt-1 w-full border-t border-sidebar-border px-1.5 pt-1.5">
          <Link
            href="/settings"
            title="Settings"
            className={cn(
              "group relative flex w-full items-center justify-center rounded-lg py-2 transition-colors",
              onSettings
                ? "bg-sidebar-accent text-white"
                : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            {onSettings && (
              <span
                className="absolute -left-1.5 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full"
                style={{ backgroundColor: "var(--color-world-admin)" }}
              />
            )}
            <Settings className="size-[18px]" />
          </Link>
        </div>
      )}

      <div className="mt-1.5 flex flex-col items-center gap-1.5">
        <CurrencyToggle />
        <ThemeToggle />
        <button
          onClick={() => authSignOut().then(() => (window.location.href = "/sign-in"))}
          className="flex size-8 items-center justify-center rounded-md text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          title="Sign out"
        >
          <LogOut className="size-4" />
        </button>
        <Link
          href="/"
          className={cn(
            "flex size-8 items-center justify-center rounded-full bg-sidebar-accent text-[10px] font-bold",
            "text-sidebar-foreground ring-1 ring-inset ring-white/10 transition-colors hover:bg-brand hover:text-brand-foreground",
          )}
          title={`${userName || "You"} · ${userRole}`}
        >
          {initials}
        </Link>
      </div>
    </aside>
  );
}

// ── World panel ───────────────────────────────────────────────────

function WorldPanel({
  world,
  pathname,
  badgeCounts,
  onNavigate,
  onCollapse,
  className,
}: {
  world: World;
  pathname: string;
  badgeCounts: Record<string, number>;
  onNavigate?: () => void;
  onCollapse?: () => void;
  className?: string;
}) {
  /** Renders one nav link — shared by the branching and flat layouts. */
  function renderItem(item: NavLink) {
    const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
    const Icon = item.icon;
    const badge = badgeCounts[item.href];
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={onNavigate}
          title={item.hint}
          aria-current={active ? "page" : undefined}
          className={cn(
            "group relative flex items-center gap-2.5 rounded-md py-2 pl-2.5 pr-2 text-[13px] transition-colors",
            active
              ? "bg-accent font-semibold text-foreground"
              : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {/* The active item carries the world colour as a 2px stub, so
              the panel echoes the rail's wayfinding rather than inventing
              a second visual language for "you are here". */}
          {active && (
            <span
              className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full"
              style={{ backgroundColor: world.color }}
            />
          )}
          <Icon
            className={cn("size-4 shrink-0", !active && "text-faint group-hover:text-muted-foreground")}
            style={active ? { color: world.color } : undefined}
          />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {badge != null && badge > 0 && (
            <span
              className={cn(
                "inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1",
                "text-[10px] font-semibold tabular-nums leading-none",
                active ? "bg-foreground text-background" : "bg-brand-soft text-brand-strong",
              )}
            >
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </Link>
      </li>
    );
  }

  return (
    <div className={cn("flex-col border-r border-border bg-card", className)}>
      {/* World identity — title + the one-line explanation of the world */}
      <div className="relative shrink-0 border-b border-border px-3.5 pb-3.5 pt-4">
        <span
          className="absolute left-0 top-0 h-[3px] w-full"
          style={{ backgroundColor: world.color }}
        />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-tight tracking-[-0.015em] text-foreground">
              {world.label}
            </h2>
            <p className="mt-1 text-caption leading-snug text-muted-foreground">{world.tagline}</p>
          </div>
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="-mr-1 -mt-1 shrink-0 rounded-md p-1.5 text-faint transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Collapse navigation"
              title="Collapse navigation"
            >
              <ChevronsLeft className="size-4" />
            </button>
          )}
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
        {world.sections
          .map((s) => ({ ...s, items: s.items.filter((i) => !i.hidden) }))
          .filter((s) => s.items.length > 0)
          .map((section, si, arr) => (
            <div key={section.label} className={cn(si > 0 && "mt-5")}>
              {/* A section label is only worth its space if the world has
                  more than one section — otherwise it's noise. */}
              {arr.length > 1 && (
                <p className="mb-1.5 px-2.5 text-label text-faint">{section.label}</p>
              )}
              <ul className="space-y-0.5">{section.items.map((item) => renderItem(item))}</ul>
            </div>
          ))}
      </nav>

      <div className="shrink-0 border-t border-border px-3 py-2.5">
        <span className="flex items-center gap-1.5 text-caption text-faint">
          <kbd className="kbd">⌘K</kbd> to search anything
        </span>
      </div>
    </div>
  );
}

// ── Settings panel ─────────────────────────────────────────────────

function SettingsPanel({
  links,
  pathname,
  onNavigate,
  onCollapse,
  className,
}: {
  links: NavLink[];
  pathname: string;
  onNavigate?: () => void;
  onCollapse?: () => void;
  className?: string;
}) {
  const settingsColor = "var(--color-world-admin)";

  function renderItem(item: NavLink) {
    const active = pathname.startsWith(item.href);
    const Icon = item.icon;
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          onClick={onNavigate}
          title={item.hint}
          aria-current={active ? "page" : undefined}
          className={cn(
            "group relative flex items-center gap-2.5 rounded-md py-2 pl-2.5 pr-2 text-[13px] transition-colors",
            active
              ? "bg-accent font-semibold text-foreground"
              : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {active && (
            <span
              className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full"
              style={{ backgroundColor: settingsColor }}
            />
          )}
          <Icon
            className={cn("size-4 shrink-0", !active && "text-faint group-hover:text-muted-foreground")}
            style={active ? { color: settingsColor } : undefined}
          />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
        </Link>
      </li>
    );
  }

  return (
    <div className={cn("flex-col border-r border-border bg-card", className)}>
      <div className="relative shrink-0 border-b border-border px-3.5 pb-3.5 pt-4">
        <span
          className="absolute left-0 top-0 h-[3px] w-full"
          style={{ backgroundColor: settingsColor }}
        />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-tight tracking-[-0.015em] text-foreground">
              Settings
            </h2>
            <p className="mt-1 text-caption leading-snug text-muted-foreground">
              Company, access and automation
            </p>
          </div>
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="-mr-1 -mt-1 shrink-0 rounded-md p-1.5 text-faint transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Collapse navigation"
              title="Collapse navigation"
            >
              <ChevronsLeft className="size-4" />
            </button>
          )}
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
        <ul className="space-y-0.5">{links.map((item) => renderItem(item))}</ul>
      </nav>

      <div className="shrink-0 border-t border-border px-3 py-2.5">
        <span className="flex items-center gap-1.5 text-caption text-faint">
          <kbd className="kbd">⌘K</kbd> to search anything
        </span>
      </div>
    </div>
  );
}
