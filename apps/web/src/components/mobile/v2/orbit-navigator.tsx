"use client";

import * as React from "react";
import {
  ChevronLeft,
  X,
  Loader2,
  ChevronRight,
  ExternalLink,
  type LucideIcon,
  ArrowLeftRight,
  Award,
  Banknote,
  Building,
  Building2,
  Calendar,
  ClipboardCheck,
  ClipboardList,
  Contact,
  DoorOpen,
  FileSignature,
  FileText,
  Filter,
  Globe,
  HardHat,
  Inbox,
  Key,
  Link2,
  Map,
  MapPin,
  Package,
  Receipt,
  ShoppingCart,
  Split,
  Trash2,
  Truck,
  User,
  Users,
  Wallet,
  Warehouse,
  Wrench,
} from "lucide-react";
import { MobileEmptyState } from "@/components/mobile/v2/primitives";

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

const TYPE_ICONS: Record<string, LucideIcon> = {
  company: Building2,
  project: HardHat,
  builtUnit: DoorOpen,
  landParcel: Map,
  landPurchase: Map,
  assetSale: ShoppingCart,
  department: Building,
  stockLocation: Warehouse,
  employee: User,
  equipment: Wrench,
  requisition: Inbox,
  purchaseOrder: FileText,
  materialIssue: Package,
  dpr: ClipboardList,
  portalListing: Globe,
  payment: Banknote,
  partition: Split,
  supplier: Building2,
  customer: Contact,
  vehicle: Truck,
  subcontractor: Award,
  expense: Wallet,
  lead: Filter,
  task: ClipboardCheck,
  scrapGeneration: Trash2,
  stockTransfer: ArrowLeftRight,
  projectPhase: Calendar,
  equipmentAssignment: Link2,
  crew: Users,
  tenancy: Key,
  saleExpense: Receipt,
  saleTerm: FileSignature,
};

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  projects: HardHat,
  land: Map,
  departments: Building,
  inventory: Warehouse,
  hr: Users,
  equipment: Wrench,
  builtUnits: DoorOpen,
  landParcels: Map,
  requisitions: Inbox,
  purchaseOrders: FileText,
  materialIssues: Package,
  dprs: ClipboardList,
  sales: ShoppingCart,
  portalListings: Globe,
  payments: Banknote,
  subParcels: Map,
  partitions: Split,
  suppliers: Building2,
  customers: Contact,
  vehicles: Truck,
  subcontractors: Award,
  expenses: Wallet,
  leads: Filter,
  tasks: ClipboardCheck,
  scrapGenerations: Trash2,
  stockTransfers: ArrowLeftRight,
  projectPhases: Calendar,
  equipmentAssignments: Link2,
  crews: Users,
  tenancies: Key,
  saleExpenses: Receipt,
  saleTerms: FileSignature,
  companies: Building2,
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

export function OrbitNavigator({
  initialNode,
  inline = false,
  open,
  onClose,
}: OrbitNavigatorProps) {
  const [node, setNode] = React.useState<OrbitNode | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [children, setChildren] = React.useState<ChildEntity[] | null>(null);
  const [childrenLoading, setChildrenLoading] = React.useState(false);
  const [breadcrumb, setBreadcrumb] = React.useState<BreadcrumbStep[]>([]);
  const [activeChip, setActiveChip] = React.useState<string | null>(null);
  const [cardExpanded, setCardExpanded] = React.useState(false);

  const fetchNode = React.useCallback(
    async (type: string, id: string) => {
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
          id,
          type,
          title: initialNode.title,
          subtitle: initialNode.subtitle,
          meta: initialNode.meta,
          href: "",
          details: [],
          orbits: [],
        });
      } finally {
        setLoading(false);
      }
    },
    [initialNode],
  );

  const fetchChildren = React.useCallback(
    async (chipId: string, parentType: string, parentId: string) => {
      setChildrenLoading(true);
      setActiveChip(chipId);
      try {
        const res = await fetch(
          `/api/orbit?mode=children&parentType=${parentType}&parentId=${parentId}&category=${chipId}`,
        );
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        setChildren(data.children as ChildEntity[]);
      } catch {
        setChildren([]);
      } finally {
        setChildrenLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    if (open && !node) {
      fetchNode(initialNode.type, initialNode.id);
      setBreadcrumb([
        {
          type: initialNode.type,
          id: initialNode.id,
          title: initialNode.title,
        },
      ]);
    }
  }, [open, node, initialNode, fetchNode]);

  React.useEffect(() => {
    if (!open && !inline) {
      const t = setTimeout(() => {
        setNode(null);
        setChildren(null);
        setBreadcrumb([]);
        setActiveChip(null);
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
    setBreadcrumb((prev) => [
      ...prev,
      { type: child.type, id: child.id, title: child.title },
    ]);
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
  // Ring geometry: radius as % of box width; the box is slightly taller
  // than wide (aspect 1/1.06) so bottom-row labels get a margin.
  const radiusPercent = 39;
  const CENTER_Y = 46;
  const W_TO_H = 100 / 108;
  const chipSize = chipCount > 14 ? "2rem" : chipCount > 10 ? "2.25rem" : "2.5rem";

  const content = (
    <>
      {/* ── Header: breadcrumb + close ── */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 border-b shrink-0"
        style={{
          borderColor: "var(--color-line)",
          backgroundColor: "var(--color-paper)",
        }}
      >
        {breadcrumb.length > 1 ? (
          <button
            onClick={handleBack}
            aria-label="Previous"
            className="touch grid place-items-center rounded-[0.5rem] text-m-body press shrink-0"
            style={{ color: "var(--color-ink-700)" }}
          >
            <ChevronLeft className="size-4" />
          </button>
        ) : null}

        <div className="flex-1 min-w-0 overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-1 w-max">
            {breadcrumb.map((step, i) => (
              <React.Fragment key={`${step.type}-${step.id}`}>
                {i > 0 && (
                  <ChevronRight
                    className="size-3 shrink-0"
                    style={{ color: "var(--color-ink-300)" }}
                  />
                )}
                <button
                  onClick={() => handleBreadcrumbTap(step, i)}
                  className="text-m-caption font-semibold whitespace-nowrap text-m-body press"
                  style={{
                    color:
                      i === breadcrumb.length - 1
                        ? "var(--color-ink-950)"
                        : "var(--color-ink-500)",
                  }}
                >
                  {(() => { const CrumbIcon = TYPE_ICONS[step.type] ?? MapPin; return <CrumbIcon className="size-3.5" />; })()}
                </button>
              </React.Fragment>
            ))}
          </div>
        </div>

        {!inline && onClose ? (
          <button
            onClick={onClose}
            aria-label="Close"
            className="touch grid place-items-center rounded-[0.5rem] text-m-body press shrink-0"
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
            <Loader2
              className="size-6 animate-spin"
              style={{ color: "var(--color-ink-300)" }}
            />
          </div>
        ) : node ? (
          <div className="flex flex-col items-center px-2 pt-4 pb-8">
            {/* ── Orbit ring (center card + circular chips) ──
                Geometry: the ring uses the full content width. Each chip's
                CIRCLE is anchored exactly on the ring (the label hangs below
                as an absolutely-positioned caption so it never shifts the
                anchor). Count rides as a corner badge — one visual unit
                per node keeps the ring readable at 12+ chips. */}
            <div
              className="relative w-full"
              style={{ maxWidth: "23rem", aspectRatio: "1 / 1.08" }}
            >
              {/* Orbit chips in a ring — fade + scale behind when card is expanded */}
              {chipCount > 0 ? (
                <>
                  {/* Orbit track — a single hairline circle the nodes sit on */}
                  <div
                    className="absolute left-1/2 -translate-x-1/2 rounded-full border transition-all duration-300"
                    style={{
                      top: `${CENTER_Y}%`,
                      width: `${radiusPercent * 2}%`,
                      aspectRatio: "1 / 1",
                      borderColor: "var(--color-line)",
                      opacity: cardExpanded ? 0 : 1,
                      transform: cardExpanded
                        ? "translate(-50%, -50%) scale(0.6)"
                        : "translate(-50%, -50%) scale(1)",
                    }}
                  />

                  {orbitChips.map((chip, i) => {
                    const angle =
                      (chipCount === 1 ? -90 : -90 + (360 / chipCount) * i) *
                      (Math.PI / 180);
                    const x = 50 + radiusPercent * Math.cos(angle);
                    const y = CENTER_Y + radiusPercent * W_TO_H * Math.sin(angle);
                    const isActive = activeChip === chip.id;
                    const isEmpty = chip.count === 0;
                    // Labels point away from the center card: chips in the
                    // upper half get their label above the node, lower half
                    // below. Stops upper-diagonal labels from slipping under
                    // the center card's edge.
                    const labelAbove = Math.sin(angle) < -0.15;

                    return (
                      <button
                        key={chip.id}
                        onClick={() => handleChipTap(chip)}
                        disabled={isEmpty || cardExpanded}
                        title={chip.label}
                        className="absolute z-20 text-m-body transition-all duration-300"
                        style={{
                          left: `${x}%`,
                          top: `${y}%`,
                          transform: cardExpanded
                            ? "translate(-50%, -50%) scale(0.3)"
                            : "translate(-50%, -50%)",
                          opacity: cardExpanded ? 0 : 1,
                          pointerEvents: cardExpanded ? "none" : "auto",
                        }}
                      >
                        {/* Entrance wrapper — scale+fade stagger; keeps the
                            button's positioning transform untouched. */}
                        <div
                          className="orbit-node-in relative"
                          style={{ animationDelay: `${i * 30}ms` }}
                        >
                          {/* Node circle — anchored exactly on the ring */}
                          <div
                            className="press relative grid place-items-center rounded-full border transition-all"
                            style={{
                              width: chipSize,
                              height: chipSize,
                              borderColor: isActive
                                ? "var(--color-ink-950)"
                                : "var(--color-line)",
                              backgroundColor: isActive
                                ? "var(--color-concrete)"
                                : "var(--color-paper)",
                              boxShadow: isActive
                                ? "0 2px 8px rgba(0,0,0,0.14)"
                                : "0 1px 2px rgba(0,0,0,0.05)",
                              transform: isActive ? "scale(1.12)" : undefined,
                            }}
                          >
                            {(() => { const ChipIcon = CATEGORY_ICONS[chip.id] ?? MapPin; return <ChipIcon className="size-4" style={{ color: isEmpty ? "var(--color-ink-300)" : "var(--color-ink-700)" }} />; })()}
                            {/* Count — corner badge, always readable */}
                            <span
                              className="absolute -top-1.5 -right-1.5 grid place-items-center min-w-4 h-4 rounded-full px-1 text-m-micro font-bold tabular-nums"
                              style={{
                                backgroundColor: isEmpty
                                  ? "var(--color-concrete)"
                                  : "var(--color-ink-950)",
                                color: isEmpty
                                  ? "var(--color-ink-500)"
                                  : "var(--color-paper)",
                              }}
                            >
                              {chip.count > 99 ? "99" : chip.count}
                            </span>
                          </div>
                          {/* Label — radially outward, never moves the anchor */}
                          <span
                            className={`absolute left-1/2 -translate-x-1/2 w-20 text-center text-m-caption font-semibold leading-tight line-clamp-2 ${labelAbove ? "bottom-full mb-1" : "top-full mt-1"}`}
                            style={{
                              color: isEmpty
                                ? "var(--color-ink-300)"
                                : "var(--color-ink-950)",
                            }}
                          >
                            {chip.label}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </>
              ) : null}

              {/* Center card — expands to fill orbit area when tapped */}
              <div
                className="absolute left-1/2 z-30 transition-all duration-300"
                style={{
                  top: `${CENTER_Y}%`,
                  width: cardExpanded ? "100%" : "46%",
                  height: cardExpanded ? "100%" : "auto",
                  transform: "translate(-50%, -50%)",
                }}
              >
                <button
                  onClick={() => setCardExpanded((v) => !v)}
                  className="block w-full h-full text-left text-m-body press"
                >
                  <CenterCard node={node} expanded={cardExpanded} />
                </button>
              </div>
            </div>

            {/* ── End-of-line message (no orbits) ── */}
            {chipCount === 0 ? (
              <div className="mt-4 text-center">
                <p
                  className="text-m-label"
                  style={{ color: "var(--color-ink-500)" }}
                >
                  End of the line — no further details to explore
                </p>
                {node.href ? (
                  <a
                    href={node.href}
                    className="mt-2 inline-flex items-center gap-1 text-m-label font-semibold underline"
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
                    className="text-m-label font-bold uppercase tracking-wide"
                    style={{ color: "var(--color-ink-950)" }}
                  >
                    {node.orbits.find((o) => o.id === activeChip)?.label ??
                      "Items"}
                  </p>
                  <button
                    onClick={() => {
                      setActiveChip(null);
                      setChildren(null);
                    }}
                    className="text-m-caption font-semibold text-m-body press"
                    style={{ color: "var(--color-ink-500)" }}
                  >
                    Close list
                  </button>
                </div>

                {childrenLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2
                      className="size-5 animate-spin"
                      style={{ color: "var(--color-ink-300)" }}
                    />
                  </div>
                ) : children && children.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {children.map((child) => (
                      <ChildCard
                        key={child.id}
                        child={child}
                        onDrillDown={() => handleChildTap(child)}
                      />
                    ))}
                  </div>
                ) : children && children.length === 0 ? (
                  <MobileEmptyState title="No items found" size="compact" />
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
        className="flex flex-col rounded-[0.75rem] border overflow-hidden"
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
function CenterCard({
  node,
  expanded: _expanded,
}: {
  node: OrbitNode;
  expanded?: boolean;
}) {
  const Icon = TYPE_ICONS[node.type] ?? MapPin;
  return (
    <div
      className="w-full rounded-[0.75rem] border-2 p-2.5 text-center"
      style={{
        borderColor: "var(--color-ink-950)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      <div
        className="grid place-items-center w-10 h-10 rounded-[0.5rem] mx-auto mb-1 text-m-section"
        style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-700)" }}
      >
        <Icon className="size-5" />
      </div>
      <p
        className="font-bold text-m-body leading-tight line-clamp-2"
        style={{ color: "var(--color-ink-950)" }}
      >
        {node.title}
      </p>
      <p
        className="text-m-caption mt-0.5 line-clamp-1"
        style={{ color: "var(--color-ink-500)" }}
      >
        {node.subtitle}
      </p>
      {node.meta ? (
        <p
          className="text-m-caption font-bold mt-1 tabular-nums"
          style={{ color: "var(--color-steel)" }}
        >
          {node.meta}
        </p>
      ) : null}

      {/* Quick details grid */}
      {node.details.length > 0 ? (
        <div
          className="mt-1.5 pt-1.5 border-t grid grid-cols-2 gap-x-2 gap-y-0.5 text-left"
          style={{ borderColor: "var(--color-line)" }}
        >
          {node.details.slice(0, 6).map((d, i) => (
            <div key={i} className="min-w-0">
              <span
                className="block text-m-micro leading-tight truncate"
                style={{ color: "var(--color-ink-500)" }}
              >
                {d.label}
              </span>
              <span
                className="block text-m-caption font-semibold leading-tight truncate tabular-nums"
                style={{ color: "var(--color-ink-950)" }}
              >
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
          className="mt-2 inline-flex items-center gap-1 text-m-caption font-semibold underline"
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
function ChildCard({
  child,
  onDrillDown,
}: {
  child: ChildEntity;
  onDrillDown: () => void;
}) {
  const Icon = TYPE_ICONS[child.type] ?? MapPin;
  return (
    <div
      className="flex flex-col rounded-[0.5rem] border p-2 text-m-body press"
      style={{
        borderColor: "var(--color-line)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      {/* Top row: icon + title + actions */}
      <div className="flex items-start gap-1.5">
        <span className="shrink-0 mt-0.5" style={{ color: "var(--color-ink-500)" }}>
          <Icon className="size-4" />
        </span>
        <button
          onClick={onDrillDown}
          disabled={!child.hasChildren}
          className="min-w-0 flex-1 text-left"
          style={{ cursor: child.hasChildren ? "pointer" : "default" }}
        >
          <p
            className="text-m-caption font-semibold leading-tight line-clamp-2"
            style={{ color: "var(--color-ink-950)" }}
          >
            {child.title}
          </p>
        </button>
        <div className="flex items-center gap-0.5 shrink-0">
          {child.hasChildren ? (
            <button
              onClick={onDrillDown}
              aria-label="Next step"
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
      <p
        className="text-m-caption mt-1 truncate"
        style={{ color: "var(--color-ink-500)" }}
      >
        {child.subtitle}
      </p>

      {/* Meta (price/value) */}
      {child.meta ? (
        <p
          className="text-m-caption font-bold mt-0.5 truncate tabular-nums"
          style={{ color: "var(--color-steel)" }}
        >
          {child.meta}
        </p>
      ) : null}

      {/* Details — compact key:value rows */}
      {child.details.length > 0 ? (
        <div
          className="mt-1 pt-1 border-t space-y-0.5"
          style={{ borderColor: "var(--color-line)" }}
        >
          {child.details.slice(0, 4).map((d, i) => (
            <div
              key={i}
              className="flex items-baseline justify-between gap-1 min-w-0"
            >
              <span
                className="text-m-caption shrink-0"
                style={{ color: "var(--color-ink-500)" }}
              >
                {d.label}
              </span>
              <span
                className="text-m-caption font-semibold truncate tabular-nums text-right"
                style={{ color: "var(--color-ink-700)" }}
              >
                {d.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
