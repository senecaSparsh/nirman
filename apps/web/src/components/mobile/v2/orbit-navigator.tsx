"use client";

import * as React from "react";
import { ChevronLeft, X, Loader2, ChevronRight, ExternalLink } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
   ORBIT NAVIGATOR — circular orbit layout with rich cards

   Center card in the middle of the screen with quick-but-important details.
   Orbit chips arranged in a circle around it. Tapping a chip shows children
   as a list. Tapping a child's body drills down (if it has children); tapping
   the "→" icon opens the full page for that entity.

   Can render as:
   - inline (on the page, when there's only 1 company)
   - popup (full-screen overlay, when there are multiple companies)
   ═══════════════════════════════════════════════════════════════════════════ */

interface OrbitChip {
  id: string;
  type: string;
  label: string;
  subtitle: string;
  count: number;
  href: string;
}

interface DetailField {
  label: string;
  value: string;
}

interface OrbitNode {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  meta: string;
  href: string;
  details: DetailField[];
  orbits: OrbitChip[];
}

interface ChildEntity {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  meta: string;
  href: string;
  details: DetailField[];
  hasChildren: boolean;
}

interface BreadcrumbStep {
  type: string;
  id: string;
  title: string;
}

const TYPE_ICONS: Record<string, string> = {
  company: "🏢", project: "🏗️", builtUnit: "🏠", landParcel: "📐",
  landPurchase: "📐", assetSale: "💰", department: "🏭",
  stockLocation: "📦", employee: "👷", equipment: "🔧",
  requisition: "📋", purchaseOrder: "🛒", materialIssue: "📤",
  dpr: "📊", portalListing: "🌐", payment: "💵", partition: "✂️",
};

const CATEGORY_ICONS: Record<string, string> = {
  projects: "🏗️", land: "📐", departments: "🏭", inventory: "📦",
  hr: "👷", equipment: "🔧", builtUnits: "🏠", landParcels: "📐",
  requisitions: "📋", purchaseOrders: "🛒", materialIssues: "📤",
  dprs: "📊", sales: "💰", portalListings: "🌐", payments: "💵",
  subParcels: "📐", partitions: "✂️",
};

export interface OrbitNavigatorProps {
  initialNode: {
    id: string;
    type: string;
    title: string;
    subtitle: string;
    meta: string;
  };
  inline?: boolean;
  open: boolean;
  onClose?: () => void;
}

export function OrbitNavigator({ initialNode, inline = false, open, onClose }: OrbitNavigatorProps) {
  const [node, setNode] = React.useState<OrbitNode | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [children, setChildren] = React.useState<ChildEntity[] | null>(null);
  const [childrenLoading, setChildrenLoading] = React.useState(false);
  const [breadcrumb, setBreadcrumb] = React.useState<BreadcrumbStep[]>([]);
  const [activeChip, setActiveChip] = React.useState<string | null>(null);
  const [cardExpanded, setCardExpanded] = React.useState(false);

  const fetchNode = React.useCallback(async (type: string, id: string) => {
    setLoading(true);
    setCardExpanded(false);
    setChildren(null);
    setActiveChip(null);
    try {
      const res = await fetch(`/api/orbit?type=${type}&id=${id}`);
      if (!res.ok) throw new Error("Failed");
      const data: OrbitNode = await res.json();
      setNode(data);
    } catch {
      setNode({
        id, type,
        title: initialNode.title, subtitle: initialNode.subtitle,
        meta: initialNode.meta, href: "", details: [], orbits: [],
      });
    } finally {
      setLoading(false);
    }
  }, [initialNode]);

  const fetchChildren = React.useCallback(async (chipId: string, parentType: string, parentId: string) => {
    setChildrenLoading(true);
    setActiveChip(chipId);
    try {
      const res = await fetch(`/api/orbit?mode=children&parentType=${parentType}&parentId=${parentId}&category=${chipId}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setChildren(data.children as ChildEntity[]);
    } catch {
      setChildren([]);
    } finally {
      setChildrenLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open && !node) {
      fetchNode(initialNode.type, initialNode.id);
      setBreadcrumb([{ type: initialNode.type, id: initialNode.id, title: initialNode.title }]);
    }
  }, [open, node, initialNode, fetchNode]);

  React.useEffect(() => {
    if (!open && !inline) {
      const t = setTimeout(() => {
        setNode(null); setChildren(null); setBreadcrumb([]); setActiveChip(null);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open, inline]);

  const handleChipTap = (chip: OrbitChip) => {
    if (!node || chip.count === 0) return;
    fetchChildren(chip.id, node.type, node.id);
  };

  const handleChildTap = (child: ChildEntity) => {
    // Only drill down if the child has its own children
    if (!child.hasChildren) return;
    setBreadcrumb((prev) => [...prev, { type: child.type, id: child.id, title: child.title }]);
    fetchNode(child.type, child.id);
  };

  const handleBack = () => {
    if (breadcrumb.length <= 1) return;
    const prev = breadcrumb[breadcrumb.length - 2];
    if (!prev) return;
    setBreadcrumb((prevArr) => prevArr.slice(0, -1));
    fetchNode(prev.type, prev.id);
  };

  const handleBreadcrumbTap = (step: BreadcrumbStep, index: number) => {
    if (index === breadcrumb.length - 1) return;
    setBreadcrumb((prev) => prev.slice(0, index + 1));
    fetchNode(step.type, step.id);
  };

  if (!inline && !open) return null;

  const orbitChips = node?.orbits ?? [];
  const chipCount = orbitChips.length;
  const radiusPercent = 42;

  const content = (
    <>
      {/* ── Header: breadcrumb + close ── */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 border-b shrink-0"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        {breadcrumb.length > 1 ? (
          <button
            onClick={handleBack}
            className="grid place-items-center size-7 rounded-[0.375rem] press shrink-0"
            style={{ color: "var(--color-ink-700)" }}
          >
            <ChevronLeft className="size-4" />
          </button>
        ) : null}

        <div className="flex-1 min-w-0 overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-1 w-max">
            {breadcrumb.map((step, i) => (
              <React.Fragment key={`${step.type}-${step.id}`}>
                {i > 0 && <ChevronRight className="size-3 shrink-0" style={{ color: "var(--color-ink-300)" }} />}
                <button
                  onClick={() => handleBreadcrumbTap(step, i)}
                  className="text-[0.5625rem] font-semibold whitespace-nowrap press"
                  style={{ color: i === breadcrumb.length - 1 ? "var(--color-ink-950)" : "var(--color-ink-500)" }}
                >
                  {TYPE_ICONS[step.type] ?? "📍"} {step.title}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>

        {!inline && onClose ? (
          <button
            onClick={onClose}
            className="grid place-items-center size-7 rounded-[0.375rem] press shrink-0"
            style={{ color: "var(--color-ink-700)" }}
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {/* ── Main orbit area ── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full py-20">
            <Loader2 className="size-6 animate-spin" style={{ color: "var(--color-ink-300)" }} />
          </div>
        ) : node ? (
          <div className="flex flex-col items-center px-4 pt-5 pb-8">
            {/* ── Orbit ring (center card + circular chips) ── */}
            <div className="relative w-full" style={{ maxWidth: "20rem", aspectRatio: "1 / 1" }}>
              {/* Orbit chips in a ring — fade + scale behind when card is expanded */}
              {chipCount > 0 ? (
                <>
                  {/* Faint connecting circle */}
                  <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed transition-all duration-300"
                    style={{
                      width: `${radiusPercent * 2}%`,
                      height: `${radiusPercent * 2}%`,
                      borderColor: "var(--color-line)",
                      opacity: cardExpanded ? 0 : 1,
                      transform: cardExpanded
                        ? "translate(-50%, -50%) scale(0.6)"
                        : "translate(-50%, -50%) scale(1)",
                    }}
                  />

                  {orbitChips.map((chip, i) => {
                    const angle = (chipCount === 1 ? -90 : -90 + (360 / chipCount) * i) * (Math.PI / 180);
                    const x = 50 + radiusPercent * Math.cos(angle);
                    const y = 50 + radiusPercent * Math.sin(angle);
                    const isActive = activeChip === chip.id;
                    const isEmpty = chip.count === 0;

                    return (
                      <button
                        key={chip.id}
                        onClick={() => handleChipTap(chip)}
                        disabled={isEmpty || cardExpanded}
                        className="absolute z-20 flex flex-col items-center gap-0.5 press transition-all duration-300"
                        style={{
                          left: `${x}%`,
                          top: `${y}%`,
                          transform: cardExpanded
                            ? "translate(-50%, -50%) scale(0.3)"
                            : "translate(-50%, -50%)",
                          opacity: cardExpanded ? 0 : (isEmpty ? 0.35 : 1),
                          pointerEvents: cardExpanded ? "none" : "auto",
                        }}
                      >
                        <div
                          className="grid place-items-center rounded-full border-2 transition-all"
                          style={{
                            width: isActive ? "3rem" : "2.5rem",
                            height: isActive ? "3rem" : "2.5rem",
                            borderColor: isActive ? "var(--color-ink-950)" : "var(--color-line)",
                            backgroundColor: isActive ? "var(--color-concrete)" : "var(--color-paper)",
                            boxShadow: isActive ? "0 2px 8px rgba(0,0,0,0.12)" : "none",
                          }}
                        >
                          <span className="text-[1rem] leading-none">
                            {CATEGORY_ICONS[chip.id] ?? "📍"}
                          </span>
                        </div>
                        <span
                          className="text-[0.5rem] font-bold text-center leading-tight whitespace-nowrap"
                          style={{ color: "var(--color-ink-950)" }}
                        >
                          {chip.label}
                        </span>
                        <span
                          className="text-[0.4375rem] font-semibold tabular-nums"
                          style={{ color: "var(--color-ink-500)" }}
                        >
                          {chip.count}
                        </span>
                      </button>
                    );
                  })}
                </>
              ) : null}

              {/* Center card — expands to fill orbit area when tapped */}
              <div
                className="absolute top-1/2 left-1/2 z-30 transition-all duration-300"
                style={{
                  width: cardExpanded ? "100%" : "46%",
                  height: cardExpanded ? "100%" : "auto",
                  transform: "translate(-50%, -50%)",
                }}
              >
                <button
                  onClick={() => setCardExpanded((v) => !v)}
                  className="block w-full h-full text-left press"
                >
                  <CenterCard node={node} expanded={cardExpanded} />
                </button>
              </div>
            </div>

            {/* ── End-of-line message (no orbits) ── */}
            {chipCount === 0 ? (
              <div className="mt-4 text-center">
                <p className="text-[0.625rem]" style={{ color: "var(--color-ink-500)" }}>
                  End of the line — no further details to explore
                </p>
                {node.href ? (
                  <a
                    href={node.href}
                    className="mt-2 inline-flex items-center gap-1 text-[0.625rem] font-semibold underline"
                    style={{ color: "var(--color-steel)" }}
                  >
                    View full page →
                  </a>
                ) : null}
              </div>
            ) : null}

            {/* ── Children list (when a chip is tapped) ── */}
            {activeChip && (
              <div className="mt-5 w-full" style={{ maxWidth: "22rem" }}>
                <div className="flex items-center justify-between mb-2">
                  <p
                    className="text-[0.625rem] font-bold uppercase tracking-wide"
                    style={{ color: "var(--color-ink-950)" }}
                  >
                    {node.orbits.find((o) => o.id === activeChip)?.label ?? "Items"}
                  </p>
                  <button
                    onClick={() => { setActiveChip(null); setChildren(null); }}
                    className="text-[0.5625rem] font-semibold press"
                    style={{ color: "var(--color-ink-500)" }}
                  >
                    Close list
                  </button>
                </div>

                {childrenLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="size-5 animate-spin" style={{ color: "var(--color-ink-300)" }} />
                  </div>
                ) : children && children.length > 0 ? (
                  <div className="grid grid-cols-2 gap-1.5">
                    {children.map((child) => (
                      <ChildCard key={child.id} child={child} onDrillDown={() => handleChildTap(child)} />
                    ))}
                  </div>
                ) : children && children.length === 0 ? (
                  <p className="text-center text-[0.5625rem] py-4" style={{ color: "var(--color-ink-500)" }}>
                    No items found
                  </p>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </>
  );

  if (inline) {
    return (
      <div
        className="flex flex-col rounded-[0.875rem] border overflow-hidden"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--color-paper-2)",
          minHeight: "60vh",
        }}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overlay-in"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full h-full max-w-[34rem] mx-auto flex flex-col sheet-in"
        style={{ backgroundColor: "var(--color-paper-2)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
}

/* ─── Center card with details ─── */
function CenterCard({ node, expanded }: { node: OrbitNode; expanded?: boolean }) {
  const icon = TYPE_ICONS[node.type] ?? "📍";
  return (
    <div
      className="w-full rounded-[0.75rem] border-2 p-2.5 text-center"
      style={{
        borderColor: "var(--color-ink-950)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      <div
        className="grid place-items-center w-10 h-10 rounded-[0.5rem] mx-auto mb-1 text-[1.5rem]"
        style={{ backgroundColor: "var(--color-concrete)" }}
      >
        {icon}
      </div>
      <p
        className="font-bold text-[0.6875rem] leading-tight line-clamp-2"
        style={{ color: "var(--color-ink-950)" }}
      >
        {node.title}
      </p>
      <p className="text-[0.5rem] mt-0.5 line-clamp-1" style={{ color: "var(--color-ink-500)" }}>
        {node.subtitle}
      </p>
      {node.meta ? (
        <p className="text-[0.5625rem] font-bold mt-1 tabular-nums" style={{ color: "var(--color-steel)" }}>
          {node.meta}
        </p>
      ) : null}

      {/* Quick details grid */}
      {node.details.length > 0 ? (
        <div className="mt-1.5 pt-1.5 border-t grid grid-cols-2 gap-x-2 gap-y-0.5 text-left" style={{ borderColor: "var(--color-line)" }}>
          {node.details.slice(0, 6).map((d, i) => (
            <div key={i} className="flex items-baseline justify-between gap-1 min-w-0">
              <span className="text-[0.4375rem] shrink-0" style={{ color: "var(--color-ink-500)" }}>
                {d.label}
              </span>
              <span className="text-[0.4375rem] font-semibold truncate tabular-nums" style={{ color: "var(--color-ink-950)" }}>
                {d.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* View full page link */}
      {node.href ? (
        <a
          href={node.href}
          className="mt-2 inline-flex items-center gap-1 text-[0.5rem] font-semibold underline"
          style={{ color: "var(--color-steel)" }}
        >
          <ExternalLink className="size-2.5" />
          Open page
        </a>
      ) : null}
    </div>
  );
}

/* ─── Child card — compact vertical card for 2-col grid ─── */
function ChildCard({ child, onDrillDown }: { child: ChildEntity; onDrillDown: () => void }) {
  const icon = TYPE_ICONS[child.type] ?? "📍";
  return (
    <div
      className="flex flex-col rounded-[0.5rem] border p-2 press"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      {/* Top row: icon + title + actions */}
      <div className="flex items-start gap-1.5">
        <span className="text-[0.75rem] leading-none shrink-0 mt-0.5">
          {icon}
        </span>
        <button
          onClick={onDrillDown}
          disabled={!child.hasChildren}
          className="min-w-0 flex-1 text-left"
          style={{ cursor: child.hasChildren ? "pointer" : "default" }}
        >
          <p
            className="text-[0.5625rem] font-semibold leading-tight line-clamp-2"
            style={{ color: "var(--color-ink-950)" }}
          >
            {child.title}
          </p>
        </button>
        <div className="flex items-center gap-0.5 shrink-0">
          {child.hasChildren ? (
            <button
              onClick={onDrillDown}
              className="grid place-items-center size-4 rounded-[0.25rem] press"
              style={{ color: "var(--color-ink-500)" }}
            >
              <ChevronRight className="size-3" />
            </button>
          ) : null}
          {child.href ? (
            <a
              href={child.href}
              className="grid place-items-center size-4 rounded-[0.25rem] press"
              style={{ color: "var(--color-steel)" }}
              title="Open full page"
            >
              <ExternalLink className="size-2.5" />
            </a>
          ) : null}
        </div>
      </div>

      {/* Subtitle */}
      <p className="text-[0.4375rem] mt-1 truncate" style={{ color: "var(--color-ink-500)" }}>
        {child.subtitle}
      </p>

      {/* Meta (price/value) */}
      {child.meta ? (
        <p className="text-[0.5rem] font-bold mt-0.5 truncate tabular-nums" style={{ color: "var(--color-steel)" }}>
          {child.meta}
        </p>
      ) : null}

      {/* Details — compact key:value rows */}
      {child.details.length > 0 ? (
        <div className="mt-1 pt-1 border-t space-y-0.5" style={{ borderColor: "var(--color-line)" }}>
          {child.details.slice(0, 4).map((d, i) => (
            <div key={i} className="flex items-baseline justify-between gap-1 min-w-0">
              <span className="text-[0.4375rem] shrink-0" style={{ color: "var(--color-ink-500)" }}>
                {d.label}
              </span>
              <span className="text-[0.4375rem] font-semibold truncate tabular-nums text-right" style={{ color: "var(--color-ink-700)" }}>
                {d.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
