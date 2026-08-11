import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getCompanyGroupIds, toNum, getUserRole } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { StockHubView } from "@/components/stock/stock-hub-view";
import { NoAccess } from "@/components/no-access";
import type {
  StockRow,
  StockLocationRow,
  StockMovementRow,
  ProjectOption,
  DepartmentOption,
  TransferRow,
  MaterialIssueListRow,
  MaterialOption,
  StockLocationOption,
  StockCountRow,
} from "@/lib/types";

const MOVEMENT_LABELS: Record<string, string> = {
  PURCHASE_RECEIPT: "Receipt",
  TRANSFER_IN: "Transfer In",
  TRANSFER_OUT: "Transfer Out",
  ISSUE_TO_PROJECT: "Issue to Project",
  ISSUE_TO_DEPARTMENT: "Issue to Dept",
  ADJUSTMENT_IN: "Adjustment (+)",
  ADJUSTMENT_OUT: "Adjustment (−)",
  RETURN: "Return",
  SALE: "Sale",
  SCRAP_GENERATED: "Scrap Generated",
};

export default function StockPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading stock…" variant="list" />}>
        <StockContent />
      </Suspense>
    </div>
  );
}

async function StockContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.INVENTORY_VIEW)) {
    return <NoAccess what="stock operations" />;
  }

  const perms = {
    canTransfer: hasPermission(role, PERM.STOCK_TRANSFER),
    canIssue: hasPermission(role, PERM.STOCK_ISSUE),
    canManage: hasPermission(role, PERM.INVENTORY_MANAGE),
  };

  // Inter-company STO destinations span the whole company group.
  const groupCompanyIds = await getCompanyGroupIds(company);

  const [
    stockItems,
    companyLocations,
    groupLocations,
    movements,
    projects,
    departments,
    transfers,
    issues,
    materials,
    scraps,
    scrapLocations,
    scrapMaterials,
    scrapProjects,
    counts,
    countLocations,
  ] = await Promise.all([
    // ── On Hand ──
    prisma.stockLocationItem.findMany({
      where: {
        qty: { gt: 0 },
        location: { deletedAt: null, companyId: company.id },
        material: { deletedAt: null },
      },
      include: {
        location: { select: { id: true, name: true, type: true } },
        material: {
          select: { id: true, code: true, name: true, unit: true, category: { select: { name: true } } },
        },
      },
      orderBy: [{ material: { name: "asc" } }, { location: { name: "asc" } }],
    }),
    // Company locations (on-hand filter + transfers source + issues source)
    prisma.stockLocation.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      include: { project: { select: { id: true, name: true } }, stockItems: { select: { qty: true, movingAvgCost: true } } },
    }),
    // Group locations (inter-company STO destinations)
    prisma.stockLocation.findMany({
      where: { companyId: { in: groupCompanyIds }, deletedAt: null },
      orderBy: [{ companyId: "asc" }, { type: "asc" }, { name: "asc" }],
      include: {
        company: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        stockItems: { select: { qty: true, movingAvgCost: true } },
      },
    }),
    // ── Movements ──
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
    // ── Projects / departments (shared by movements, issues) ──
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, status: true },
    }),
    prisma.department.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    // ── Transfers ──
    prisma.stockTransfer.findMany({
      where: {
        OR: [
          { fromLocation: { companyId: company.id } },
          { toLocation: { companyId: company.id } },
        ],
      },
      orderBy: { createdAt: "desc" },
      include: {
        fromLocation: { select: { id: true, name: true, type: true, companyId: true, company: { select: { name: true } } } },
        toLocation: { select: { id: true, name: true, type: true, companyId: true, company: { select: { name: true } } } },
        lines: { include: { material: { select: { code: true, name: true, unit: true } } } },
      },
    }),
    // ── Issues ──
    prisma.materialIssue.findMany({
      where: {
        OR: [
          { project: { companyId: company.id } },
          { department: { companyId: company.id } },
        ],
      },
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { name: true } },
        department: { select: { name: true, code: true } },
        fromLocation: { select: { name: true } },
        lines: { select: { id: true } },
      },
    }),
    // ── Materials (for issue dialog options) ──
    // Global catalog entity (no companyId) — material definitions shared across
    // companies; only stock quantities are company-scoped (handled elsewhere).
    prisma.material.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, unit: true, standardCost: true, gstRate: true, isLotTracked: true },
    }),
    // ── Scrap ──
    prisma.scrapGeneration.findMany({
      where: { companyId: company.id },
      include: {
        lines: { include: { material: { select: { code: true, name: true, unit: true } } } },
        toLocation: { select: { name: true } },
        project: { select: { name: true } },
        sourceMaterial: { select: { code: true, name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { generationDate: "desc" },
    }),
    prisma.stockLocation.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true, type: true },
      orderBy: { name: "asc" },
    }),
    // Global catalog entity — material definitions shared across companies.
    prisma.material.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true, unit: true, isScrap: true },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    // ── Counts ──
    prisma.stockCount.findMany({
      where: { location: { companyId: company.id, deletedAt: null } },
      orderBy: { createdAt: "desc" },
      include: {
        location: { select: { id: true, name: true, type: true } },
        lines: { include: { material: { select: { code: true, name: true, unit: true } } } },
      },
    }),
    prisma.stockLocation.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      include: {
        project: { select: { id: true, name: true } },
        stockItems: {
          where: { qty: { gt: 0 } },
          include: { material: { select: { id: true, code: true, name: true, unit: true } } },
        },
      },
    }),
  ]);

  // ── On Hand rows ──
  const stockRows: StockRow[] = stockItems.map((i) => ({
    id: i.id,
    locationId: i.location.id,
    locationName: i.location.name,
    locationType: i.location.type,
    materialId: i.material.id,
    materialCode: i.material.code,
    materialName: i.material.name,
    categoryName: i.material.category.name,
    unit: i.material.unit,
    qty: toNum(i.qty),
    mac: toNum(i.movingAvgCost),
    value: toNum(i.qty) * toNum(i.movingAvgCost),
  }));

  // ── Company location rows (shared: on-hand filter, transfers, movements) ──
  const companyLocationRows: StockLocationRow[] = companyLocations.map((l) => ({
    id: l.id,
    type: l.type,
    name: l.name,
    address: l.address,
    projectId: l.projectId,
    projectName: l.project?.name ?? null,
    stockValue: l.stockItems.reduce((s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost), 0),
    itemCount: l.stockItems.filter((i) => toNum(i.qty) > 0).length,
    companyId: company.id,
    companyName: company.name,
  }));

  // ── Group location rows (inter-company STO destinations) ──
  const groupLocationRows: StockLocationRow[] = groupLocations.map((l) => ({
    id: l.id,
    type: l.type,
    name: l.name,
    address: l.address,
    projectId: l.projectId,
    projectName: l.project?.name ?? null,
    stockValue: l.stockItems.reduce((s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost), 0),
    itemCount: l.stockItems.filter((i) => toNum(i.qty) > 0).length,
    companyId: l.company.id,
    companyName: l.company.name,
  }));

  // Transfers use the full group so cross-company destinations are selectable.
  const transferLocations = groupLocationRows;

  // ── Movements rows (filtered to this company's locations) ──
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

  const projectRows: ProjectOption[] = projects.map((p) => ({
    id: p.id, name: p.name, type: p.type, status: p.status,
  }));

  const departmentRows: DepartmentOption[] = departments.map((d) => ({
    id: d.id, code: d.code, name: d.name,
  }));

  // ── Transfer rows ──
  const transferRows: TransferRow[] = transfers.map((t) => ({
    id: t.id,
    fromLocationId: t.fromLocationId,
    fromLocationName: t.fromLocation.name,
    fromLocationType: t.fromLocation.type,
    fromCompanyName: t.fromLocation.company?.name ?? null,
    toLocationId: t.toLocationId,
    toLocationName: t.toLocation.name,
    toLocationType: t.toLocation.type,
    toCompanyName: t.toLocation.company?.name ?? null,
    status: t.status,
    transferDate: t.transferDate.toISOString(),
    notes: t.notes,
    createdAt: t.createdAt.toISOString(),
    lineCount: t.lines.length,
    totalQty: t.lines.reduce((s, l) => s + toNum(l.qty), 0),
    materials: t.lines.map((l) => `${l.material.code} (${toNum(l.qty)} ${l.material.unit})`),
    isInterCompany: t.isInterCompany,
    transferPriceTotal: t.transferPriceTotal ? toNum(t.transferPriceTotal) : null,
  }));

  // ── Issue rows ──
  const issueRows: MaterialIssueListRow[] = issues.map((i) => ({
    id: i.id,
    issueNumber: i.issueNumber ?? "",
    projectId: i.projectId,
    projectName: i.project?.name ?? null,
    departmentId: i.departmentId,
    departmentName: i.department?.name ?? null,
    departmentCode: i.department?.code ?? null,
    fromLocationId: i.fromLocationId,
    fromLocationName: i.fromLocation.name,
    issueDate: i.issueDate.toISOString(),
    notes: i.notes,
    receiverName: i.receiverName,
    receiverMobile: i.receiverMobile,
    totalCost: toNum(i.totalCost),
    roundOff: toNum(i.roundOff),
    totalAmount: toNum(i.totalAmount),
    lineCount: i.lines.length,
  }));

  // ── Material / location options for the issue dialog ──
  const materialOptions: MaterialOption[] = materials.map((m) => ({
    id: m.id, code: m.code, name: m.name, unit: m.unit,
    standardCost: toNum(m.standardCost), gstRate: toNum(m.gstRate),
    isLotTracked: m.isLotTracked,
  }));
  const locationOptions: StockLocationOption[] = companyLocations.map((l) => ({
    id: l.id, type: l.type, name: l.name,
    projectId: l.projectId, projectName: l.project?.name ?? null,
  }));

  // ── Scrap rows ──
  const scrapRows = scraps.map((s) => ({
    id: s.id,
    scrapNumber: s.scrapNumber,
    toLocationName: s.toLocation.name,
    projectName: s.project?.name ?? null,
    sourceMaterialName: s.sourceMaterial ? `${s.sourceMaterial.code} — ${s.sourceMaterial.name}` : null,
    createdByName: s.createdBy?.name ?? null,
    notes: s.notes,
    generationDate: s.generationDate.toISOString(),
    lineCount: s.lines.length,
    totalValue: s.lines.reduce((sum, l) => sum + toNum(l.qty) * toNum(l.unitCost), 0),
    lines: s.lines.map((l) => ({
      id: l.id,
      materialId: l.materialId,
      materialCode: l.material.code,
      materialName: l.material.name,
      unit: l.material.unit,
      qty: toNum(l.qty),
      unitCost: toNum(l.unitCost),
      lineTotal: toNum(l.qty) * toNum(l.unitCost),
    })),
  }));

  const scrapLocationRows = scrapLocations.map((l) => ({ id: l.id, name: l.name, type: l.type }));
  const scrapMaterialRows = scrapMaterials.map((m) => ({ id: m.id, code: m.code, name: m.name, unit: m.unit, isScrap: m.isScrap }));
  const scrapProjectRows = scrapProjects.map((p) => ({ id: p.id, name: p.name }));

  // ── Count rows ──
  const countRows: StockCountRow[] = counts.map((c) => ({
    id: c.id,
    locationId: c.locationId,
    locationName: c.location.name,
    locationType: c.location.type,
    status: c.status,
    countDate: c.countDate.toISOString(),
    notes: c.notes,
    createdAt: c.createdAt.toISOString(),
    lineCount: c.lines.length,
    totalVariance: c.lines.reduce((s, l) => s + toNum(l.variance), 0),
    lines: c.lines.map((l) => ({
      id: l.id,
      materialId: l.materialId,
      materialCode: l.material.code,
      materialName: l.material.name,
      unit: l.material.unit,
      countedQty: toNum(l.countedQty),
      systemQty: toNum(l.systemQty),
      variance: toNum(l.variance),
    })),
  }));

  const countLocationRows = countLocations.map((l) => ({
    id: l.id,
    type: l.type,
    name: l.name,
    stockItems: l.stockItems.map((i) => ({
      materialId: i.material.id,
      materialCode: i.material.code,
      materialName: i.material.name,
      unit: i.material.unit,
      qty: toNum(i.qty),
    })),
  }));

  const stockValue = stockRows.reduce((s, r) => s + r.value, 0);

  return (
    <>
      <PageHeader
        title="Stock"
        description="The full stock lifecycle — what you have on hand, every movement, transfers, issues to site, scrap, and counts."
        stats={[
          { label: "On-hand value", value: formatCurrency(stockValue), hint: "Total value of all stock currently on hand, valued at moving average cost per location." },
          { label: "Locations", value: companyLocationRows.length, hint: "Number of active stock locations (warehouses, project sites) in this company." },
          { label: "Movements", value: movementRows.length, hint: "Recent stock movements (receipts, transfers, issues, adjustments) shown in the list." },
        ]}
      />
      <StockHubView
        stock={stockRows}
        locations={companyLocationRows}
        transferLocations={transferLocations}
        movements={movementRows}
        projects={projectRows}
        departments={departmentRows}
        transfers={transferRows}
        issues={issueRows}
        materialOptions={materialOptions}
        locationOptions={locationOptions}
        scraps={scrapRows}
        scrapLocations={scrapLocationRows}
        scrapMaterials={scrapMaterialRows}
        scrapProjects={scrapProjectRows}
        counts={countRows}
        countLocations={countLocationRows}
        permissions={perms}
      />
    </>
  );
}
