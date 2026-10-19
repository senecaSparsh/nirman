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
import Link from "next/link";
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

type LabelSpot = { side: "above" | "below" | "left" | "right"; row: number; dx: number };
type Box = { x0: number; y0: number; x1: number; y1: number };

// Collision-aware label placement for the ring (nominal box 344 × 372px, 1 : 1.08).
// Each label tries its own side of the chip in stacked rows, sliding
// horizontally when a neighbour is in the way, then beside the chip, then the
// opposite side. Anything still colliding drops to icon + count (the name
// stays in the chip's accessible label and the list it opens).
function layoutOrbitLabels(
  chips: { x: number; y: number; label: string; above: boolean }[],
  chipRem: number,
  card: { yPct: number; halfW: number; halfH: number },
  inline: boolean,
): (LabelSpot | null)[] {
  const W = 344;
  const H = 372;
  const LH = 16;
  const rC = chipRem * 8;
  const gap = rC + 6;
  const pts = chips.map((c) => ({ x: (c.x / 100) * W, y: (c.y / 100) * H }));
  const cy = (card.yPct / 100) * H;
  const cardBox: Box = { x0: W / 2 - card.halfW, x1: W / 2 + card.halfW, y0: cy - card.halfH, y1: cy + card.halfH };
  const chipBoxes = pts.map((p) => ({ x0: p.x - rC - 4, x1: p.x + rC + 4, y0: p.y - rC - 4, y1: p.y + rC + 4 }));
  // Inline orbits sit in page flow where the floating chat button overlays
  // the ring's bottom-right quadrant — keep labels out of that zone.
  const extras: Box[] = inline ? [{ x0: 326, x1: 400, y0: 225, y1: 290 }] : [];
  const hits = (a: Box, b: Box) => a.x0 < b.x1 + 2 && a.x1 > b.x0 - 2 && a.y0 < b.y1 + 2 && a.y1 > b.y0 - 2;
  const placed: Box[] = [];
  const SLIDES = [0, 14, -14, 28, -28, 42, -42];
  return chips.map((chip, i) => {
    const p = pts[i]!;
    const w = Math.min(96, chip.label.length * 6.2 + 6);
    const near = (row: number, up: boolean, dx: number): Box => {
      const y0 = up ? p.y - 25.6 - 19.2 * row - LH : p.y + 22.4 + 19.2 * row;
      return { x0: p.x + dx - w / 2, x1: p.x + dx + w / 2, y0, y1: y0 + LH };
    };
    const beside = (left: boolean): Box => ({
      x0: left ? p.x - gap - w : p.x + gap,
      x1: left ? p.x - gap : p.x + gap + w,
      y0: p.y - LH / 2,
      y1: p.y + LH / 2,
    });
    const up = chip.above;
    const outward = p.x >= W / 2;
    const rows = up ? 2 : 3;
    const cands: [LabelSpot, Box][] = [];
    for (let row = 0; row <= rows; row++) {
      for (const dx of SLIDES) {
        cands.push([{ side: up ? "above" : "below", row, dx }, near(row, up, dx)]);
      }
    }
    cands.push(
      [{ side: outward ? "right" : "left", row: 0, dx: 0 }, beside(!outward)],
      [{ side: outward ? "left" : "right", row: 0, dx: 0 }, beside(outward)],
    );
    for (let row = 0; row <= 1; row++) {
      cands.push([{ side: up ? "below" : "above", row, dx: 0 }, near(row, !up, 0)]);
    }
    const free = ([, b]: [LabelSpot, Box]) =>
      b.x0 >= -8 && b.x1 <= W + 8 && b.y0 >= -16 && b.y1 <= H + 16 &&
      !hits(b, cardBox) &&
      extras.every((e) => !hits(b, e)) &&
      chipBoxes.every((c, j) => j === i || !hits(b, c)) &&
      placed.every((q) => !hits(b, q));
    const hit = cands.find(free);
    if (!hit) return null;
    placed.push(hit[1]);
    return hit[0];
  });
}

function labelTransform({ side, row, dx }: LabelSpot, chipRem: number) {
  const x = dx === 0 ? "-50%" : `calc(-50% + ${dx}px)`;
  if (side === "above") return `translate(${x}, calc(-100% - ${1.6 + 1.2 * row}rem))`;
  if (side === "below") return `translate(${x}, ${1.4 + 1.2 * row}rem)`;
  const off = `${chipRem / 2 + 0.375}rem`;
  return side === "left" ? `translate(calc(-100% - ${off}), -50%)` : `translate(${off}, -50%)`;
}

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
  // 35% (was 39) — at 39% the outermost nodes' 80px labels overflowed the
  // content box: a node at x≈89% centers its w-20 label at the 89% mark, so
  // ~15px of the label clipped off the right edge ("Customers" → "ustomers").
  const radiusPercent = 35;
  const CENTER_Y = 46;
  const W_TO_H = 100 / 108;
  const chipRem = chipCount > 14 ? 1.8 : chipCount > 10 ? 2.25 : 2.5;
  const chipSize = `${chipRem}rem`;
  const labelSpots = layoutOrbitLabels(
    orbitChips.map((chip, i) => {
      const angle = (chipCount === 1 ? -90 : -90 + (360 / chipCount) * i) * (Math.PI / 180);
      return {
        x: 50 + radiusPercent * Math.cos(angle),
        y: CENTER_Y + radiusPercent * W_TO_H * Math.sin(angle),
        label: chip.label,
        above: Math.sin(angle) < -0.15,
      };
    }),
    chipRem,
    { yPct: CENTER_Y, halfW: 62, halfH: 60 },
    inline,
  );

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
                    className="absolute left-1/2 rounded-full border transition-all duration-300"
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
                    // Labels render in a second pass above all chips (below).

                    return (
                      <button
                        key={chip.id}
                        onClick={() => handleChipTap(chip)}
                        disabled={isEmpty || cardExpanded}
                        title={chip.label}
                        aria-label={chip.label}
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
                        </div>
                      </button>
                    );
                  })}

                  {/* Labels — a second pass at z-40 so every label paints above
                      every chip. Inside-button labels got covered by the next
                      chip down the ring ("Workforce" → "orce"); this layer is
                      click-through (pointer-events-none) so taps reach the chips. */}
                  {orbitChips.map((chip, i) => {
                    const angle =
                      (chipCount === 1 ? -90 : -90 + (360 / chipCount) * i) *
                      (Math.PI / 180);
                    const x = 50 + radiusPercent * Math.cos(angle);
                    const y = CENTER_Y + radiusPercent * W_TO_H * Math.sin(angle);
                    const spot = labelSpots[i];
                    if (!spot) return null;
                    return (
                      <span
                        key={`${chip.id}-label`}
                        aria-hidden
                        className="pointer-events-none absolute z-40 w-auto max-w-24 whitespace-nowrap text-m-caption font-semibold leading-tight truncate text-center transition-opacity duration-300"
                        style={{
                          left: `${x}%`,
                          top: `${y}%`,
                          transform: labelTransform(spot, chipRem),
                          opacity: cardExpanded ? 0 : 1,
                          color:
                            chip.count === 0
                              ? "var(--color-ink-300)"
                              : "var(--color-ink-950)",
                          backgroundColor:
                            "color-mix(in srgb, var(--color-paper) 88%, transparent)",
                          borderRadius: "0.25rem",
                          padding: "0 0.125rem",
                        }}
                      >
                        {chip.label}
                      </span>
                    );
                  })}
                </>
              ) : null}

              {/* Center card — expands to fill orbit area when tapped */}
              <div
                className="absolute left-1/2 z-30 transition-all duration-300"
                style={{
                  top: `${CENTER_Y}%`,
                  width: cardExpanded ? "100%" : "36%",
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
                  <Link
                    href={node.href}
                    prefetch
                    className="mt-2 inline-flex items-center gap-1 text-m-label font-semibold underline"
                    style={{ color: "var(--color-steel)" }}
                  >
                    View full page →
                  </Link>
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
  expanded,
}: {
  node: OrbitNode;
  expanded?: boolean;
}) {
  const Icon = TYPE_ICONS[node.type] ?? MapPin;
  return (
    <div
      className="w-full rounded-[0.75rem] border-2 p-2 text-center"
      style={{
        borderColor: "var(--color-ink-950)",
        backgroundColor: "var(--color-paper)",
      }}
    >
      <div
        className="grid place-items-center w-7 h-7 rounded-[0.5rem] mx-auto mb-0.5"
        style={{ backgroundColor: "var(--color-concrete)", color: "var(--color-ink-700)" }}
      >
        <Icon className="size-4" />
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

      {/* Quick details grid — only once the card is expanded; the collapsed
          ring card stays compact enough to clear every chip. */}
      {expanded && node.details.length > 0 ? (
        <div
          className="mt-1 pt-1 border-t grid grid-cols-2 gap-x-2 gap-y-0.5 text-left"
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
        <Link
          href={node.href}
          prefetch
          className="mt-1 inline-flex items-center gap-1 text-m-label font-semibold underline"
          style={{ color: "var(--color-steel)" }}
        >
          <ExternalLink className="size-2.5" />
          Open page
        </Link>
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
            <Link
              href={child.href}
              prefetch
              className="grid place-items-center size-4 rounded-[0.25rem] press"
              style={{ color: "var(--color-steel)" }}
              title="Open full page"
            >
              <ExternalLink className="size-2.5" />
            </Link>
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
