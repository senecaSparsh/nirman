"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ChevronDown, ChevronsLeft } from "lucide-react";
import type { World, NavLink } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * BUILD NAV PANEL — the 5-stage accordion sidebar for the Build world.
 *
 * Replaces the flat WorldPanel when the active world is "build". Instead
 * of showing all sections as a scrollable flat list, it shows 5 cards
 * (Acquire, Procure, Stock, Construct, Sell) as a vertical accordion:
 *
 *  - Collapsed card: stage name + a count badge if any items have alerts
 *  - Expanded card: stage name + all its nav items as links
 *  - One card expanded at a time (click to switch)
 *  - Auto-expands the card that contains the current route on load
 *  - Active link is highlighted within the expanded card
 *
 * The 5 stages are always visible as compact cards, so the pipeline
 * metaphor is present even when you're deep in a specific page. You
 * always know where you are in the lifecycle.
 */
export function BuildNavPanel({
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
  // Filter to non-hidden items, same as WorldPanel
  const sections = useMemo(
    () =>
      world.sections
        .map((s) => ({ ...s, items: s.items.filter((i) => !i.hidden) }))
        .filter((s) => s.items.length > 0),
    [world],
  );

  // Determine which section contains the current route (for auto-expand)
  const activeSectionIndex = useMemo(() => {
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      if (!section) continue;
      for (const item of section.items) {
        const matches = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        if (matches) return i;
      }
    }
    // Also check if we're on /build itself
    if (pathname === "/build") return -1;
    return -1;
  }, [sections, pathname]);

  const [expandedIndex, setExpandedIndex] = useState<number>(
    activeSectionIndex >= 0 ? activeSectionIndex : 0,
  );

  // Render a single nav link — same styling as WorldPanel
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
      </li>
    );
  }

  // Count total badges for a section (for the collapsed card)
  function sectionBadgeCount(section: { items: NavLink[] }): number {
    return section.items.reduce((sum, item) => sum + (badgeCounts[item.href] ?? 0), 0);
  }

  return (
    <div className={cn("flex-col border-r border-border bg-card", className)}>
      {/* World identity — same header as WorldPanel */}
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

      {/* Pipeline overview link — takes you to the /build dashboard */}
      <Link
        href="/build"
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2 border-b border-border px-4 py-2 text-meta transition-colors",
          pathname === "/build"
            ? "bg-accent font-semibold text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <span className="text-muted-foreground/60">Pipeline overview</span>
      </Link>

      {/* Accordion — 5 stage cards */}
      <nav className="flex-1 overflow-y-auto px-2 py-2 scrollbar-thin">
        {sections.map((section, i) => {
          const isExpanded = expandedIndex === i;
          const isActive = activeSectionIndex === i;
          const badgeTotal = sectionBadgeCount(section);

          return (
            <div key={section.label} className={cn(i > 0 && "mt-1")}>
              {/* Card header — click to expand/collapse */}
              <button
                onClick={() => setExpandedIndex(isExpanded ? -1 : i)}
                className={cn(
                  "group flex w-full items-center gap-2 rounded-md px-2 py-2 text-meta transition-colors",
                  isActive && !isExpanded
                    ? "bg-accent/50 font-semibold text-foreground"
                    : isExpanded
                      ? "bg-subtle font-semibold text-foreground"
                      : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {/* Active stage indicator — world colour dot */}
                {isActive && (
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: world.color }}
                  />
                )}
                <span className="min-w-0 flex-1 truncate text-left">{section.label}</span>
                {/* Badge count for collapsed cards */}
                {badgeTotal > 0 && !isExpanded && (
                  <span className="shrink-0 rounded bg-brand-soft px-1.5 py-px text-micro font-semibold tnum text-brand">
                    {badgeTotal > 99 ? "99+" : badgeTotal}
                  </span>
                )}
                <ChevronDown
                  className={cn(
                    "size-3.5 shrink-0 text-muted-foreground/50 transition-transform",
                    isExpanded && "rotate-180",
                  )}
                />
              </button>

              {/* Expanded items — slide down */}
              {isExpanded && (
                <ul className="mt-px space-y-px pb-1">
                  {section.items.map((item) => renderItem(item))}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-border px-3 py-2">
        <span className="text-micro text-muted-foreground/60">⌘K to search anything</span>
      </div>
    </div>
  );
}
