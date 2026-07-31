"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, ChevronLeft, Menu, X, Workflow } from "lucide-react";
import { useEffect, useState } from "react";
import { navGroups, navItems, type NavItem, type WorkspaceNavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [companyName, setCompanyName] = useState("Nirman");
  // Saved playground workspaces become dynamic nav tabs. Fetched client-side so
  // the layout stays PPR-friendly (no server DB access in the root layout).
  const [workspaceNav, setWorkspaceNav] = useState<WorkspaceNavItem[]>([]);
  // Badge counts for nav items (e.g. pending approvals)
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({});
  // Current user's role for role-based nav filtering
  const [userRole, setUserRole] = useState<string>("MANAGER");

  useEffect(() => {
    let cancelled = false;
    // Fetch company name
    fetch("/api/company")
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => { if (!cancelled && c?.name) setCompanyName(c.name); })
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
            <span className="hidden text-meta text-muted-foreground sm:inline">
              {companyName}
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-caption font-semibold text-primary">
              {initials}
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
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
      <div className="flex h-13 items-center gap-2.5 border-b border-sidebar-border px-4">
        <Link href="/" className="flex items-center gap-2.5" onClick={onNavigate}>
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Boxes className="h-[18px] w-[18px]" />
          </span>
          <span className="text-body font-semibold tracking-tight text-white">
            Nirman Inventory
          </span>
        </Link>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-2.5 py-4 scrollbar-thin">
        {navGroups.map((group) => {
          const items = navItems.filter((item) => item.group === group && (!item.roles || item.roles.includes(userRole)));
          if (items.length === 0) return null;
          return (
            <div key={group}>
              <p className="px-3 pb-1.5 text-micro font-semibold uppercase tracking-wider text-sidebar-foreground/35">
                {group}
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active =
                    item.href === "/"
                      ? pathname === "/"
                      : pathname.startsWith(item.href);
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
                            ? "bg-sidebar-accent text-white"
                            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-white"
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0 transition-colors",
                            active
                              ? "text-primary-foreground/90"
                              : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80"
                          )}
                        />
                        <span className="flex-1 truncate">{item.label}</span>
                        {badge != null && badge > 0 && (
                          <span
                            className={cn(
                              "ml-auto inline-flex h-4.5 min-w-[18px] items-center justify-center rounded-full px-1.5 text-micro font-semibold",
                              active
                                ? "bg-white/20 text-white"
                                : "bg-primary/80 text-white",
                            )}
                          >
                            {badge > 99 ? "99+" : badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
                {/* Saved playground workspaces under the Workspaces group */}
                {group === "Workspaces" && workspaceNav.length > 0 && (
                  <li className="mt-1 space-y-0.5 border-l border-sidebar-border/60 pl-2.5">
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
                              ? "bg-sidebar-accent text-white"
                              : "text-sidebar-foreground/65 hover:bg-sidebar-accent/50 hover:text-white"
                          )}
                        >
                          <Workflow
                            className={cn(
                              "h-3.5 w-3.5 shrink-0 transition-colors",
                              active
                                ? "text-primary-foreground/90"
                                : "text-sidebar-foreground/45 group-hover:text-sidebar-foreground/80"
                            )}
                          />
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
      <div className="border-t border-sidebar-border px-3 py-2.5">
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-caption text-sidebar-foreground/50 transition-colors hover:text-white"
        >
          <ChevronLeft className="h-3 w-3" />
          v0.1.0 · Phase 0
        </Link>
      </div>
    </>
  );
}
