import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { SupplierReturnsView } from "@/components/supplier-returns/supplier-returns-view";
import { PageLoading } from "@/components/page-loading";
import type { SupplierReturnRow, SupplierRow, StockLocationRow, MaterialRow } from "@/lib/types";

import { NoAccess } from "@/components/no-access";

export default function SupplierReturnsPage() {
  return (
    <div className="space-y-5">
      <Suspense fallback={<PageLoading label="Loading supplier returns…" variant="list" />}>
        <SupplierReturnsContent />
      </Suspense>
    </div>
  );
}

async function SupplierReturnsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.PROCUREMENT_VIEW)) {
    return <NoAccess what="supplier returns" />;
  }

  const perms = {
    canCreate: hasPermission(role, PERM.PROCUREMENT_MANAGE),
    canManage: hasPermission(role, PERM.PROCUREMENT_MANAGE),
  };

  const [returns, suppliers, locations, materials] = await Promise.all([
    prisma.supplierReturn.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
      include: {
        supplier: { select: { name: true } },
        location: { select: { name: true } },
        lines: {
          include: { material: { select: { code: true, name: true, unit: true } } },
        },
      },
    }),
    prisma.supplier.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, gstin: true, phone: true, email: true, address: true, balanceOwed: true },
    }),
    prisma.stockLocation.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      include: { project: { select: { id: true, name: true } } },
    }),
    prisma.material.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, unit: true, standardCost: true, gstRate: true },
    }),
  ]);

  const returnRows: SupplierReturnRow[] = returns.map((r) => ({
    id: r.id,
    returnNumber: r.returnNumber,
    supplierId: r.supplierId,
    supplierName: r.supplier.name,
    purchaseOrderId: r.purchaseOrderId,
    locationId: r.locationId,
    locationName: r.location.name,
    status: r.status,
    returnDate: r.returnDate.toISOString(),
    creditNoteNo: r.creditNoteNo,
    notes: r.notes,
    lines: r.lines.map((l) => ({
      id: l.id,
      materialId: l.materialId,
      materialCode: l.material.code,
      materialName: l.material.name,
      materialUnit: l.material.unit,
      qty: toNum(l.qty),
      reason: l.reason,
    })),
  }));

  // Compute credit pending = sum of (qty × unitCost) for SUBMITTED returns (awaiting credit note)
  const creditPending = returns
    .filter((r) => r.status === "SUBMITTED")
    .reduce((sum, r) => sum + r.lines.reduce((s, l) => s + toNum(l.qty) * toNum(l.unitCost), 0), 0);

  const supplierRows: SupplierRow[] = suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    gstin: s.gstin,
    phone: s.phone,
    email: s.email,
    address: s.address,
    balanceOwed: toNum(s.balanceOwed),
    openPOs: 0,
    poCount: 0,
  }));

  const locationRows: StockLocationRow[] = locations.map((l) => ({
    id: l.id,
    type: l.type,
    name: l.name,
    address: l.address,
    projectId: l.projectId,
    projectName: l.project?.name ?? null,
    stockValue: 0,
    itemCount: 0,
    companyId: company.id,
    companyName: company.name,
  }));

  const materialRows: MaterialRow[] = materials.map((m) => ({
    id: m.id,
    code: m.code,
    name: m.name,
    categoryId: null,
    categoryName: null,
    unit: m.unit,
    hsnCode: null,
    gstRate: toNum(m.gstRate),
    standardCost: toNum(m.standardCost),
    minStock: null,
    reorderPoint: null,
    economicOrderQty: null,
    volumetricDensity: null,
    bulkDiscountPct: null,
    isCorporateCommodity: false,
    description: null,
    totalQty: 0,
    totalValue: 0,
    lowStock: false,
  }));

  return (
    <>
      <PageHeader
        title="Purchase Returns"
        description="Send defective or excess stock back to a supplier and track the debit note."
        stats={[
          { label: "Total", value: returnRows.length },
          { label: "Draft", value: returnRows.filter((r) => r.status === "DRAFT").length },
          { label: "Submitted", value: returnRows.filter((r) => r.status === "SUBMITTED").length },
          { label: "Credit pending", value: formatCurrency(creditPending) },
        ]}
      />
      <SupplierReturnsView
        returns={returnRows}
        suppliers={supplierRows}
        locations={locationRows}
        materials={materialRows}
        permissions={perms}
      />
    </>
  );
}
