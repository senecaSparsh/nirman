"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChevronLeft,
  Search,
  Loader2,
  RefreshCw,
  Bell,
  Monitor,
  WifiOff,
  Building2,
  CheckCircle2,
  AlertTriangle,
  X,
  Sun,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFieldMode } from "@/lib/field-mode";
import { ThemeToggle } from "@/components/theme-toggle";
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
import { useOfflineQueue } from "@/lib/offline/use-offline-queue";

interface ProjectOption {
  id: string;
  name: string;
  code?: string;
}

interface NotificationItem {
  id: string;
  title: string;
  subtitle: string;
  type: "approval" | "warning" | "info";
  href: string;
}

/**
 * MobileShell — the /m layout's client root.
 *
 * Responsibilities:
 *  1. Resolve the current user's role (via /api/me) → persona.
 *  2. Render a sticky top header (company mark + project switcher + notifications + desktop mode switcher).
 *  3. Render offline/sync status banner when network connectivity changes.
 *  4. Render the persona's bottom tab bar with active-tab highlight.
 *  5. Provide a scrollable content area for the page (children).
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

  if (process.env.NEXT_PUBLIC_AUTH_BYPASS !== "true" && sessionLoading && !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!persona) {
    const fromPath = personaForPath(pathname);
    if (!fromPath) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }
    return <MobileShellInner persona={fromPath} companyName={companyName} badgeCounts={badgeCounts}>{children}</MobileShellInner>;
  }

  return (
    <MobileShellInner persona={persona} companyName={companyName} badgeCounts={badgeCounts}>
      {children}
    </MobileShellInner>
  );
}

/** Pure presentational shell */
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
  const { enabled: fieldMode, toggle: toggleFieldMode } = useFieldMode();
  const initials = companyName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isOffline, setIsOffline] = useState(false);
  const { pending: offlineQueueCount, syncing: offlineSyncing, sync: syncOfflineQueue } = useOfflineQueue();

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

  // ── Fetch active projects for header context switcher ──
  useEffect(() => {
    fetch("/api/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          setProjects(data.map((p: { id: string; name: string; code?: string }) => ({ id: p.id, name: p.name, code: p.code })));
        }
      })
      .catch(() => {});

    // Saved active project
    const saved = localStorage.getItem("nirman_active_project_id");
    if (saved) setSelectedProjectId(saved);
  }, []);

  // ── Fetch notifications / approvals count ──
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/approvals").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/purchase-orders?status=DRAFT").then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([approvals, draftPOs]) => {
      if (cancelled) return;
      const list: NotificationItem[] = [];
      if (Array.isArray(approvals) && approvals.length > 0) {
        list.push({
          id: "approvals",
          title: `${approvals.length} items awaiting approval`,
          subtitle: "Purchase orders & requisitions",
          type: "approval",
          href: "/m/pulse/approvals",
        });
      }
      if (Array.isArray(draftPOs) && draftPOs.length > 0) {
        list.push({
          id: "draft-pos",
          title: `${draftPOs.length} draft POs ready to submit`,
          subtitle: "Review vendor quotes and totals",
          type: "warning",
          href: "/m/procurement",
        });
      }
      setNotifications(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelectProject = (id: string) => {
    setSelectedProjectId(id);
    localStorage.setItem("nirman_active_project_id", id);
  };

  const activeTab = persona.tabs.find((t) => isActiveTab(pathname, t.href, persona.home));

  const { pullDistance, refreshing, progress, showIndicator, bind } = usePullToRefresh(
    () => router.refresh(),
  );

  const isDrillDown = Boolean(activeTab && pathname !== activeTab.href && pathname !== persona.home);
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <CommandPalette userRole={persona.roles[0]} />

      {/* Offline Banner — shows queue count and sync button */}
      {isOffline && (
        <div className="flex items-center justify-between gap-2 bg-amber-500/90 px-3 py-1.5 font-mono text-[11px] font-semibold text-white backdrop-blur">
          <div className="flex items-center gap-2">
            <WifiOff className="size-3.5" />
            <span>
              Offline mode
              {offlineQueueCount > 0 && ` — ${offlineQueueCount} action${offlineQueueCount === 1 ? "" : "s"} queued`}
            </span>
          </div>
          {offlineQueueCount > 0 && (
            <button
              onClick={() => void syncOfflineQueue()}
              disabled={offlineSyncing}
              className="flex items-center gap-1 rounded bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white active:bg-white/30 disabled:opacity-50"
            >
              {offlineSyncing ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <RefreshCw className="size-3" />
              )}
              {offlineSyncing ? "Syncing…" : "Sync now"}
            </button>
          )}
        </div>
      )}

      {/* HEADER */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/90 pt-safe backdrop-blur-xl">
        <div className="flex h-[52px] items-center gap-2 px-2">
          {isDrillDown ? (
            <button
              onClick={() => router.back()}
              aria-label="Back"
              className="flex size-11 shrink-0 items-center justify-center rounded-lg text-foreground transition-colors active:bg-muted"
            >
              <ChevronLeft className="size-5" />
            </button>
          ) : (
            <span className="ml-1 flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand font-mono text-[13px] font-bold text-brand-foreground shadow-sm">
              N
            </span>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[14px] font-bold leading-tight text-foreground">
                {activeTab?.label ?? persona.label}
              </span>

              {/* Active Project Switcher Dropdown */}
              {projects.length > 0 && (
                <div className="relative inline-block">
                  <select
                    value={selectedProjectId}
                    onChange={(e) => handleSelectProject(e.target.value)}
                    className="max-w-[130px] truncate rounded bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium text-foreground outline-none border border-border/50"
                  >
                    <option value="all">All Projects</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <span className="block truncate text-[11px] text-muted-foreground">
              {companyName} {selectedProject ? `· ${selectedProject.name}` : ""}
            </span>
          </div>

          {/* Search Trigger */}
          <button
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors active:bg-muted"
            aria-label="Search"
            onClick={() =>
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))
            }
          >
            <Search className="size-[18px]" />
          </button>

          {/* Field Mode Toggle — larger text & higher contrast for outdoor use */}
          <button
            onClick={() => toggleFieldMode()}
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-lg transition-colors active:bg-muted",
              fieldMode
                ? "bg-warning/20 text-warning"
                : "text-muted-foreground",
            )}
            aria-label="Toggle field mode"
            title={fieldMode ? "Field mode on — larger text for outdoor use" : "Enable field mode — larger text for outdoor use"}
          >
            <Sun className="size-[18px]" />
          </button>

          {/* Notifications Bell */}
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors active:bg-muted"
            aria-label="Notifications"
          >
            <Bell className="size-[18px]" />
            {notifications.length > 0 && (
              <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-danger ring-2 ring-card" />
            )}
          </button>

          {/* Enterprise Desktop Mode Switcher */}
          <button
            onClick={() => router.push("/")}
            title="Switch to Full ERP Desktop View"
            className="flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors active:bg-muted hover:text-foreground"
          >
            <Monitor className="size-[18px]" />
          </button>

          <ThemeToggle tone="surface" className="size-8 shrink-0" />

          {/* Profile Avatar */}
          <Link
            href={persona.home}
            aria-label="You"
            className="mr-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[10px] font-bold text-brand ring-1 ring-brand/20"
          >
            {initials}
          </Link>
        </div>

        {activeTab && (
          <span className="block h-0.5 w-full" style={{ backgroundColor: tabColor(activeTab) }} />
        )}
      </header>

      {/* Notifications Drawer */}
      {showNotifications && (
        <div className="fixed inset-x-0 top-[53px] z-40 border-b border-border bg-card shadow-lg p-3 animate-in slide-in-from-top-2">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">
              Notifications &amp; Alerts ({notifications.length})
            </span>
            <button
              onClick={() => setShowNotifications(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">All clear — no pending alerts!</p>
            ) : (
              notifications.map((n) => (
                <Link
                  key={n.id}
                  href={n.href}
                  onClick={() => setShowNotifications(false)}
                  className="flex items-start gap-2.5 rounded-lg p-2 hover:bg-muted transition-colors"
                >
                  <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground leading-snug">{n.title}</p>
                    <p className="text-[11px] text-muted-foreground">{n.subtitle}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      )}

      {/* Scrollable Content Area */}
      <main
        className="relative flex-1 overflow-y-auto pb-[calc(4.25rem+env(safe-area-inset-bottom))]"
        {...bind}
      >
        {showIndicator && (
          <div
            className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-center justify-center"
            style={{ height: `${pullDistance}px` }}
          >
            <span
              className="flex size-8 items-center justify-center rounded-full border border-border bg-elevated shadow-floating"
              style={{ opacity: refreshing ? 1 : progress }}
            >
              <RefreshCw
                className={cn("size-4 text-muted-foreground", refreshing && "animate-spin")}
                style={{ transform: refreshing ? undefined : `rotate(${progress * 270}deg)` }}
              />
            </span>
          </div>
        )}
        {children}
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-safe backdrop-blur-xl">
        <div className="flex items-stretch justify-between px-1">
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

function TabButton({ tab, active, badge }: { tab: PersonaTab; active: boolean; badge?: number }) {
  const Icon = tab.icon;
  const color = tabColor(tab);
  return (
    <Link
      href={tab.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-0.5 py-2",
        "transition-all active:scale-95",
        active ? "text-foreground font-semibold" : "text-muted-foreground active:bg-muted",
      )}
    >
      {active && (
        <span
          className="absolute inset-x-2.5 top-0 h-[3px] rounded-b-full shadow-sm"
          style={{ backgroundColor: color }}
        />
      )}
      <span className="relative">
        <Icon className="size-5" style={active ? { color } : undefined} />
        {badge != null && badge > 0 && (
          <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 font-mono text-[10px] font-bold leading-none text-white ring-2 ring-card">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
      <span
        className={cn(
          "max-w-full truncate text-[10px] leading-none",
          active ? "font-semibold" : "font-medium",
        )}
      >
        {tab.label}
      </span>
    </Link>
  );
}

function isActiveTab(pathname: string, tabHref: string, personaHome: string): boolean {
  if (tabHref === personaHome) return pathname === personaHome;
  return pathname === tabHref || pathname.startsWith(tabHref + "/");
}

export { personaForRole };

