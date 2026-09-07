"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  X,
  Settings,
  ChevronDown,
  ChevronRight,
  Pin,
  ArrowRight,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  ALL_NAV_MODULES,
  type Persona,
} from "@/lib/mobile-nav-v2";
import { usePinnedPages } from "@/lib/use-nav-preferences";
import { usePageContext } from "@/components/mobile/v2/page-context";
import { nextActionFor, FLOWS, type FlowId } from "@/lib/flow-map";
import {
  menuGroupsForPersona,
  relatedTo as manifestRelatedTo,
  ROUTES,
  type RouteEntry,
  type MenuGroup,
} from "@/lib/route-manifest";

/* ═══════════════════════════════════════════════════════════════════════════
   NAV PANEL — 3-dot overflow side panel (compact, accordion + pinning)

   A left-side panel that slides in from the left edge, like Google
   Workspace's side panel. Compact sizing — narrow width, tight rows,
   small text.

   **Accordion structure (Phase 2):**
   Shows ALL modules as collapsible sections. The current module is
   expanded by default; others are collapsed to a single header row.
   Tapping a header expands that module and collapses the others.
   Within an expanded module, each group is also collapsible (the group
   containing the current page auto-expands).

   **Personalization (Phase 3):**
   - "Quick Access" section at the top shows pinned pages (user-curated).
   - Each row has a pin icon on the right — tap to pin/unpin.
   - Pinned pages persist to localStorage (per-device, instant, no API).

   - Panel slides in from left (panel-in / panel-out)
   - Backdrop fades in on the right (overlay-in / overlay-out)
   - Close on backdrop tap, X button, or Escape
   - Body scroll locked while open
   - Full height, ~50% width (max 11rem)
   ═══════════════════════════════════════════════════════════════════════════ */

// ── NavLink type (compatible with the old shape, backed by manifest data) ──
interface NavLink {
  href: string;
  icon: RouteEntry["icon"];
  label: string;
  subtitle?: string;
}

// ── Build a lookup map: href → NavLink from the route manifest ──
// Replaces the old NAV_GROUPS-based map. The manifest has ALL 176 routes,
// so pinned/recent/related links always resolve to their proper icon + label.
const HREF_TO_LINK: Map<string, NavLink> = (() => {
  const map = new Map<string, NavLink>();
  for (const route of ROUTES) {
    if (route.kind === "redirect") continue;
    map.set(route.path, {
      href: route.path,
      icon: route.icon,
      label: route.title,
      subtitle: route.hint,
    });
  }
  return map;
})();

interface NavSheetProps {
  open: boolean;
  onClose: () => void;
  moduleId: string;
  /** Current persona — used to filter NavGroups (hide irrelevant sections). */
  persona: Persona;
}

export function NavSheet({ open, onClose, moduleId, persona }: NavSheetProps) {
  const pathname = usePathname();
  const [mounted, setMounted] = React.useState(open);
  const [exiting, setExiting] = React.useState(false);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Personalization: pinned pages ──
  const { pinned, togglePin, isPinned } = usePinnedPages();

  // ── Adaptive: page context from detail pages (must be before early return) ──
  const pageCtx = usePageContext();

  // ── Accordion state — which module is expanded ──
  const [expandedModule, setExpandedModule] = React.useState<string>(moduleId);

  React.useEffect(() => {
    if (open) setExpandedModule(moduleId);
  }, [open, moduleId]);

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

  // ── Adaptive: Next Step from flow-map + page context ──
  // When the user is on a detail page that announced its entity context
  // (type, status, permissions), resolve the next action from flow-map.ts.
  // This is the genuinely adaptive part — different page + status = different suggestion.
  const nextStep = React.useMemo(() => {
    if (!pageCtx.flowId || !pageCtx.status) return null;
    const can = (perm: string) => !perm || (pageCtx.canActions?.includes(perm) ?? false);
    const action = nextActionFor(pageCtx.flowId as FlowId, pageCtx.status, can);
    if (!action) return null;
    // Resolve the action href — anchor actions stay on the current page,
    // navigate actions go to the specified href.
    let href: string | undefined;
    if (action.action.type === "navigate") {
      href = action.action.href;
    } else if (action.action.type === "anchor") {
      href = `${pathname}${action.action.hash}`;
    } else if (action.action.type === "filter") {
      href = `${pathname}?tab=${action.action.chip}`;
    }
    return { ...action, href };
  }, [pageCtx.flowId, pageCtx.status, pageCtx.canActions, pathname]);

  // ── Flow-aware Related: use flow-map nodes when available ──
  // If the page announced a flowId, show the flow's other nodes as
  // related links (the actual workflow neighbors, not URL-prefix guesses).
  const flowRelatedLinks = React.useMemo(() => {
    if (!pageCtx.flowId) return [];
    const flow = FLOWS[pageCtx.flowId as FlowId];
    if (!flow) return [];
    // Show the list page + other nodes' detail pages
    const hrefs = [flow.listHref];
    for (const node of flow.nodes) {
      if (node.detailHref && !hrefs.includes(node.detailHref)) {
        hrefs.push(node.detailHref);
      }
    }
    return hrefs
      .filter((href) => href !== pathname && !pinned.includes(href))
      .map((href) => HREF_TO_LINK.get(href))
      .filter((link): link is NavLink => link !== undefined)
      .slice(0, 4);
  }, [pageCtx.flowId, pathname, pinned]);

  if (!mounted) return null;

  // ── Menu from the route manifest (replaces MODULE_GROUP_MAP + allNavGroupsForPersona) ──
  // Uses persona-only filtering (no permission gating) — the NavSheet is a sitemap,
  // and permission checks happen at the page level. This matches the old behavior
  // and includes the 46 routes that were orphaned under NAV_GROUPS (fixes D5).
  const allModules = menuGroupsForPersona(persona);
  const currentExpanded = allModules[expandedModule] ? expandedModule : moduleId;

  // ── Build Quick Access list from pinned hrefs ──
  const pinnedLinks = pinned
    .map((href) => HREF_TO_LINK.get(href))
    .filter((link): link is NavLink => link !== undefined);

  // ── Build Related list from the route manifest (replaces workflowLinksForPath) ──
  // Uses flow-aware siblings + same-flow nodes from the manifest, which is
  // more accurate than the old URL-prefix matching.
  const relatedLinks = manifestRelatedTo(pathname)
    .filter((r) => !pinned.includes(r.path))
    .map((r) => HREF_TO_LINK.get(r.path))
    .filter((link): link is NavLink => link !== undefined)
    .slice(0, 4);

  // Use flow-aware links if available, otherwise fall back to URL-prefix matching
  const finalRelatedLinks = flowRelatedLinks.length > 0 ? flowRelatedLinks : relatedLinks;

  return (
    <div className="fixed inset-0 z-50 flex justify-start">
      <div
        className={exiting ? "overlay-out" : "overlay-in"}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "color-mix(in srgb, var(--color-ink-950) 40%, transparent)",
        }}
        onClick={onClose}
      />

      <div
        className={exiting ? "panel-out" : "panel-in"}
        style={{
          position: "relative",
          width: "65%",
          maxWidth: "15rem",
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
            className="text-m-label font-semibold"
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
          {/* ── Next Step (adaptive, from flow-map) ── */}
          {/* Shows the ONE action the user should take next on the current
              page, based on entity type + status + permissions. This is
              the genuinely adaptive part of the NavSheet. */}
          {nextStep && nextStep.href && (
            <NavSection title="Next Step" tone="signal">
              <Link
                href={nextStep.href}
                onClick={onClose}
                className="flex items-start gap-2 rounded-[0.5rem] px-2 py-2 text-m-body press"
                style={{
                  backgroundColor: "var(--color-signal-wash)",
                  border: "1px solid color-mix(in srgb, var(--color-signal) 30%, transparent)",
                }}
              >
                <Zap
                  className="size-3.5 shrink-0 mt-0.5"
                  style={{
                    color: nextStep.tone === "stop" ? "var(--color-stop)" : "var(--color-signal-dark)",
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div
                    className="text-m-section font-semibold leading-tight"
                    style={{
                      color: nextStep.tone === "stop" ? "var(--color-stop)" : "var(--color-signal-dark)",
                    }}
                  >
                    {nextStep.label}
                  </div>
                  <div
                    className="text-m-caption leading-tight mt-0.5"
                    style={{ color: "var(--color-ink-500)" }}
                  >
                    {nextStep.reason}
                  </div>
                </div>
                <ArrowRight
                  className="size-3 shrink-0 mt-0.5"
                  style={{ color: "var(--color-signal-dark)" }}
                />
              </Link>
            </NavSection>
          )}

          {/* ── Quick Access (pinned pages) ── */}
          {pinnedLinks.length > 0 && (
            <NavSection title="Quick Access">
              <div className="flex flex-col gap-0.5">
                {pinnedLinks.map((link) => (
                  <NavSheetRow
                    key={link.href}
                    link={link}
                    active={isActive(pathname, link.href)}
                    onClick={onClose}
                    pinned={true}
                    onTogglePin={togglePin}
                  />
                ))}
              </div>
            </NavSection>
          )}

          {/* ── Related pages (workflow cross-links, flow-aware when available) ── */}
          {finalRelatedLinks.length > 0 && (
            <NavSection title="Related" collapsible>
              <div className="flex flex-col gap-0.5">
                {finalRelatedLinks.map((link) => (
                  <NavSheetRow
                    key={link.href}
                    link={link}
                    active={isActive(pathname, link.href)}
                    onClick={onClose}
                    pinned={isPinned(link.href)}
                    onTogglePin={togglePin}
                  />
                ))}
              </div>
            </NavSection>
          )}

          {/* ── Accordion: all modules as collapsible sections ── */}
          <NavSection title="All Pages" collapsible>
            {ALL_NAV_MODULES.filter((mod) => allModules[mod.id]).map((mod) => {
              const groups = allModules[mod.id] ?? [];
              const isExpanded = currentExpanded === mod.id;
              const ModIcon = mod.icon as LucideIcon;

              return (
                <div key={mod.id} className="mb-1">
                  {/* Module header — tap to expand/collapse */}
                  <button
                    onClick={() => setExpandedModule(mod.id)}
                    className="flex items-center gap-1.5 w-full rounded-[0.375rem] px-1.5 py-1.5 press"
                    style={{
                      backgroundColor: isExpanded ? "var(--color-concrete)" : "transparent",
                    }}
                  >
                    <ModIcon
                      className="size-4 shrink-0"
                      style={{
                        color: isExpanded ? "var(--color-ink-950)" : "var(--color-ink-500)",
                      }}
                    />
                    <span
                      className="text-m-label font-semibold leading-tight flex-1 text-left truncate"
                      style={{
                        color: isExpanded ? "var(--color-ink-950)" : "var(--color-ink-700)",
                      }}
                    >
                      {mod.label}
                    </span>
                    {isExpanded ? (
                      <ChevronDown
                        className="size-3 shrink-0"
                        style={{ color: "var(--color-ink-500)" }}
                      />
                    ) : (
                      <ChevronRight
                        className="size-3 shrink-0"
                        style={{ color: "var(--color-ink-500)" }}
                      />
                    )}
                  </button>

                  {/* Module groups + links — only when expanded */}
                  {isExpanded && (
                    <div className="mt-0.5 mb-1">
                      {groups.map((group) => (
                        <NavGroupSection
                          key={group.title}
                          group={group}
                          pathname={pathname}
                          onLinkClick={onClose}
                          isPinned={isPinned}
                          onTogglePin={togglePin}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </NavSection>

          {/* Settings & Help */}
          <NavSection title="Settings">
            <Link
              href="/m/me"
              onClick={onClose}
              className="flex items-center gap-2 rounded-[0.375rem] px-2 py-1.5 text-m-label press"
            >
              <Settings className="size-3 shrink-0" style={{ color: "var(--color-ink-500)" }} />
              <span
                className="text-m-label font-medium leading-tight"
                style={{ color: "var(--color-ink-900)" }}
              >
                Settings & Help
              </span>
            </Link>
          </NavSection>
        </div>
      </div>
    </div>
  );
}

/* ─── Nav group section — a titled group of routes within a module ─── */
function NavGroupSection({
  group,
  pathname,
  onLinkClick,
  isPinned,
  onTogglePin,
}: {
  group: MenuGroup;
  pathname: string;
  onLinkClick: () => void;
  isPinned: (href: string) => boolean;
  onTogglePin: (href: string) => void;
}) {
  // Convert MenuGroup routes to NavLink shape for rendering
  const links: NavLink[] = group.routes.map((r) => ({
    href: r.path,
    icon: r.icon,
    label: r.title,
    subtitle: r.hint,
  }));

  const hasActiveLink = links.some((link) => isActive(pathname, link.href));
  const [expanded, setExpanded] = React.useState(hasActiveLink);

  React.useEffect(() => {
    if (hasActiveLink) setExpanded(true);
  }, [hasActiveLink]);

  return (
    <div className="mb-1">
      {/* Group header — tap to expand/collapse */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 w-full rounded-[0.375rem] py-1 press"
        style={{ paddingLeft: "1.5rem" }}
      >
        <span
          className="text-m-label font-semibold flex-1 text-left truncate"
          style={{ color: "var(--color-ink-500)" }}
        >
          {group.title}
        </span>
        {expanded ? (
          <ChevronDown
            className="size-2.5 shrink-0"
            style={{ color: "var(--color-ink-400)" }}
          />
        ) : (
          <ChevronRight
            className="size-2.5 shrink-0"
            style={{ color: "var(--color-ink-400)" }}
          />
        )}
      </button>

      {/* Links — only when expanded, with tree connector line on the left */}
      {expanded && (
        <div
          className="flex flex-col gap-0.5 mt-0.5 relative"
          style={{ marginLeft: "1.75rem" }}
        >
          {/* Continuous vertical connector line — rendered on top with z-index
              so active row backgrounds (yellow) don't cover it */}
          <div
            className="absolute top-0 bottom-0"
            style={{ left: 0, width: 1, backgroundColor: "var(--color-ink-300)", zIndex: 10 }}
          />
          {links.map((link) => (
            <div key={link.href} className="relative">
              {/* Horizontal elbow connector — also on top */}
              <div
                className="absolute top-1/2 -translate-y-1/2"
                style={{
                  left: 0,
                  width: 10,
                  height: 1,
                  backgroundColor: "var(--color-ink-300)",
                  zIndex: 10,
                }}
              />
              <NavSheetRow
                link={link}
                active={isActive(pathname, link.href)}
                onClick={onLinkClick}
                pinned={isPinned(link.href)}
                onTogglePin={onTogglePin}
                depth={0}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Bordered section wrapper with a title header. Gives each NavSheet
 *  section (Recent, Related, Quick Access, etc.) a visual card boundary.
 *  When `collapsible` is true, the title becomes a tap target that
 *  expands/collapses the section body (with a chevron indicator). */
function NavSection({
  title,
  tone = "default",
  collapsible = false,
  defaultExpanded = true,
  children,
}: {
  title: string;
  tone?: "default" | "signal";
  collapsible?: boolean;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const titleColor = tone === "signal" ? "var(--color-signal-dark)" : "var(--color-ink-500)";
  return (
    <div
      className="mb-2.5 rounded-[0.5rem] p-2"
      style={{
        backgroundColor: "var(--color-paper)",
        border: "1px solid var(--color-line)",
      }}
    >
      {collapsible ? (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 w-full mb-0.5 press"
        >
          <h3
            className="text-m-caption uppercase tracking-wide font-semibold flex-1 text-left"
            style={{ color: titleColor }}
          >
            {title}
          </h3>
          {expanded ? (
            <ChevronDown className="size-3 shrink-0" style={{ color: titleColor }} />
          ) : (
            <ChevronRight className="size-3 shrink-0" style={{ color: titleColor }} />
          )}
        </button>
      ) : (
        <h3
          className="text-m-caption uppercase tracking-wide font-semibold mb-1.5"
          style={{ color: titleColor }}
        >
          {title}
        </h3>
      )}
      {expanded && children}
    </div>
  );
}

/** Compact navigation row — flat, no box. Clean: just icon + label.
 *  `depth` controls left padding for visual hierarchy (0 = module level, 1 = group level).
 *  Pin button on the right toggles pinned state. Visit count badge shown for recent pages. */
function NavSheetRow({
  link,
  active,
  onClick,
  pinned,
  onTogglePin,
  visitCount,
  depth = 0,
}: {
  link: NavLink;
  active: boolean;
  onClick: () => void;
  pinned: boolean;
  onTogglePin: (href: string) => void;
  visitCount?: number;
  depth?: number;
}) {
  const Icon = link.icon as LucideIcon;
  // depth 0 = inside a group (tree connector handles indentation)
  // depth 1+ = nested deeper (legacy fallback)
  const leftPad = depth === 0 ? 0.75 : 0.5 + depth * 1.25;
  return (
    <div
      className="flex items-center rounded-[0.375rem] text-m-label"
      style={{
        backgroundColor: active ? "var(--color-signal-wash)" : "transparent",
      }}
    >
      <Link
        href={link.href}
        prefetch
        onClick={onClick}
        className="flex items-center gap-2 flex-1 min-w-0 py-1.5 pr-1 press"
        style={{ paddingLeft: `${leftPad}rem` }}
      >
        <Icon
          className="size-3 shrink-0"
          style={{ color: active ? "var(--color-signal-dark)" : "var(--color-ink-500)" }}
        />
        <span
          className="truncate text-m-label font-medium leading-tight"
          style={{ color: active ? "var(--color-signal-dark)" : "var(--color-ink-900)" }}
        >
          {link.label}
        </span>
        {visitCount != null && visitCount > 1 && (
          <span
            className="text-m-micro font-bold tabular-nums shrink-0"
            style={{ color: "var(--color-ink-400)" }}
          >
            {visitCount}×
          </span>
        )}
      </Link>
      {/* Pin toggle — tap to pin/unpin. Doesn't navigate. */}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTogglePin(link.href); }}
        className="grid place-items-center size-5 shrink-0 mr-0.5 press"
        aria-label={pinned ? "Unpin from Quick Access" : "Pin to Quick Access"}
      >
        <Pin
          className="size-2.5"
          style={{
            color: pinned ? "var(--color-signal-dark)" : "var(--color-ink-300)",
            fill: pinned ? "currentColor" : "none",
          }}
        />
      </button>
    </div>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/m/inventory" || href === "/m/hr" || href === "/m/accounts")
    return false;
  return pathname.startsWith(href + "/") || pathname === href;
}
