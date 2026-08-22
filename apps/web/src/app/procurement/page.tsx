import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getCompanyGroupIds, toNum, getUserRole } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { ProcurementView } from "@/components/procurement/procurement-view";
import { PageLoading } from "@/components/page-loading";
import type {
  SupplierRow, PurchaseOrderRow, MaterialRow, StockLocationRow,
  ProjectOption, DirectPurchaseRow, MaterialCategory,
} from "@/lib/types";

import { NoAccess } from "@/components/no-access";
export default function ProcurementPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading procurement…" variant="board" />}>
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
      <NoAccess what="purchase orders" />
    );
  }

  const perms = {
    canCreate: hasPermission(role, PERM.PROCUREMENT_MANAGE),
    canApprove: hasPermission(role, PERM.PO_APPROVE),
    canManagePayments: hasPermission(role, PERM.FINANCE_MANAGE),
  };

  // Company group: current company + siblings/parent/children. PO destination
  // locations (a project site in a sibling/child SPV) are selectable across
  // the group, matching the parent/child company hierarchy.
  const groupCompanyIds = await getCompanyGroupIds(company);

  const [pos, suppliers, materials, locations, projects, directPurchases, categories] = await Promise.all([
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
      // Supplier has no companyId — scope to suppliers with POs in this company.
      where: { deletedAt: null, purchaseOrders: { some: { companyId: company.id } } },
      orderBy: { name: "asc" },
      include: {
        _count: {
          select: {
            purchaseOrders: { where: { companyId: company.id, status: { in: ["DRAFT", "APPROVED", "ORDERED", "PARTIAL"] } } },
          },
        },
      },
    }),
    // Material is a global catalog entity (no companyId); stock scoped per company.
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
      // Include locations across the whole company group so PO destinations
      // (a project site in a sibling/child SPV) are selectable.
      where: { companyId: { in: groupCompanyIds }, deletedAt: null },
      orderBy: [{ companyId: "asc" }, { type: "asc" }, { name: "asc" }],
      include: {
        company: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        stockItems: { select: { qty: true, movingAvgCost: true } },
      },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, status: true },
    }),
    prisma.directPurchase.findMany({
      where: { companyId: company.id },
      orderBy: { billDate: "desc" },
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
        location: { select: { id: true, name: true } },
        lines: {
          include: {
            material: { select: { id: true, code: true, name: true, unit: true } },
          },
        },
      },
    }),
    // Global catalog entity (no companyId); needed by the inline material
    // creator inside the PO form's line items.
    prisma.materialCategory.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true },
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

  const categoryRows: MaterialCategory[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    unit: c.unit,
  }));

  const materialRows: MaterialRow[] = materials.map((m) => {
    const totalQty = m.stockItems.reduce((s, i) => s + toNum(i.qty), 0);
    const totalValue = m.stockItems.reduce((s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost), 0);
    return {
      id: m.id, code: m.code, name: m.name, categoryId: m.categoryId,
      categoryName: m.category.name, unit: m.unit, hsnCode: m.hsnCode,
      gstRate: toNum(m.gstRate), standardCost: toNum(m.standardCost),
      minStock: m.minStock == null ? null : toNum(m.minStock),
      reorderPoint: m.reorderPoint == null ? null : toNum(m.reorderPoint),
      economicOrderQty: m.economicOrderQty == null ? null : toNum(m.economicOrderQty),
      volumetricDensity: m.volumetricDensity == null ? null : toNum(m.volumetricDensity),
      bulkDiscountPct: m.bulkDiscountPct == null ? null : toNum(m.bulkDiscountPct),
      isCorporateCommodity: m.isCorporateCommodity ?? false,
      description: m.description, totalQty, totalValue,
      lowStock: m.minStock != null && totalQty < toNum(m.minStock),
    };
  });

  const locationRows: StockLocationRow[] = locations.map((l) => ({
    id: l.id, type: l.type, name: l.name, address: l.address,
    projectId: l.projectId, projectName: l.project?.name ?? null,
    stockValue: l.stockItems.reduce((s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost), 0),
    itemCount: l.stockItems.filter((i) => toNum(i.qty) > 0).length,
    companyId: l.company.id,
    companyName: l.company.name,
  }));

  const projectRows: ProjectOption[] = projects.map((p) => ({
    id: p.id, name: p.name, type: p.type, status: p.status,
  }));

  const directPurchaseRows: DirectPurchaseRow[] = directPurchases.map((p) => ({
    id: p.id,
    billNumber: p.billNumber,
    supplierId: p.supplierId,
    supplierName: p.supplierName,
    supplierPhone: p.supplier?.phone ?? null,
    locationId: p.locationId,
    locationName: p.location.name,
    billDate: p.billDate.toISOString(),
    subtotal: toNum(p.subtotal),
    gstTotal: toNum(p.gstTotal),
    roundOff: toNum(p.roundOff),
    billAmount: toNum(p.billAmount),
    notes: p.notes,
    lineCount: p.lines.length,
    lines: p.lines.map((l) => ({
      id: l.id,
      materialId: l.materialId,
      materialCode: l.material.code,
      materialName: l.material.name,
      unit: l.material.unit,
      qty: toNum(l.qty),
      unitCost: toNum(l.unitCost),
      gstRate: toNum(l.gstRate),
      lineTotal: toNum(l.qty) * toNum(l.unitCost),
    })),
  }));

  const openPoValue = poRows
    .filter((p) => ["DRAFT", "APPROVED", "ORDERED", "PARTIAL"].includes(p.status))
    .reduce((s, p) => s + p.total, 0);

  return (
    <>
      <PageHeader
        title="Procurement"
        description="Buy materials — purchase orders, cash purchases, and your supplier directory. Stock movements (transfers, issues, scrap) live in Stock."
        stats={[
          { label: "POs", value: poRows.length, hint: "Total purchase orders across all statuses — draft, approved, ordered, received." },
          { label: "Open value", value: formatCurrency(openPoValue), hint: "Value of POs not yet fully received or paid. This is committed spend." },
          { label: "Suppliers", value: supplierRows.length, hint: "Vendors in the supplier directory." },
        ]}
      />
      <ProcurementView
        suppliers={supplierRows}
        purchaseOrders={poRows}
        materials={materialRows}
        locations={locationRows}
        projects={projectRows}
        directPurchases={directPurchaseRows}
        categories={categoryRows}
        permissions={perms}
      />
    </>
  );
}
