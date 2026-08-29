"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, Settings, type LucideIcon } from "lucide-react";
import {
  navGroupsForPersona,
  type NavLink,
  type Persona,
  type ModuleTab,
} from "@/lib/mobile-nav-v2";

/* ═══════════════════════════════════════════════════════════════════════════
   NAV PANEL — 3-dot overflow side panel (compact)

   A left-side panel that slides in from the left edge, like Google
   Workspace's side panel. Compact sizing — narrow width, tight rows,
   small text. Shows all navigation links for the current module.

   - Panel slides in from left (panel-in / panel-out)
   - Backdrop fades in on the right (overlay-in / overlay-out)
   - Close on backdrop tap, X button, or Escape
   - Body scroll locked while open
   - Full height, ~72% width (max 17rem)
   ═══════════════════════════════════════════════════════════════════════════ */

interface NavSheetProps {
  open: boolean;
  onClose: () => void;
  moduleId: string;
  /** Current persona — used to filter NavGroups (hide irrelevant sections). */
  persona: Persona;
  /** Persona's tab bar — shown in the module switcher grid at the top. */
  personaTabs: ModuleTab[];
}

export function NavSheet({ open, onClose, moduleId, persona, personaTabs }: NavSheetProps) {
  const pathname = usePathname();
  const [mounted, setMounted] = React.useState(open);
  const [exiting, setExiting] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (open) {
      setMounted(true);
      setExiting(false);
    } else if (mounted) {
      setExiting(true);
      if (closeTimer.current) clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(() => {
        setMounted(false);
        setExiting(false);
      }, 220);
    }
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, [open, mounted]);

  React.useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mounted]);

  React.useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, onClose]);

  if (!mounted) return null;

  // Map persona tab IDs to the most appropriate NAV_GROUPS key.
  // New persona tabs (site, dpr, tasks, stock, etc.) map to the module
  // that contains their links. Unknown IDs fall back to "home" which
  // has links to everything.
  const MODULE_GROUP_MAP: Record<string, string> = {
    home: "home",
    inventory: "inventory",
    hr: "hr",
    accounts: "accounts",
    settings: "settings",
    site: "home",
    dpr: "hr",
    tasks: "hr",
    stock: "inventory",
    procurement: "inventory",
    transfers: "inventory",
    sales: "home",
    customers: "home",
    approvals: "home",
    reports: "home",
    attendance: "hr",
  };
  const resolvedModuleId = MODULE_GROUP_MAP[moduleId] ?? "home";
  // Filter groups by persona — hides irrelevant sections (e.g. a store
  // keeper doesn't see Real Estate, Construction, Safety, or Books).
  const groups = navGroupsForPersona(resolvedModuleId, persona);

  return (
    <div className="fixed inset-0 z-50 flex justify-start">
      <div
        className={exiting ? "overlay-out" : "overlay-in"}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(18, 17, 13, 0.4)",
        }}
        onClick={onClose}
      />

      <div
        className={exiting ? "panel-out" : "panel-in"}
        style={{
          position: "relative",
          width: "50%",
          maxWidth: "11rem",
          height: "100%",
          backgroundColor: "var(--color-paper-2)",
          borderRight: "1px solid var(--color-line)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header — compact */}
        <div
          className="flex items-center justify-between px-2 py-2 shrink-0 border-b"
          style={{ borderColor: "var(--color-line)" }}
        >
          <h2
            className="text-[0.9375rem] font-semibold"
            style={{ color: "var(--color-ink-950)" }}
          >
            All pages
          </h2>
          <button
            onClick={onClose}
            className="press grid place-items-center size-6 rounded-[0.5rem]"
            style={{
              color: "var(--color-ink-500)",
              backgroundColor: "var(--color-concrete)",
            }}
            aria-label="Close menu"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* Scrollable link list — tight spacing */}
        <div className="overflow-y-auto flex-1 px-1.5 py-2 pb-safe">
          {/* Module switcher — quick jump to any module's pages */}
          <div className="mb-3">
            <h3
              className="text-[0.5rem] uppercase tracking-wide font-semibold mb-1.5"
              style={{ color: "var(--color-ink-500)" }}
            >
              Modules
            </h3>
            <div className="grid grid-cols-5 gap-1">
              {personaTabs.map((tab) => {
                const Icon = tab.icon as LucideIcon;
                const active = moduleId === tab.id;
                // Search tab doesn't navigate — it opens the search overlay.
                // We can't trigger that from here, so skip it in the grid.
                if (tab.id === "search") {
                  return (
                    <div
                      key={tab.id}
                      className="flex flex-col items-center gap-0.5 rounded-[0.375rem] py-1.5 opacity-40"
                    >
                      <Icon className="size-3.5 shrink-0" style={{ color: "var(--color-ink-500)" }} />
                      <span
                        className="text-[0.4375rem] font-semibold leading-tight"
                        style={{ color: "var(--color-ink-700)" }}
                      >
                        {tab.label}
                      </span>
                    </div>
                  );
                }
                return (
                  <Link
                    key={tab.id}
                    href={tab.href}
                    onClick={onClose}
                    className="flex flex-col items-center gap-0.5 rounded-[0.375rem] py-1.5 press"
                    style={{
                      backgroundColor: active ? "var(--color-signal-wash)" : "var(--color-concrete)",
                    }}
                  >
                    <Icon
                      className="size-3.5 shrink-0"
                      style={{ color: active ? "var(--color-signal-dark)" : "var(--color-ink-500)" }}
                    />
                    <span
                      className="text-[0.4375rem] font-semibold leading-tight"
                      style={{ color: active ? "var(--color-signal-dark)" : "var(--color-ink-700)" }}
                    >
                      {tab.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          {groups.map((group) => (
            <div key={group.title} className="mb-3">
              <h3
                className="text-[0.5rem] uppercase tracking-wide font-semibold mb-1.5"
                style={{ color: "var(--color-ink-500)" }}
              >
                {group.title}
              </h3>
              <div className="flex flex-col gap-0.5">
                {group.links.map((link) => (
                  <NavSheetRow
                    key={link.href}
                    link={link}
                    active={isActive(pathname, link.href)}
                    onClick={onClose}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Settings & Help */}
          <div
            className="mt-1.5 pt-2 border-t"
            style={{ borderColor: "var(--color-line)" }}
          >
            <Link
              href="/m/me"
              onClick={onClose}
              className="flex items-center gap-2 rounded-[0.375rem] px-2 py-1.5 press"
            >
              <Settings className="size-3.5 shrink-0" style={{ color: "var(--color-ink-500)" }} />
              <span
                className="text-[0.75rem] font-medium leading-tight"
                style={{ color: "var(--color-ink-900)" }}
              >
                Settings & Help
              </span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Compact navigation row — flat, no box. */
function NavSheetRow({
  link,
  active,
  onClick,
}: {
  link: NavLink;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = link.icon as LucideIcon;
  return (
    <Link
      href={link.href}
      prefetch
      onClick={onClick}
      className="flex items-center gap-2 rounded-[0.375rem] px-2 py-1.5 press"
      style={{
        backgroundColor: active ? "var(--color-signal-wash)" : "transparent",
      }}
    >
      <Icon
        className="size-3.5 shrink-0"
        style={{ color: active ? "var(--color-signal-dark)" : "var(--color-ink-500)" }}
      />
      <span
        className="truncate text-[0.75rem] font-medium leading-tight"
        style={{ color: active ? "var(--color-signal-dark)" : "var(--color-ink-900)" }}
      >
        {link.label}
      </span>
      {active && (
        <span
          className="ml-auto size-1.5 rounded-full shrink-0"
          style={{ backgroundColor: "var(--color-signal)" }}
        />
      )}
    </Link>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/m/inventory" || href === "/m/hr" || href === "/m/accounts")
    return false;
  return pathname.startsWith(href + "/") || pathname === href;
}
