"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronsLeft,
  Menu,
  X,
  Workflow,
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
  type WorkspaceNavItem,
} from "@/lib/nav";
import { cn } from "@/lib/utils";
import { CommandPalette } from "@/components/command-palette";
import { CompanySwitcher } from "@/components/company-switcher";
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
  const [workspaceNav, setWorkspaceNav] = useState<WorkspaceNavItem[]>([]);
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

    fetch("/api/workspaces")
      .then((r) => (r.ok ? r.json() : []))
      .then((ws: { id: string; name: string }[]) => {
        if (!cancelled) setWorkspaceNav(ws.map((w) => ({ label: w.name, href: `/workspaces/${w.id}` })));
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

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── World rail — always visible, 56px, dark ──────────────── */}
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
          workspaceNav={workspaceNav}
          onCollapse={togglePanel}
          className="nav-panel fixed inset-y-0 left-14 z-30 w-56"
        />
      ) : (
        <WorldPanel
          world={activeWorld}
          pathname={pathname}
          badgeCounts={badgeCounts}
          workspaceNav={workspaceNav}
          onCollapse={togglePanel}
          className="nav-panel fixed inset-y-0 left-14 z-30 w-56"
        />
      )}

      {/* ── Mobile drawer — rail + panel together ────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-foreground/30 backdrop-blur-sm"
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
                workspaceNav={workspaceNav}
                onNavigate={() => setMobileOpen(false)}
                className="flex w-60"
              />
            ) : (
              <WorldPanel
                world={activeWorld}
                pathname={pathname}
                badgeCounts={badgeCounts}
                workspaceNav={workspaceNav}
                onNavigate={() => setMobileOpen(false)}
                className="flex w-60"
              />
            )}
          </div>
          <button
            className="absolute right-4 top-4 rounded-md bg-card p-2 text-muted-foreground shadow-raised"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Main ─────────────────────────────────────────────────── */}
      <div className="nav-main flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-md lg:px-6">
          <button
            className="touch -ml-1 flex items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Only visible while the panel is collapsed — see `.nav-expand` */}
          <button
            onClick={togglePanel}
            className="nav-expand items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Show navigation"
          >
            <Menu className="h-4 w-4" />
          </button>

          {/* Breadcrumb — world, then page. The dot carries the colour. */}
          <nav className="flex min-w-0 items-center gap-2 text-meta">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: onSettings ? "var(--color-world-admin)" : activeWorld.color }}
            />
            {onSettings ? (
              <Link
                href="/settings"
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              >
                Settings
              </Link>
            ) : (
              <Link
                href={activeWorld.href}
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
              >
                {activeWorld.label}
              </Link>
            )}
            {activeLink && activeLink.href !== activeWorld.href && !onSettings && (
              <>
                <span className="text-border">/</span>
                <span className="truncate font-medium text-foreground">{activeLink.label}</span>
              </>
            )}
            {onSettings && pathname !== "/settings" && (
              <>
                <span className="text-border">/</span>
                <span className="truncate font-medium text-foreground">
                  {settingsLinks.find((l) => pathname.startsWith(l.href) && l.href !== "/settings")?.label ?? "Settings"}
                </span>
              </>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
              className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-caption text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
              title="Search anything (⌘K)"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden rounded border border-border bg-muted px-1 py-px font-mono text-micro text-muted-foreground sm:inline">
                ⌘K
              </kbd>
            </button>
            <CompanySwitcher companies={companies} />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>

      <CommandPalette userRole={userRole} />
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

  return (
    <aside className={cn("w-14 flex-col items-center bg-sidebar py-3", className)}>
      {/* Brand mark — the one place ochre fills a shape */}
      <Link
        href="/"
        className="mb-4 flex h-8 w-8 items-center justify-center rounded-md bg-brand font-mono text-body font-bold text-brand-foreground"
        title={companyName}
      >
        N
      </Link>

      <nav className="flex flex-1 flex-col items-center gap-1">
        {worlds.map((w) => {
          const active = w.key === activeKey;
          const Icon = w.icon;
          const count = worldBadge(w);
          return (
            <Link
              key={w.key}
              href={w.href}
              title={`${w.label} — ${w.tagline}`}
              className={cn(
                "group relative flex h-9 w-9 items-center justify-center rounded-md transition-colors",
                active ? "bg-white/10 text-white" : "text-sidebar-foreground/45 hover:bg-white/5 hover:text-sidebar-foreground",
              )}
            >
              {/* Active indicator — world colour, 2px, flush left */}
              {active && (
                <span
                  className="absolute -left-[9px] h-5 w-0.5 rounded-full"
                  style={{ backgroundColor: w.color }}
                />
              )}
              <Icon className="h-[18px] w-[18px]" />
              {count > 0 && (
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-brand ring-2 ring-sidebar" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Settings gear — not a world, always at the bottom. Only shown
          if the role has at least one settings link. */}
      {settingsLinks.length > 0 && (
        <div className="mt-2 flex flex-col items-center gap-1 border-t border-white/10 pt-2">
          <Link
            href="/settings"
            title="Settings"
            className={cn(
              "group relative flex h-9 w-9 items-center justify-center rounded-md transition-colors",
              onSettings
                ? "bg-white/10 text-white"
                : "text-sidebar-foreground/45 hover:bg-white/5 hover:text-sidebar-foreground",
            )}
          >
            {onSettings && (
              <span
                className="absolute -left-[9px] h-5 w-0.5 rounded-full"
                style={{ backgroundColor: "var(--color-world-admin)" }}
              />
            )}
            <Settings className="h-[18px] w-[18px]" />
          </Link>
        </div>
      )}

      <div className="mt-3 flex flex-col items-center gap-2">
        <button
          onClick={() => authSignOut().then(() => (window.location.href = "/sign-in"))}
          className="flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground/35 transition-colors hover:bg-white/5 hover:text-sidebar-foreground"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-micro font-semibold text-white"
          title={`${userName || "You"} · ${userRole}`}
        >
          {initials}
        </span>
      </div>
    </aside>
  );
}

// ── World panel ───────────────────────────────────────────────────

function WorldPanel({
  world,
  pathname,
  badgeCounts,
  workspaceNav,
  onNavigate,
  onCollapse,
  className,
}: {
  world: World;
  pathname: string;
  badgeCounts: Record<string, number>;
  workspaceNav: WorkspaceNavItem[];
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
          className={cn(
            "group flex items-center gap-2.5 rounded-md px-2 py-[7px] text-meta transition-colors",
            active
              ? "bg-accent font-semibold text-foreground"
              : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Icon
            className={cn("h-4 w-4 shrink-0", active ? "" : "text-muted-foreground/60")}
            style={active ? { color: world.color } : undefined}
          />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {badge != null && badge > 0 && (
            <span
              className={cn(
                "shrink-0 rounded px-1.5 py-px text-micro font-semibold tnum",
                active ? "bg-foreground text-background" : "bg-brand-soft text-brand",
              )}
            >
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </Link>

        {/* Saved workspaces nest under their parent link */}
        {item.href === "/playground" && workspaceNav.length > 0 && (
          <ul className="ml-4 mt-px space-y-px border-l border-border pl-2">
            {workspaceNav.map((w) => (
              <li key={w.href}>
                <Link
                  href={w.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-caption transition-colors",
                    pathname === w.href
                      ? "bg-accent font-semibold text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Workflow className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                  <span className="truncate">{w.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div className={cn("flex-col border-r border-border bg-card", className)}>
      {/* World identity — title + the one-line explanation of the world */}
      <div className="relative border-b border-border px-4 pb-3 pt-3.5">
        <span
          className="absolute left-0 top-0 h-0.5 w-full"
          style={{ backgroundColor: world.color }}
        />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-section text-foreground">{world.label}</h2>
            <p className="mt-0.5 text-caption leading-snug text-muted-foreground">{world.tagline}</p>
          </div>
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="-mr-1 -mt-0.5 shrink-0 rounded p-1 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Collapse navigation"
              title="Collapse"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
        {world.sections
          .map((s) => ({ ...s, items: s.items.filter((i) => !i.hidden) }))
          .filter((s) => s.items.length > 0)
          .map((section, si, arr) => (
            <div key={section.label} className={cn(si > 0 && "mt-4")}>
              {/* A section label is only worth its space if the world has
                  more than one section — otherwise it's noise. */}
              {arr.length > 1 && (
                <p className="px-2 pb-1 text-label text-muted-foreground/55">{section.label}</p>
              )}
              <ul className="space-y-px">
                {section.items.map((item) => renderItem(item))}
              </ul>
            </div>
          ))}
      </nav>

      <div className="border-t border-border px-3 py-2">
        <span className="text-micro text-muted-foreground/60">⌘K to search anything</span>
      </div>
    </div>
  );
}

// ── Settings panel ─────────────────────────────────────────────────

function SettingsPanel({
  links,
  pathname,
  workspaceNav,
  onNavigate,
  onCollapse,
  className,
}: {
  links: NavLink[];
  pathname: string;
  workspaceNav: WorkspaceNavItem[];
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
          className={cn(
            "group flex items-center gap-2.5 rounded-md px-2 py-[7px] text-meta transition-colors",
            active
              ? "bg-accent font-semibold text-foreground"
              : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          <Icon
            className={cn("h-4 w-4 shrink-0", active ? "" : "text-muted-foreground/60")}
            style={active ? { color: settingsColor } : undefined}
          />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
        </Link>

        {/* Saved workspaces nest under the Workspaces link */}
        {item.href === "/playground" && workspaceNav.length > 0 && (
          <ul className="ml-4 mt-px space-y-px border-l border-border pl-2">
            {workspaceNav.map((w) => (
              <li key={w.href}>
                <Link
                  href={w.href}
                  onClick={onNavigate}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-caption transition-colors",
                    pathname === w.href
                      ? "bg-accent font-semibold text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Workflow className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                  <span className="truncate">{w.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div className={cn("flex-col border-r border-border bg-card", className)}>
      <div className="relative border-b border-border px-4 pb-3 pt-3.5">
        <span
          className="absolute left-0 top-0 h-0.5 w-full"
          style={{ backgroundColor: settingsColor }}
        />
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-section text-foreground">Settings</h2>
            <p className="mt-0.5 text-caption leading-snug text-muted-foreground">
              Company, access and automation
            </p>
          </div>
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="-mr-1 -mt-0.5 shrink-0 rounded p-1 text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Collapse navigation"
              title="Collapse"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 scrollbar-thin">
        <ul className="space-y-px">
          {links.map((item) => renderItem(item))}
        </ul>
      </nav>

      <div className="border-t border-border px-3 py-2">
        <span className="text-micro text-muted-foreground/60">⌘K to search anything</span>
      </div>
    </div>
  );
}
