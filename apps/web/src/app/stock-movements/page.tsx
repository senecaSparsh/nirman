import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { StockMovementsView } from "@/components/stock-movements/stock-movements-view";
import { PageLoading } from "@/components/page-loading";
import type { ProjectOption, StockLocationRow, StockMovementRow } from "@/lib/types";

const MOVEMENT_LABELS: Record<string, string> = {
  PURCHASE_RECEIPT: "Receipt",
  TRANSFER_IN: "Transfer In",
  TRANSFER_OUT: "Transfer Out",
  ISSUE_TO_PROJECT: "Issue to Project",
  ADJUSTMENT_IN: "Adjustment (+)",
  ADJUSTMENT_OUT: "Adjustment (−)",
  RETURN: "Return",
  SALE: "Sale",
};

export default function StockMovementsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Stock Movements"
        description="Immutable audit trail of every stock movement — receipts, transfers, issues, adjustments."
      />
      <Suspense fallback={<PageLoading label="Loading stock movements…" />}>
        <StockMovementsContent />
      </Suspense>
    </div>
  );
}

async function StockMovementsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.INVENTORY_VIEW)) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-meta text-muted-foreground">
        You don't have permission to view this module.
      </div>
    );
  }

  const perms = {
    canTransfer: hasPermission(role, PERM.STOCK_TRANSFER),
    canIssue: hasPermission(role, PERM.STOCK_ISSUE),
  };

  const [movements, locations, projects, companyLocations] = await Promise.all([
    prisma.stockMovement.findMany({
      orderBy: { timestamp: "desc" },
      take: 200,
      include: {
        material: { select: { id: true, code: true, name: true, unit: true } },
        fromLocation: { select: { id: true, name: true } },
        toLocation: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
      },
    }),
    prisma.stockLocation.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      select: { id: true, name: true, type: true, projectId: true, address: true, stockItems: { select: { qty: true, movingAvgCost: true } } },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, status: true },
    }),
    prisma.stockLocation.findMany({
      where: { companyId: company.id },
      select: { id: true },
    }),
  ]);

  const companyLocationIds = new Set(companyLocations.map((l) => l.id));

  const movementRows: StockMovementRow[] = movements
    .filter(
      (m) =>
        !m.fromLocationId || !m.toLocationId ||
        companyLocationIds.has(m.fromLocationId) ||
        companyLocationIds.has(m.toLocationId),
    )
    .map((m) => ({
      id: m.id,
      materialId: m.material.id,
      materialCode: m.material.code,
      materialName: m.material.name,
      unit: m.material.unit,
      movementType: m.movementType,
      movementLabel: MOVEMENT_LABELS[m.movementType] ?? m.movementType,
      fromLocationId: m.fromLocationId,
      fromLocationName: m.fromLocation?.name ?? null,
      toLocationId: m.toLocationId,
      toLocationName: m.toLocation?.name ?? null,
      qty: toNum(m.qty),
      unitCost: toNum(m.unitCost),
      balanceAfter: toNum(m.balanceAfter),
      balanceValueAfter: toNum(m.balanceValueAfter),
      reason: m.reason,
      refType: m.refType,
      refId: m.refId,
      userName: m.user?.name ?? null,
      timestamp: m.timestamp.toISOString(),
    }));

  const locationRows: StockLocationRow[] = locations.map((l) => ({
    id: l.id,
    type: l.type,
    name: l.name,
    address: l.address,
    projectId: l.projectId,
    projectName: null,
    stockValue: l.stockItems.reduce((s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost), 0),
    itemCount: l.stockItems.filter((i) => toNum(i.qty) > 0).length,
  }));

  const projectRows: ProjectOption[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    status: p.status,
  }));

  return (
    <StockMovementsView movements={movementRows} locations={locationRows} projects={projectRows} permissions={perms} />
  );
}
