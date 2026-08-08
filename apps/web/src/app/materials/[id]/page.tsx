import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { NoAccess } from "@/components/no-access";
import { PageLoading } from "@/components/page-loading";
import { Page } from "@/components/page";
import { MaterialCockpit, type MaterialCockpitData } from "@/components/materials/material-cockpit";

export const metadata = { title: "Material · Nirman" };

export default function MaterialDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Page>
      <Suspense fallback={<PageLoading label="Loading material…" />}>
        <MaterialDetailContent params={params} />
      </Suspense>
    </Page>
  );
}

async function MaterialDetailContent({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.INVENTORY_VIEW)) {
    return <NoAccess what="this material" />;
  }
  const company = await getCompany();
  const { id } = await params;

  const material = await prisma.material.findFirst({
    where: { id, deletedAt: null },
    include: {
      category: { select: { name: true } },
      stockItems: {
        where: { location: { deletedAt: null, companyId: company.id } },
        include: { location: { select: { id: true, name: true, type: true } } },
      },
    },
  });
  if (!material) notFound();

  const locationIds = material.stockItems.map((s) => s.locationId);

  const [movements, openPOLines, openReqLines, rateContracts, issueLines] = await Promise.all([
    // Recent stock movements for this material at this company's locations
    locationIds.length > 0
      ? prisma.stockMovement.findMany({
          where: {
            materialId: id,
            OR: [{ fromLocationId: { in: locationIds } }, { toLocationId: { in: locationIds } }],
          },
          orderBy: { timestamp: "desc" },
          take: 20,
          include: {
            fromLocation: { select: { name: true } },
            toLocation: { select: { name: true } },
          },
        })
      : Promise.resolve([]),

    // Open PO lines for this material (company-scoped)
    prisma.purchaseOrderLine.findMany({
      where: {
        materialId: id,
        purchaseOrder: { companyId: company.id, status: { in: ["DRAFT", "APPROVED", "ORDERED", "PARTIAL"] } },
      },
      include: {
        purchaseOrder: {
          select: { id: true, poNumber: true, status: true, expectedDate: true, supplier: { select: { name: true } } },
        },
      },
      orderBy: { purchaseOrder: { createdAt: "desc" } },
      take: 10,
    }),

    // Open requisition lines for this material
    prisma.materialRequisitionLine.findMany({
      where: {
        materialId: id,
        requisition: { status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] } },
      },
      include: {
        requisition: {
          select: { id: true, reqNumber: true, status: true, project: { select: { name: true } } },
        },
      },
      orderBy: { requisition: { createdAt: "desc" } },
      take: 10,
    }),

    // Active rate contracts for this material (company-scoped)
    prisma.rateContract.findMany({
      where: { materialId: id, companyId: company.id, status: "ACTIVE" },
      include: { supplier: { select: { name: true } } },
      orderBy: { validTo: "asc" },
      take: 5,
    }),

    // Recent material issue lines for this material
    prisma.materialIssueLine.findMany({
      where: { materialId: id },
      include: {
        materialIssue: {
          select: {
            id: true,
            issueNumber: true,
            issueDate: true,
            project: { select: { name: true } },
            fromLocation: { select: { name: true } },
          },
        },
      },
      orderBy: { materialIssue: { issueDate: "desc" } },
      take: 15,
    }),
  ]);

  const data: MaterialCockpitData = {
    material: {
      id: material.id,
      code: material.code,
      name: material.name,
      unit: material.unit,
      categoryName: material.category.name,
      hsnCode: material.hsnCode,
      gstRate: toNum(material.gstRate),
      currentCost: toNum(material.currentCost),
      standardCost: toNum(material.standardCost),
      minStock: material.minStock ? toNum(material.minStock) : null,
      reorderPoint: material.reorderPoint ? toNum(material.reorderPoint) : null,
      economicOrderQty: material.economicOrderQty ? toNum(material.economicOrderQty) : null,
      isScrap: material.isScrap,
      description: material.description,
    },
    stockItems: material.stockItems.map((s) => ({
      locationId: s.locationId,
      locationName: s.location.name,
      locationType: s.location.type,
      qty: toNum(s.qty),
      movingAvgCost: toNum(s.movingAvgCost),
      totalValue: toNum(s.qty) * toNum(s.movingAvgCost),
    })),
    movements: movements.map((m) => ({
      id: m.id,
      movementType: m.movementType,
      qty: toNum(m.qty),
      unitCost: toNum(m.unitCost),
      fromLocationName: m.fromLocation?.name ?? null,
      toLocationName: m.toLocation?.name ?? null,
      timestamp: m.timestamp.toISOString(),
    })),
    openPOs: openPOLines.map((l) => ({
      poId: l.purchaseOrder.id,
      poNumber: l.purchaseOrder.poNumber,
      status: l.purchaseOrder.status,
      supplierName: l.purchaseOrder.supplier.name,
      qtyOrdered: toNum(l.qtyOrdered),
      qtyReceived: toNum(l.qtyReceived),
      unitCost: toNum(l.unitCost),
      expectedDate: l.purchaseOrder.expectedDate?.toISOString() ?? null,
    })),
    openRequisitions: openReqLines.map((l) => ({
      reqId: l.requisition.id,
      reqNumber: l.requisition.reqNumber,
      status: l.requisition.status,
      projectName: l.requisition.project?.name ?? null,
      qty: toNum(l.qtyRequested),
    })),
    rateContracts: rateContracts.map((rc) => ({
      id: rc.id,
      supplierName: rc.supplier.name,
      rate: toNum(rc.agreedRate),
      validUntil: rc.validTo.toISOString(),
    })),
    issues: issueLines.map((l) => ({
      issueId: l.materialIssue.id,
      issueNumber: l.materialIssue.issueNumber ?? "",
      issueDate: l.materialIssue.issueDate.toISOString(),
      projectName: l.materialIssue.project?.name ?? null,
      fromLocationName: l.materialIssue.fromLocation?.name ?? "—",
      qty: toNum(l.qty),
      unitCost: toNum(l.unitCost),
    })),
  };

  return <MaterialCockpit data={data} />;
}
