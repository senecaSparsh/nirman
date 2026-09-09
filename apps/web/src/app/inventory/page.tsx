import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole, scopeWhere } from "@/lib/server";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";

export const metadata = { title: "Inventory" };

/**
 * /inventory — desktop inventory hub.
 *
 * The bird's-eye view of everything in the inventory module: attention
 * banners for low-stock and pending approvals, a summary of key metrics
 * (total stock value, low-stock count, pending indents), the company-group
 * inventory tree, and quick links into the Materials catalogue, Stock hub,
 * and Locations.
 *
 * Mirrors the mobile `/m/inventory` page but renders as a server component
 * with desktop density (no carousel — banners stack vertically, the tree
 * renders inline, and the metrics live in the PageHeader stats band).
 */
export default function InventoryPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading inventory…" variant="list" />}>
        <InventoryContent />
      </Suspense>
    </div>
  );
}

async function InventoryContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.INVENTORY_VIEW)) {
    return <NoAccess what="inventory" />;
  }

  const [draftPOs, pendingReqs, recentRequisitions, materials, locationCount] =
    await Promise.all([
      // Draft purchase orders awaiting approval.
      prisma.purchaseOrder.count({
        where: { companyId: company.id, status: "DRAFT" },
      }),
      // Pending material requisitions (indents) awaiting approval.
      prisma.materialRequisition.count({
        where: { project: { companyId: company.id }, status: "SUBMITTED" },
      }),
      // Most recent pending indents for the "Pending indents" list.
      prisma.materialRequisition.findMany({
        where: {...await scopeWhere("MaterialRequisition"),  project: { companyId: company.id }, status: "SUBMITTED" },
        orderBy: { createdAt: "desc" },
        take: 6,
        include: { project: { select: { name: true } } },
      }),
      // Materials that carry stock in this company or have a reorder point
      // set — used to derive stock-health metrics (low / out of stock).
      prisma.material.findMany({
        where: {
          deletedAt: null,
          OR: [
            { stockItems: { some: { location: { companyId: company.id } } } },
            { reorderPoint: { not: null } },
          ],
        },
        select: {
          id: true,
          code: true,
          name: true,
          unit: true,
          minStock: true,
          reorderPoint: true,
          category: { select: { name: true } },
          stockItems: {
            where: { location: { companyId: company.id } },
            select: { qty: true, movingAvgCost: true },
          },
        },
        orderBy: { name: "asc" },
      }),
      // Active stock locations in this company (for the "Locations" stat).
      prisma.stockLocation.count({
        where: { companyId: company.id, deletedAt: null },
      }),
    ]);

  // ── Derive stock health metrics ──
  const materialRows = materials.map((m) => {
    const totalQty = m.stockItems.reduce((s, i) => s + toNum(i.qty), 0);
    const stockValue = m.stockItems.reduce(
      (s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost),
      0,
    );
    const reorderPoint = m.reorderPoint ? toNum(m.reorderPoint) : null;
    const isLow = reorderPoint != null && totalQty < reorderPoint;
    const isOut = totalQty <= 0;
    return {
      id: m.id,
      code: m.code,
      name: m.name,
      unit: m.unit,
      categoryName: m.category.name,
      totalQty,
      stockValue,
      reorderPoint,
      isLow,
      isOut,
    };
  });

  const totalStockValue = materialRows.reduce((s, m) => s + m.stockValue, 0);
  const lowStockCount = materialRows.filter((m) => m.isLow && !m.isOut).length;
  const outOfStockCount = materialRows.filter((m) => m.isOut).length;
  const approvalCount = draftPOs + pendingReqs;

  // ── Attention banners ──
  // Out-of-stock (red) first, then low-stock (amber), then pending approvals
  // (amber). If everything is healthy, show a green "all caught up" banner.
  const outOfStock = materialRows.filter((m) => m.isOut);
  const lowStock = materialRows.filter((m) => m.isLow && !m.isOut);

  return (
    <>
      <PageHeader
        title="Inventory"
        description="The inventory hub — stock health, pending approvals, and the company-group inventory tree. Drill into Materials for the catalogue, Stock for the full stock lifecycle, or Locations for warehouses and project sites."
        stats={[
          {
            label: "Stock value",
            value: formatCurrency(totalStockValue),
            hint: "Total value of on-hand stock across this company's locations, valued at moving average cost.",
          },
          {
            label: "Low stock",
            value: lowStockCount + outOfStockCount,
            tone: lowStockCount + outOfStockCount > 0 ? "warning" : "success",
            hint: "Materials whose current stock has fallen below their reorder point, including out-of-stock items.",
          },
          {
            label: "Pending indents",
            value: pendingReqs,
            tone: pendingReqs > 0 ? "warning" : "default",
            hint: "Material requisitions (indents) submitted and awaiting approval.",
          },
          {
            label: "Locations",
            value: locationCount,
            hint: "Active stock locations (warehouses, project sites) in this company.",
          },
        ]}
      />

      {/* ── Attention banners ── */}
      <div className="space-y-2">
        {outOfStock.map((m) => (
          <Link
            key={m.id}
            href={`/materials?material=${m.id}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 transition-colors hover:bg-danger/10"
          >
            <div className="min-w-0">
              <p className="text-body font-semibold text-foreground">
                {m.name}
              </p>
              <p className="mt-0.5 text-meta text-muted-foreground">
                Out of stock · reorder at {formatNumber(m.reorderPoint ?? 0, 0)}{" "}
                {m.unit}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-danger/15 px-2.5 py-0.5 text-caption font-semibold text-danger">
              0 {m.unit}
            </span>
          </Link>
        ))}

        {lowStock.map((m) => (
          <Link
            key={m.id}
            href={`/materials?material=${m.id}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 transition-colors hover:bg-warning/10"
          >
            <div className="min-w-0">
              <p className="text-body font-semibold text-foreground">
                {m.name}
              </p>
              <p className="mt-0.5 text-meta text-muted-foreground">
                Low stock · {formatNumber(m.totalQty, 0)} {m.unit} left (reorder
                at {formatNumber(m.reorderPoint ?? 0, 0)})
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-warning/15 px-2.5 py-0.5 text-caption font-semibold text-warning">
              {formatNumber(m.totalQty, 0)} {m.unit}
            </span>
          </Link>
        ))}

        {approvalCount > 0 && (
          <Link
            href="/procurement"
            className="flex items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 transition-colors hover:bg-warning/10"
          >
            <div className="min-w-0">
              <p className="text-body font-semibold text-foreground">
                {approvalCount} approval
                {approvalCount !== 1 ? "s" : ""} waiting
              </p>
              <p className="mt-0.5 text-meta text-muted-foreground">
                {draftPOs} draft Purchase Order{draftPOs !== 1 ? "s" : ""} ·{" "}
                {pendingReqs} pending indent{pendingReqs !== 1 ? "s" : ""}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-warning/15 px-2.5 py-0.5 text-caption font-semibold text-warning">
              {approvalCount}
            </span>
          </Link>
        )}

        {outOfStock.length === 0 &&
          lowStock.length === 0 &&
          approvalCount === 0 && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-success/30 bg-success/5 px-4 py-3">
              <div className="min-w-0">
                <p className="text-body font-semibold text-foreground">
                  All caught up!
                </p>
                <p className="mt-0.5 text-meta text-muted-foreground">
                  {materialRows.length} materials healthy ·{" "}
                  {formatCurrency(totalStockValue)} in stock · no pending
                  approvals
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-success/15 px-2.5 py-0.5 text-caption font-semibold text-success">
                ✓
              </span>
            </div>
          )}
      </div>

      {/* ── Quick links into the inventory module ── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/materials"
          className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-muted/40"
        >
          <p className="text-body font-semibold text-foreground">Materials</p>
          <p className="mt-1 text-meta leading-relaxed text-muted-foreground">
            The material catalogue — every item you buy, its unit, reorder level
            and current cost.
          </p>
          <span className="mt-2 inline-block text-caption font-medium text-brand-strong group-hover:underline">
            Open catalogue →
          </span>
        </Link>
        <Link
          href="/stock"
          className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-muted/40"
        >
          <p className="text-body font-semibold text-foreground">Stock</p>
          <p className="mt-1 text-meta leading-relaxed text-muted-foreground">
            The full stock lifecycle — on hand, movements, transfers, issues to
            site, scrap, and counts.
          </p>
          <span className="mt-2 inline-block text-caption font-medium text-brand-strong group-hover:underline">
            Open stock hub →
          </span>
        </Link>
        <Link
          href="/stock-locations"
          className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-muted/40"
        >
          <p className="text-body font-semibold text-foreground">Locations</p>
          <p className="mt-1 text-meta leading-relaxed text-muted-foreground">
            Warehouses and project sites — where stock lives, with addresses and
            geofences.
          </p>
          <span className="mt-2 inline-block text-caption font-medium text-brand-strong group-hover:underline">
            Open locations →
          </span>
        </Link>
      </div>

      {/* ── Pending indents ── */}
      {recentRequisitions.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-body font-semibold text-foreground">
              Pending indents
            </h2>
            <Link
              href="/procurement"
              className="text-caption font-medium text-brand-strong hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="divide-y divide-border">
            {recentRequisitions.map((req) => {
              const reqLabel = req.reqNumber ?? `REQ-${req.id.slice(-6)}`;
              return (
                <Link
                  key={req.id}
                  href={`/procurement?requisition=${req.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
                >
                  <span className="shrink-0 text-caption font-bold tabular-nums text-foreground">
                    {reqLabel}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-meta text-muted-foreground">
                    {req.project?.name ?? "—"}
                  </span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-caption font-medium text-muted-foreground">
                    pending
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
