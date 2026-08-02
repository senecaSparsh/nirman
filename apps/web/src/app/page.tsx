import { connection } from "next/server";
import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@nirman/db";
import {
  materialInventoryValue,
  unsoldAssetValue,
} from "@nirman/services";
import {
  ArrowRight,
  Truck,
  Package,
  TrendingUp,
  Building2,
  AlertTriangle,
  Activity,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { getCompany, toNum } from "@/lib/server";
import { MyTasksPanel } from "@/components/tasks/my-tasks-panel";
import { PipelineFlow } from "@/components/pipeline-flow";

export default function CommandCenterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center text-meta text-muted-foreground">
          Loading…
        </div>
      }
    >
      <CommandCenterContent />
    </Suspense>
  );
}

async function CommandCenterContent() {
  await connection();
  const company = await getCompany();

  const [
    inventoryVal,
    unsoldAssets,
    activeProjects,
    lowStockItems,
    recentMovements,
    draftPOs,
    pendingRequisitions,
    overduePOs,
    recentSales,
    recentIssues,
    equipmentCount,
    fieldPOs,
    unitCount,
  ] = await Promise.all([
    materialInventoryValue(company.id),
    unsoldAssetValue(company.id),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
      include: { phases: { select: { status: true } }, _count: { select: { builtUnits: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.material.findMany({
      where: { deletedAt: null, minStock: { not: null } },
      select: {
        id: true, code: true, name: true, unit: true, minStock: true,
        stockItems: { where: { location: { deletedAt: null, companyId: company.id } }, select: { qty: true } },
      },
    }),
    prisma.stockMovement.findMany({
      where: { OR: [{ fromLocation: { companyId: company.id } }, { toLocation: { companyId: company.id } }] },
      orderBy: { timestamp: "desc" },
      take: 20,
      include: {
        material: { select: { name: true, unit: true } },
        fromLocation: { select: { name: true } },
        toLocation: { select: { name: true } },
      },
    }),
    prisma.purchaseOrder.findMany({
      where: { companyId: company.id, status: "DRAFT" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { supplier: { select: { name: true } }, lines: { select: { qtyOrdered: true } } },
    }),
    prisma.materialRequisition.findMany({
      where: { project: { companyId: company.id }, status: "SUBMITTED" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { project: { select: { name: true } }, lines: { select: { qtyRequested: true } } },
    }),
    prisma.purchaseOrder.findMany({
      where: { companyId: company.id, status: { in: ["ORDERED", "PARTIAL"] }, expectedDate: { lt: new Date() } },
      orderBy: { expectedDate: "asc" },
      take: 5,
      include: { supplier: { select: { name: true } }, lines: { select: { qtyOrdered: true, qtyReceived: true } } },
    }),
    prisma.assetSale.findMany({
      where: { companyId: company.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { customer: { select: { name: true } } },
    }),
    prisma.materialIssue.findMany({
      where: {
        OR: [
          { project: { companyId: company.id } },
          { department: { companyId: company.id } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        project: { select: { name: true } },
        department: { select: { name: true, code: true } },
        fromLocation: { select: { name: true } },
      },
    }),
    prisma.equipment.count({
      where: { companyId: company.id, deletedAt: null, status: { not: "RETIRED" } },
    }),
    prisma.purchaseOrder.count({
      where: { companyId: company.id, status: { in: ["ORDERED", "PARTIAL"] } },
    }),
    prisma.builtUnit.count({
      where: { project: { companyId: company.id }, deletedAt: null, status: { in: ["AVAILABLE", "UNDER_CONSTRUCTION", "PLANNED"] } },
    }),
  ]);

  const lowStock = lowStockItems
    .map((m) => {
      const totalQty = m.stockItems.reduce((s, i) => s + toNum(i.qty), 0);
      const minStock = toNum(m.minStock);
      return { id: m.id, code: m.code, name: m.name, unit: m.unit, totalQty, minStock, shortfall: minStock - totalQty };
    })
    .filter((m) => m.totalQty < m.minStock)
    .sort((a, b) => b.shortfall - a.shortfall)
    .slice(0, 5);

  // Build unified activity feed
  type FeedItem = {
    id: string;
    timestamp: Date;
    icon: typeof Activity;
    title: string;
    subtitle: string;
    href: string;
    kind: "receipt" | "issue" | "transfer" | "sale" | "other";
  };

  const feed: FeedItem[] = [];

  for (const m of recentMovements) {
    const type = m.movementType;
    feed.push({
      id: m.id,
      timestamp: m.timestamp,
      icon: type === "PURCHASE_RECEIPT" ? Truck : type === "ISSUE_TO_PROJECT" ? Package : type === "TRANSFER_IN" || type === "TRANSFER_OUT" ? ArrowRight : Activity,
      title: `${formatNumber(toNum(m.qty), 0)} ${m.material.unit} ${m.material.name}`,
      subtitle: type === "PURCHASE_RECEIPT"
        ? `Received at ${m.toLocation?.name ?? "—"}`
        : type === "ISSUE_TO_PROJECT"
          ? `Issued from ${m.fromLocation?.name ?? "—"}`
          : `${m.fromLocation?.name ?? "—"} → ${m.toLocation?.name ?? "—"}`,
      href: "/stock-movements",
      kind: type === "PURCHASE_RECEIPT" ? "receipt" : type === "ISSUE_TO_PROJECT" ? "issue" : "transfer",
    });
  }

  for (const sale of recentSales) {
    feed.push({
      id: sale.id,
      timestamp: sale.createdAt,
      icon: TrendingUp,
      title: `${formatCurrency(toNum(sale.salePrice))}`,
      subtitle: `${sale.customer.name}`,
      href: "/sales",
      kind: "sale",
    });
  }

  for (const issue of recentIssues) {
    feed.push({
      id: issue.id,
      timestamp: issue.createdAt,
      icon: Package,
      title: `Issued to ${issue.project?.name ?? (`${issue.department?.code ?? ""} ${issue.department?.name ?? ""}`.trim() || "—")}`,
      subtitle: `From ${issue.fromLocation?.name ?? "—"}`,
      href: "/stock-movements",
      kind: "issue",
    });
  }

  feed.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  const feedTop = feed.slice(0, 15);

  const actionCount = draftPOs.length + pendingRequisitions.length + overduePOs.length + lowStock.length;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* ── Header — minimal, no card wrapper ─────────────────────── */}
      <div className="pt-2">
        <h1 className="text-2xl font-bold tracking-tight">Command Center</h1>
        <p className="mt-1 text-meta text-muted-foreground">
          {activeProjects.length} projects · {formatCurrency(toNum(inventoryVal))} inventory · {fieldPOs} in transit
          {actionCount > 0 && <span className="text-warning"> · {actionCount} actions needed</span>}
        </p>
      </div>

      {/* ── Pipeline — the flow, not a card grid ──────────────────── */}
      <PipelineFlow
        procure={{ poCount: fieldPOs, inventoryValue: toNum(inventoryVal) }}
        build={{ projectCount: activeProjects.length, equipmentCount }}
        sell={{ unsoldValue: toNum(unsoldAssets.total), unitCount }}
      />

      {/* ── My Tasks — inline, no card chrome ─────────────────────── */}
      <MyTasksPanel limit={5} />

      {/* ── Main split: activity feed + context sidebar ─────────────
          NOT a card grid. A real two-column layout where the left
          column is the primary content (live feed) and the right
          column is contextual (actions + projects). */}
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">

        {/* ── Left: Live Activity Feed ────────────────────────────── */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-muted-foreground" />
            <h2 className="text-label text-muted-foreground">Live Activity</h2>
          </div>

          {feedTop.length === 0 ? (
            <p className="py-12 text-center text-body text-muted-foreground">
              No recent activity.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {feedTop.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="group flex items-center gap-3 py-2.5 transition-colors hover:bg-muted/30 -mx-2 px-2 rounded-md"
                  >
                    {/* Icon — no colored circle, just the icon */}
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-body font-medium">{item.title}</div>
                      <div className="truncate text-caption text-muted-foreground">{item.subtitle}</div>
                    </div>

                    {/* Timestamp — relative, monospace */}
                    <span className="shrink-0 text-micro text-muted-foreground tnum">
                      {timeAgo(item.timestamp)}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Right: Context sidebar — actions + projects ────────── */}
        <div className="space-y-6">

          {/* Actions needed — no card, just a section */}
          {actionCount > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                <h2 className="text-label text-muted-foreground">Actions Needed</h2>
                <span className="text-micro font-semibold text-warning tnum">{actionCount}</span>
              </div>

              <div className="space-y-3">
                {draftPOs.length > 0 && (
                  <ActionSection
                    title="POs to approve"
                    count={draftPOs.length}
                    href="/procurement"
                    items={draftPOs.map((po) => ({
                      label: po.poNumber,
                      sub: po.supplier.name,
                    }))}
                  />
                )}
                {pendingRequisitions.length > 0 && (
                  <ActionSection
                    title="Requisitions"
                    count={pendingRequisitions.length}
                    href="/approvals"
                    items={pendingRequisitions.map((req) => ({
                      label: req.project.name,
                      sub: `${req.lines.reduce((s, l) => s + toNum(l.qtyRequested), 0)} units`,
                    }))}
                  />
                )}
                {overduePOs.length > 0 && (
                  <ActionSection
                    title="Overdue deliveries"
                    count={overduePOs.length}
                    href="/procurement"
                    items={overduePOs.map((po) => ({
                      label: po.poNumber,
                      sub: `${po.supplier.name} · ${formatDate(po.expectedDate!)}`,
                    }))}
                  />
                )}
                {lowStock.length > 0 && (
                  <ActionSection
                    title="Low stock"
                    count={lowStock.length}
                    href="/materials"
                    items={lowStock.map((m) => ({
                      label: m.name,
                      sub: `${formatNumber(m.totalQty, 0)} ${m.unit} left`,
                    }))}
                  />
                )}
              </div>
            </div>
          )}

          {/* Projects — compact list, no cards */}
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              <h2 className="text-label text-muted-foreground">Projects</h2>
            </div>

            {activeProjects.length === 0 ? (
              <p className="text-body text-muted-foreground">No active projects.</p>
            ) : (
              <div className="space-y-1">
                {activeProjects.slice(0, 6).map((project) => {
                  const activePhases = project.phases.filter((p) => p.status === "ACTIVE").length;
                  return (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}`}
                      className="group block rounded-md px-2 py-2 transition-colors hover:bg-muted/40 -mx-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-body font-medium">{project.name}</span>
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${project.status === "ACTIVE" ? "bg-success" : "bg-muted-foreground/40"}`} />
                      </div>
                      <div className="mt-0.5 text-caption text-muted-foreground">
                        {activePhases} phases · {project._count.builtUnits} units
                      </div>
                    </Link>
                  );
                })}
                {activeProjects.length > 6 && (
                  <Link
                    href="/projects"
                    className="block px-2 py-1.5 text-caption text-muted-foreground hover:text-foreground -mx-2"
                  >
                    View all {activeProjects.length} →
                  </Link>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function ActionSection({
  title,
  count,
  href,
  items,
}: {
  title: string;
  count: number;
  href: string;
  items: { label: string; sub: string }[];
}) {
  return (
    <Link href={href} className="group block">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-caption font-semibold text-foreground">{title}</span>
        <span className="text-micro font-semibold text-warning tnum">{count}</span>
      </div>
      <div className="space-y-0.5">
        {items.slice(0, 3).map((item, i) => (
          <div key={i} className="flex items-center justify-between text-caption">
            <span className="truncate font-medium text-foreground">{item.label}</span>
            <span className="ml-2 shrink-0 truncate text-muted-foreground">{item.sub}</span>
          </div>
        ))}
        {items.length > 3 && (
          <div className="text-micro text-muted-foreground">+{items.length - 3} more</div>
        )}
      </div>
    </Link>
  );
}

/** Relative time — "2m", "3h", "1d" */
function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  if (h < 24) return `${h}h`;
  if (d < 7) return `${d}d`;
  return formatDate(date);
}
