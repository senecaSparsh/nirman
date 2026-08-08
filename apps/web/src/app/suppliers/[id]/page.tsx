import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { NoAccess } from "@/components/no-access";
import { PageLoading } from "@/components/page-loading";
import { Page } from "@/components/page";
import { SupplierCockpit, type SupplierCockpitData } from "@/components/vendors/supplier-cockpit";

export const metadata = { title: "Supplier · Nirman" };

export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Page>
      <Suspense fallback={<PageLoading label="Loading supplier…" />}>
        <SupplierDetailContent params={params} />
      </Suspense>
    </Page>
  );
}

async function SupplierDetailContent({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.PROCUREMENT_VIEW)) {
    return <NoAccess what="this supplier" />;
  }
  const company = await getCompany();
  const { id } = await params;

  const supplier = await prisma.supplier.findFirst({
    where: { id, deletedAt: null },
  });
  if (!supplier) notFound();

  const [purchaseOrders, rateContracts, supplierReturns, recentGRNs] = await Promise.all([
    // All POs for this supplier (company-scoped)
    prisma.purchaseOrder.findMany({
      where: { supplierId: id, companyId: company.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        lines: { select: { qtyOrdered: true, qtyReceived: true, unitCost: true, material: { select: { name: true, unit: true } } } },
      },
    }),

    // Active rate contracts
    prisma.rateContract.findMany({
      where: { supplierId: id, companyId: company.id, status: "ACTIVE" },
      include: { material: { select: { id: true, name: true, unit: true, code: true } } },
      orderBy: { validTo: "asc" },
    }),

    // Supplier returns
    prisma.supplierReturn.findMany({
      where: { supplierId: id, companyId: company.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { lines: { select: { qty: true, unitCost: true } } },
    }),

    // Recent goods receipt notes (via PO lines)
    prisma.goodsReceipt.findMany({
      where: { purchaseOrder: { supplierId: id, companyId: company.id } },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        purchaseOrder: { select: { poNumber: true } },
        lines: { select: { qtyReceived: true, material: { select: { name: true } } } },
      },
    }),
  ]);

  // Compute stats
  const totalOrdered = purchaseOrders.reduce((s, po) =>
    s + po.lines.reduce((ls, l) => ls + toNum(l.qtyOrdered) * toNum(l.unitCost), 0), 0);
  const totalReceived = purchaseOrders.reduce((s, po) =>
    s + po.lines.reduce((ls, l) => ls + toNum(l.qtyReceived) * toNum(l.unitCost), 0), 0);
  const openPOCount = purchaseOrders.filter((p) =>
    ["DRAFT", "APPROVED", "ORDERED", "PARTIAL"].includes(p.status)).length;
  const totalReturns = supplierReturns.reduce((s, r) =>
    s + r.lines.reduce((ls, l) => ls + toNum(l.qty) * toNum(l.unitCost), 0), 0);

  // Top materials bought from this supplier
  const materialTotals = new Map<string, { name: string; qty: number; amount: number }>();
  for (const po of purchaseOrders) {
    for (const l of po.lines) {
      const key = l.material.name;
      const existing = materialTotals.get(key) ?? { name: l.material.name, qty: 0, amount: 0 };
      existing.qty += toNum(l.qtyOrdered);
      existing.amount += toNum(l.qtyOrdered) * toNum(l.unitCost);
      materialTotals.set(key, existing);
    }
  }
  const topMaterials = Array.from(materialTotals.values()).sort((a, b) => b.amount - a.amount).slice(0, 10);

  const data: SupplierCockpitData = {
    supplier: {
      id: supplier.id,
      name: supplier.name,
      gstin: supplier.gstin,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      balanceOwed: toNum(supplier.balanceOwed),
      leadTimeDays: supplier.leadTimeDays,
    },
    stats: {
      totalPOs: purchaseOrders.length,
      openPOCount,
      totalOrdered,
      totalReceived,
      totalReturns,
      balanceOwed: toNum(supplier.balanceOwed),
    },
    purchaseOrders: purchaseOrders.map((po) => ({
      id: po.id,
      poNumber: po.poNumber,
      status: po.status,
      orderDate: po.orderDate?.toISOString() ?? po.createdAt.toISOString(),
      expectedDate: po.expectedDate?.toISOString() ?? null,
      total: toNum(po.total) + toNum(po.gstTotal),
      lineCount: po.lines.length,
    })),
    rateContracts: rateContracts.map((rc) => ({
      id: rc.id,
      contractNumber: rc.contractNumber,
      materialName: rc.material.name,
      materialCode: rc.material.code,
      agreedRate: toNum(rc.agreedRate),
      validFrom: rc.validFrom.toISOString(),
      validTo: rc.validTo.toISOString(),
      status: rc.status,
    })),
    supplierReturns: supplierReturns.map((r) => ({
      id: r.id,
      returnNumber: r.returnNumber ?? "",
      status: r.status,
      totalAmount: r.lines.reduce((s, l) => s + toNum(l.qty) * toNum(l.unitCost), 0),
      date: r.createdAt.toISOString(),
    })),
    recentGRNs: recentGRNs.map((gr) => ({
      id: gr.id,
      grnNumber: `GRN-${gr.id.slice(-6).toUpperCase()}`,
      poNumber: gr.purchaseOrder.poNumber,
      date: gr.createdAt.toISOString(),
      lineCount: gr.lines.length,
    })),
    topMaterials,
  };

  return <SupplierCockpit data={data} />;
}
