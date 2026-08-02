import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { getCompany } from "@/lib/server";
import { FieldReceive } from "@/components/field/field-receive";

export const metadata = { title: "Field · Nirman" };

/**
 * Field PWA — mobile receiving flow for site storekeepers.
 *
 * The page shell prerenders (PPR); the async child fetches receivable POs inside
 * a Suspense boundary. The client FieldReceive component owns the offline queue,
 * barcode scanning, and the receive form — it works offline-first.
 */
export default function FieldPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Field Receiving"
        description="Scan and receive shipments against purchase orders. Works offline — queued receipts sync when you're back online."
      />
      <Suspense fallback={<PageLoading label="Loading receivable orders…" />}>
        <ReceivableOrders />
      </Suspense>
    </div>
  );
}

async function ReceivableOrders() {
  await connection();
  const company = await getCompany();
  const pos = await prisma.purchaseOrder.findMany({
    where: { companyId: company.id, status: { in: ["ORDERED", "PARTIAL"] } },
    orderBy: { createdAt: "desc" },
    include: {
      supplier: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      destinationLocation: { select: { id: true, name: true, type: true } },
      lines: {
        include: { material: { select: { id: true, code: true, name: true, unit: true, barcode: true } } },
        orderBy: { material: { name: "asc" } },
      },
    },
  });

  const receivablePos = pos.map((po) => ({
    id: po.id,
    poNumber: po.poNumber,
    supplierName: po.supplier.name,
    projectName: po.project?.name ?? null,
    destinationLocationId: po.destinationLocationId,
    destinationLocationName: po.destinationLocation.name,
    status: po.status,
    lines: po.lines.map((l) => ({
      id: l.id,
      materialId: l.materialId,
      materialCode: l.material.code,
      materialName: l.material.name,
      unit: l.material.unit,
      barcode: l.material.barcode,
      qtyOrdered: Number(l.qtyOrdered),
      qtyReceived: Number(l.qtyReceived),
      unitCost: Number(l.unitCost),
    })),
  }));

  return <FieldReceive purchaseOrders={receivablePos} />;
}
