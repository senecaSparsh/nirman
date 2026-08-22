import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { MaterialSalesView } from "@/components/material-sales/material-sales-view";

import { NoAccess } from "@/components/no-access";
export default function MaterialSalesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Material Sales"
        description="Sell raw materials and inventory items to customers — stock is relieved at MAC and revenue is recognised in the GL."
      />
      <Suspense fallback={<PageLoading label="Loading material sales…" variant="list" />}>
        <MaterialSalesContent />
      </Suspense>
    </div>
  );
}

async function MaterialSalesContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.SALES_VIEW)) {
    return (
      <NoAccess what="material sales" />
    );
  }

  const perms = {
    canCreate: hasPermission(role, PERM.SALE_CREATE),
    canCancel: hasPermission(role, PERM.SALES_MANAGE),
    canRecordPayment: hasPermission(role, PERM.SALES_MANAGE) || hasPermission(role, PERM.FINANCE_MANAGE),
  };

  const [sales, customers, stockLocations, materials, categories, projects] = await Promise.all([
    prisma.materialSale.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        project: { select: { id: true, name: true } },
        lines: {
          include: {
            material: { select: { id: true, name: true, unit: true } },
            location: { select: { id: true, name: true } },
          },
        },
        payments: {
          include: {
            createdBy: { select: { id: true, name: true } },
          },
          orderBy: { paymentDate: "desc" },
        },
      },
    }),
    prisma.customer.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }),
    prisma.stockLocation.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true, type: true },
      orderBy: { name: "asc" },
    }),
    prisma.material.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, unit: true },
      orderBy: { name: "asc" },
    }),
    // Global catalog entity — needed by the inline material creator.
    prisma.materialCategory.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, unit: true },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, status: true },
    }),
  ]);

  // Build stock availability map: { "locationId|materialId": qty }
  const stockItems = await prisma.stockLocationItem.findMany({
    where: { location: { companyId: company.id, deletedAt: null } },
    select: { locationId: true, materialId: true, qty: true, movingAvgCost: true },
  });
  const stockMap = new Map<string, { qty: number; mac: number }>();
  for (const si of stockItems) {
    stockMap.set(`${si.locationId}|${si.materialId}`, { qty: toNum(si.qty), mac: toNum(si.movingAvgCost) });
  }

  const saleRows = sales.map((s) => ({
    id: s.id,
    saleNumber: s.saleNumber,
    customerId: s.customerId,
    customerName: s.customer?.name ?? null,
    customerPhone: s.customer?.phone ?? null,
    projectId: s.projectId,
    projectName: s.project?.name ?? null,
    saleDate: s.saleDate.toISOString(),
    subtotal: toNum(s.subtotal),
    gstTotal: toNum(s.gstTotal),
    totalAmount: toNum(s.totalAmount),
    totalCost: toNum(s.totalCost),
    grossProfit: toNum(s.grossProfit),
    status: s.status,
    paymentStatus: s.paymentStatus,
    paymentMode: s.paymentMode,
    notes: s.notes,
    lineCount: s.lines.length,
    payments: s.payments.map((p) => ({
      id: p.id,
      saleId: p.saleId,
      amount: toNum(p.amount),
      paymentDate: p.paymentDate.toISOString(),
      paymentMode: p.paymentMode,
      referenceNo: p.referenceNo,
      notes: p.notes,
      createdByName: p.createdBy?.name ?? null,
    })),
    lines: s.lines.map((l) => ({
      id: l.id,
      materialId: l.materialId,
      materialName: l.material?.name ?? null,
      materialUnit: l.material?.unit ?? null,
      locationId: l.locationId,
      locationName: l.location?.name ?? null,
      qty: toNum(l.qty),
      unitPrice: toNum(l.unitPrice),
      unitCost: toNum(l.unitCost),
      gstRate: toNum(l.gstRate),
      gstAmount: toNum(l.gstAmount),
      lineTotal: toNum(l.lineTotal),
    })),
  }));

  return (
    <MaterialSalesView
      sales={saleRows}
      customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
      locations={stockLocations.map((l) => ({ id: l.id, name: l.name, type: l.type }))}
      materials={materials.map((m) => ({ id: m.id, name: m.name, unit: m.unit }))}
      categories={categories.map((c) => ({ id: c.id, name: c.name, unit: c.unit }))}
      projects={projects.map((p) => ({ id: p.id, name: p.name, type: p.type, status: p.status }))}
      stockMap={Object.fromEntries(
        Array.from(stockMap.entries()).map(([k, v]) => [k, v]),
      )}
      permissions={perms}
    />
  );
}
