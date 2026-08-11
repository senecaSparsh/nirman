import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { PurchaseOrderDetailView } from "@/components/procurement/purchase-order-detail-view";
import type { PurchaseOrderDetail } from "@/lib/types";

export const metadata = { title: "Purchase Order" };

/**
 * /procurement/[id] — desktop PO detail. Deep links from the command
 * palette, supplier/material cockpits, and the project hub land here.
 * Mirrors the mobile `/m/procurement/[id]` page and the
 * `PurchaseOrderDetailDialog` (approve / order / cancel / receive / print).
 */
export default function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<PageLoading label="Loading purchase order…" variant="board" />}>
      <PoDetailContent params={params} />
    </Suspense>
  );
}

async function PoDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.PROCUREMENT_VIEW)) {
    return <NoAccess what="purchase orders" />;
  }

  const canApprove = hasPermission(role, PERM.PO_APPROVE);
  const { id } = await params;

  const po = await prisma.purchaseOrder.findFirst({
    where: { id, companyId: company.id },
    include: {
      supplier: true,
      project: { select: { id: true, name: true } },
      destinationLocation: { select: { id: true, name: true, type: true } },
      lines: {
        include: { material: { select: { id: true, code: true, name: true, unit: true } } },
        orderBy: { material: { name: "asc" } },
      },
      goodsReceipts: {
        include: { lines: { select: { materialId: true, qtyReceived: true, unitCost: true } } },
        orderBy: { receiptDate: "desc" },
      },
    },
  });

  if (!po) notFound();

  // Fetch the source requisition (if this PO was converted from one)
  const sourceRequisition = await prisma.materialRequisition.findFirst({
    where: { convertedPoId: po.id },
    select: { id: true, reqNumber: true },
  });

  const detail: PurchaseOrderDetail = {
    id: po.id,
    poNumber: po.poNumber,
    supplierId: po.supplierId,
    supplier: {
      id: po.supplier.id,
      name: po.supplier.name,
      gstin: po.supplier.gstin,
      phone: po.supplier.phone,
      email: po.supplier.email,
      address: po.supplier.address,
    },
    procurementScope: po.procurementScope,
    projectId: po.projectId,
    projectName: po.project?.name ?? null,
    destinationLocationId: po.destinationLocationId,
    // destinationLocation is a required relation on PurchaseOrder — always present.
    destinationLocation: {
      id: po.destinationLocation!.id,
      name: po.destinationLocation!.name,
      type: po.destinationLocation!.type,
    },
    status: po.status,
    orderDate: po.orderDate?.toISOString() ?? "",
    expectedDate: po.expectedDate?.toISOString() ?? null,
    subtotal: toNum(po.subtotal),
    gstTotal: toNum(po.gstTotal),
    total: toNum(po.total),
    notes: po.notes,
    createdAt: po.createdAt.toISOString(),
    sourceRequisition: sourceRequisition
      ? { id: sourceRequisition.id, reqNumber: sourceRequisition.reqNumber }
      : null,
    lines: po.lines.map((l) => ({
      id: l.id,
      materialId: l.materialId,
      materialCode: l.material.code,
      materialName: l.material.name,
      unit: l.material.unit,
      qtyOrdered: toNum(l.qtyOrdered),
      qtyReceived: toNum(l.qtyReceived),
      unitCost: toNum(l.unitCost),
      gstRate: toNum(l.gstRate),
      lineTotal: toNum(l.lineTotal),
      remaining: toNum(l.qtyOrdered) - toNum(l.qtyReceived),
    })),
    receipts: po.goodsReceipts.map((gr) => ({
      id: gr.id,
      receiptDate: gr.receiptDate.toISOString(),
      inspectionStatus: gr.inspectionStatus,
      notes: gr.notes,
      lineCount: gr.lines.length,
    })),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={po.poNumber}
        description={`${po.supplier.name} · ${po.procurementScope === "COMPANY" ? "Company scope" : `Project: ${po.project?.name ?? "—"}`}`}
        stats={[
          { label: "Status", value: po.status },
          { label: "Total", value: formatCurrency(toNum(po.total)) },
        ]}
        secondaryActions={
          <Link
            href="/procurement"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-body font-medium text-foreground transition-colors hover:bg-accent"
          >
            <ArrowLeft className="h-4 w-4" /> All POs
          </Link>
        }
      />
      <PurchaseOrderDetailView po={detail} canApprove={canApprove} />
    </div>
  );
}
