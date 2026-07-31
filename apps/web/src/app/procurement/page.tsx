import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { ProcurementView } from "@/components/procurement/procurement-view";
import { PageLoading } from "@/components/page-loading";
import type {
  SupplierRow, PurchaseOrderRow, TransferRow, MaterialRow, StockLocationRow,
  ProjectOption, MaterialIssueListRow,
} from "@/lib/types";

export default function ProcurementPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Procurement"
        description="Purchase orders, goods receipts, stock transfers, and material issues to projects."
      />
      <Suspense fallback={<PageLoading label="Loading procurement…" />}>
        <ProcurementContent />
      </Suspense>
    </div>
  );
}

async function ProcurementContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.PROCUREMENT_VIEW)) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-meta text-muted-foreground">
        You don't have permission to view this module.
      </div>
    );
  }

  const perms = {
    canCreate: hasPermission(role, PERM.PROCUREMENT_MANAGE),
    canApprove: hasPermission(role, PERM.PO_APPROVE),
  };

  const [pos, suppliers, transfers, issues, materials, locations, projects] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
      include: {
        supplier: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        destinationLocation: { select: { id: true, name: true, type: true } },
        lines: { select: { qtyOrdered: true, qtyReceived: true } },
      },
    }),
    prisma.supplier.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: {
            purchaseOrders: { where: { status: { in: ["DRAFT", "APPROVED", "ORDERED", "PARTIAL"] } } },
          },
        },
      },
    }),
    prisma.stockTransfer.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        fromLocation: { select: { id: true, name: true, type: true } },
        toLocation: { select: { id: true, name: true, type: true } },
        lines: { include: { material: { select: { code: true, name: true, unit: true } } } },
      },
    }),
    prisma.materialIssue.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { name: true } },
        fromLocation: { select: { name: true } },
        lines: { select: { id: true } },
      },
    }),
    prisma.material.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        category: { select: { id: true, name: true, unit: true } },
        stockItems: {
          where: { location: { deletedAt: null, companyId: company.id } },
          select: { qty: true, movingAvgCost: true },
        },
      },
    }),
    prisma.stockLocation.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      include: {
        project: { select: { id: true, name: true } },
        stockItems: { select: { qty: true, movingAvgCost: true } },
      },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, status: true },
    }),
  ]);

  const poRows: PurchaseOrderRow[] = pos.map((po) => {
    const totalOrdered = po.lines.reduce((s, l) => s + toNum(l.qtyOrdered), 0);
    const totalReceived = po.lines.reduce((s, l) => s + toNum(l.qtyReceived), 0);
    return {
      id: po.id,
      poNumber: po.poNumber,
      supplierId: po.supplierId,
      supplierName: po.supplier.name,
      procurementScope: po.procurementScope,
      projectId: po.projectId,
      projectName: po.project?.name ?? null,
      destinationLocationId: po.destinationLocationId,
      destinationLocationName: po.destinationLocation.name,
      destinationLocationType: po.destinationLocation.type,
      status: po.status,
      orderDate: po.orderDate.toISOString(),
      expectedDate: po.expectedDate?.toISOString() ?? null,
      subtotal: toNum(po.subtotal),
      gstTotal: toNum(po.gstTotal),
      total: toNum(po.total),
      notes: po.notes,
      totalOrdered,
      totalReceived,
      receivedPct: totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0,
      createdAt: po.createdAt.toISOString(),
    };
  });

  const supplierRows: SupplierRow[] = suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    gstin: s.gstin,
    phone: s.phone,
    email: s.email,
    address: s.address,
    balanceOwed: toNum(s.balanceOwed),
    openPOs: s._count.purchaseOrders,
    poCount: s._count.purchaseOrders,
  }));

  const transferRows: TransferRow[] = transfers.map((t) => ({
    id: t.id,
    fromLocationId: t.fromLocationId,
    fromLocationName: t.fromLocation.name,
    fromLocationType: t.fromLocation.type,
    toLocationId: t.toLocationId,
    toLocationName: t.toLocation.name,
    toLocationType: t.toLocation.type,
    status: t.status,
    transferDate: t.transferDate.toISOString(),
    notes: t.notes,
    createdAt: t.createdAt.toISOString(),
    lineCount: t.lines.length,
    totalQty: t.lines.reduce((s, l) => s + toNum(l.qty), 0),
    materials: t.lines.map((l) => `${l.material.code} (${toNum(l.qty)} ${l.material.unit})`),
  }));

  const issueRows: MaterialIssueListRow[] = issues.map((i) => ({
    id: i.id,
    projectId: i.projectId,
    projectName: i.project.name,
    fromLocationId: i.fromLocationId,
    fromLocationName: i.fromLocation.name,
    issueDate: i.issueDate.toISOString(),
    notes: i.notes,
    totalCost: toNum(i.totalCost),
    lineCount: i.lines.length,
  }));

  const materialRows: MaterialRow[] = materials.map((m) => {
    const totalQty = m.stockItems.reduce((s, i) => s + toNum(i.qty), 0);
    const totalValue = m.stockItems.reduce((s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost), 0);
    return {
      id: m.id, code: m.code, name: m.name, categoryId: m.categoryId,
      categoryName: m.category.name, unit: m.unit, hsnCode: m.hsnCode,
      gstRate: toNum(m.gstRate), standardCost: toNum(m.standardCost),
      minStock: m.minStock == null ? null : toNum(m.minStock),
      description: m.description, totalQty, totalValue,
      lowStock: m.minStock != null && totalQty < toNum(m.minStock),
    };
  });

  const locationRows: StockLocationRow[] = locations.map((l) => ({
    id: l.id, type: l.type, name: l.name, address: l.address,
    projectId: l.projectId, projectName: l.project?.name ?? null,
    stockValue: l.stockItems.reduce((s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost), 0),
    itemCount: l.stockItems.filter((i) => toNum(i.qty) > 0).length,
  }));

  const projectRows: ProjectOption[] = projects.map((p) => ({
    id: p.id, name: p.name, type: p.type, status: p.status,
  }));

  return (
    <ProcurementView
      suppliers={supplierRows}
      purchaseOrders={poRows}
      transfers={transferRows}
      issues={issueRows}
      materials={materialRows}
      locations={locationRows}
      projects={projectRows}
      permissions={perms}
    />
  );
}
