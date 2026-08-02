"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Boxes, ChevronLeft, Menu, X, Workflow, Loader2, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { navGroups, navItems, STAGE_COLORS, type NavItem, type WorkspaceNavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/components/command-palette";
import { CompanySwitcher } from "@/components/company-switcher";
import { useSession, signOut as authSignOut } from "@/lib/auth-client";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [companyName, setCompanyName] = useState("Nirman");
  // Companies the user can switch between (hidden in single-company mode).
  const [companies, setCompanies] = useState<{ id: string; name: string; businessType: string | null; parentName: string | null; isCurrent: boolean }[]>([]);
  // Saved playground workspaces become dynamic nav tabs. Fetched client-side so
  // the layout stays PPR-friendly (no server DB access in the root layout).
  const [workspaceNav, setWorkspaceNav] = useState<WorkspaceNavItem[]>([]);
  // Badge counts for nav items (e.g. pending approvals)
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({});
  // Current user's role for role-based nav filtering
  const [userRole, setUserRole] = useState<string>("MANAGER");

  // ── Auth guard ───────────────────────────────────────────────
  // If the session is gone (expired, DB re-seed, manual sign-out),
  // redirect to /sign-in immediately. This runs on every render so
  // a session expiring mid-page doesn't leave the user on a broken UI.
  // In dev mode (AUTH_BYPASS), useSession returns null but we don't
  // redirect because the server-side getSession() returns a synthetic dev user.
  useEffect(() => {
    // Dev mode: skip the client-side auth gate entirely.
    // The server returns a synthetic "dev" user without a real session,
    // so useSession() will return null — that's expected, not an auth failure.
    if (process.env.NODE_ENV !== "production") return;
    if (!sessionLoading && !session) {
      authSignOut().catch(() => {});
      router.replace("/sign-in");
    }
  }, [session, sessionLoading, router]);

  // ── Global 401 interceptor (backup safety net) ──────────────
  // Catches 401s from API calls that happen between session checks
  // (e.g. session expires right after the guard runs). Redirects to
  // /sign-in so the user doesn't see a flood of broken API errors.
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

  // Show a loading spinner while the session is being checked (production only).
  // In dev mode, sessionLoading may be true but we don't want to block the UI
  // because the server-side getSession() handles auth via AUTH_BYPASS.
  if (process.env.NODE_ENV === "production" && sessionLoading && !session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  useEffect(() => {
    let cancelled = false;
    // Fetch company name + switchable companies list
    fetch("/api/company")
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (!cancelled && c?.name) setCompanyName(c.name);
        if (!cancelled && Array.isArray(c?.companies)) setCompanies(c.companies);
      })
      .catch(() => {});
    // Fetch current user's role
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.role) setUserRole(d.role); })
      .catch(() => {});
    // Fetch workspace nav
    fetch("/api/workspaces")
      .then((r) => (r.ok ? r.json() : []))
      .then((ws: { id: string; name: string }[]) => {
        if (!cancelled) {
          setWorkspaceNav(ws.map((w) => ({ label: w.name, href: `/workspaces/${w.id}` })));
        }
      })
      .catch(() => {});
    // Fetch badge counts for nav items that have them
    const badgeEndpoints = navItems.filter((n) => n.badge && (!n.roles || n.roles.includes(userRole)));
    Promise.all(
      badgeEndpoints.map((item) =>
        fetch(item.badge!.endpoint)
          .then((r) => (r.ok ? r.json() : []))
          .then((data) => {
            const count = Array.isArray(data) ? data.length : 0;
            return { href: item.href, count };
          })
          .catch(() => ({ href: item.href, count: 0 })),
      ),
    ).then((results) => {
      if (!cancelled) {
        const map: Record<string, number> = {};
        for (const r of results) {
          if (r.count > 0) map[r.href] = r.count;
        }
        setBadgeCounts(map);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, userRole]);

  // Derive company initials for the avatar
  const initials = companyName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <SidebarContent pathname={pathname} workspaceNav={workspaceNav} badgeCounts={badgeCounts} userRole={userRole} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-sidebar text-sidebar-foreground shadow-2xl">
            <button
              className="absolute right-3 top-3.5 text-sidebar-foreground/60 transition-colors hover:text-white"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent pathname={pathname} workspaceNav={workspaceNav} badgeCounts={badgeCounts} userRole={userRole} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-30 flex h-13 items-center gap-3 border-b border-border/80 bg-card/80 px-4 backdrop-blur-md lg:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold text-foreground lg:hidden"
          >
            <Boxes className="h-5 w-5 text-primary" />
            <span className="text-body">{companyName}</span>
          </Link>
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={() => {
                window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
              }}
              className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-caption text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
              title="Search (⌘K)"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden sm:inline rounded border border-border bg-muted px-1 py-0.5 text-micro font-mono text-muted-foreground">⌘K</kbd>
            </button>
            <span className="hidden text-meta text-muted-foreground sm:inline">
              {companyName}
            </span>
            <CompanySwitcher companies={companies} />
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-caption font-semibold text-background">
              {initials}
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
      <CommandPalette userRole={userRole} />
    </div>
  );
}

function SidebarContent({
  pathname,
  workspaceNav,
  badgeCounts,
  userRole,
  onNavigate,
}: {
  pathname: string;
  workspaceNav: WorkspaceNavItem[];
  badgeCounts: Record<string, number>;
  userRole: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      {/* ── Brand header — minimal ─────────────────────────────────── */}
      <div className="flex h-13 items-center gap-2.5 border-b border-sidebar-border px-4">
        <Link href="/" className="flex items-center gap-2.5" onClick={onNavigate}>
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/10 text-white">
            <Boxes className="h-4 w-4" />
          </span>
          <span className="text-body font-semibold tracking-tight text-white">Nirman</span>
        </Link>
      </div>

      {/* ── Nav — clean, minimal, stage dots ──────────────────────── */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3 scrollbar-thin">
        {navGroups.map((group) => {
          const items = navItems.filter((item) => item.group === group && (!item.roles || item.roles.includes(userRole)));
          if (items.length === 0) return null;
          const stageColor = STAGE_COLORS[group];
          return (
            <div key={group}>
              <div className="flex items-center gap-2 px-3 pb-1.5">
                <span className="h-1 w-1 rounded-full" style={{ backgroundColor: stageColor }} />
                <p className="text-label text-sidebar-foreground/35">{group}</p>
              </div>
              <ul className="space-y-px">
                {items.map((item) => {
                  const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                  const Icon = item.icon;
                  const badge = badgeCounts[item.href];
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        className={cn(
                          "group flex items-center gap-2.5 rounded-md px-3 py-1.5 text-meta font-medium transition-colors",
                          active
                            ? "bg-white/10 text-white"
                            : "text-sidebar-foreground/55 hover:bg-white/5 hover:text-sidebar-foreground/90"
                        )}
                      >
                        <Icon className={cn(
                          "h-4 w-4 shrink-0 transition-colors",
                          active ? "text-white" : "text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70"
                        )} />
                        <span className="flex-1 truncate">{item.label}</span>
                        {badge != null && badge > 0 && (
                          <span className="ml-auto rounded px-1.5 py-px text-micro font-semibold tnum bg-white/10 text-white">
                            {badge > 99 ? "99+" : badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
                {group === "System" && workspaceNav.length > 0 && (
                  <li className="mt-1 space-y-px border-l border-sidebar-border/60 pl-2.5">
                    {workspaceNav.map((w) => {
                      const active = pathname === w.href;
                      return (
                        <Link
                          key={w.href}
                          href={w.href}
                          onClick={onNavigate}
                          className={cn(
                            "group flex items-center gap-2 rounded-md px-2.5 py-1.5 text-caption font-medium transition-colors",
                            active
                              ? "bg-white/10 text-white"
                              : "text-sidebar-foreground/55 hover:bg-white/5 hover:text-sidebar-foreground/90"
                          )}
                        >
                          <Workflow className={cn(
                            "h-3.5 w-3.5 shrink-0",
                            active ? "text-white" : "text-sidebar-foreground/35 group-hover:text-sidebar-foreground/70"
                          )} />
                          <span className="truncate">{w.label}</span>
                        </Link>
                      );
                    })}
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <div className="border-t border-sidebar-border px-4 py-2.5">
        <span className="text-micro text-sidebar-foreground/30">⌘K to search</span>
      </div>
    </>
  );
}
