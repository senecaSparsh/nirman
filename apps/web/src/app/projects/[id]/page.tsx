import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import type { AreaUnit, BuiltUnitStatus, BuiltUnitType, LandParcelStatus } from "@nirman/db";
import { projectPnl } from "@nirman/services";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { NoAccess } from "@/components/no-access";
import { ProjectHub, type ProjectHubData } from "@/components/projects/project-hub";
import { PageLoading } from "@/components/page-loading";
import type { PhaseRow } from "@/components/projects/phases-section";
import type {
  PurchaseOrderRow, TransferRow, BuiltUnitRow, LandParcelRow,
  StockMovementRow, ProjectCostRow, MaterialIssueListRow,
} from "@/lib/types";

const MOVEMENT_LABELS: Record<string, string> = {
  PURCHASE_RECEIPT: "Receipt",
  TRANSFER_IN: "Transfer In",
  TRANSFER_OUT: "Transfer Out",
  ISSUE_TO_PROJECT: "Issue",
  RETURN: "Return",
  ADJUSTMENT_IN: "Adjustment +",
  ADJUSTMENT_OUT: "Adjustment −",
  SUPPLIER_RETURN: "Supplier Return",
  SALE: "Sale",
};

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageLoading label="Loading project…" />}>
      <ProjectDetailContent params={params} />
    </Suspense>
  );
}

async function ProjectDetailContent({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const role = await getUserRole();
  if (!hasPermission(role, PERM.PROJECTS_VIEW)) {
    return <NoAccess what="this project" />;
  }
  const company = await getCompany();

  // Fetch the project with all relations
  const project = await prisma.project.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    include: {
      phases: { orderBy: { sortOrder: "asc" } },
      stockLocations: { where: { deletedAt: null }, orderBy: { name: "asc" } },
    },
  });
  if (!project) notFound();

  // Gather all project-scoped data in parallel
  const locationIds = project.stockLocations.map((l) => l.id);

  const [
    purchaseOrders, transfers, builtUnits, landParcels,
    stockMovements, projectCosts, materialIssues, equipmentAssignments, pnlResult, openRequisitionCount,
    boqItems, wbsNodes, workOrders, mbEntries, dprs,
  ] = await Promise.all([
    // POs for this project (PROJECT scope) or all company POs
    prisma.purchaseOrder.findMany({
      where: {
        companyId: company.id,
        OR: [{ projectId: id }, { procurementScope: "COMPANY" }],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        supplier: { select: { name: true } },
        destinationLocation: { select: { id: true, name: true, type: true } },
        lines: { select: { qtyOrdered: true, qtyReceived: true, unitCost: true, gstRate: true } },
      },
    }),

    // Transfers involving this project's locations
    prisma.stockTransfer.findMany({
      where: {
        OR: [
          { fromLocationId: { in: locationIds } },
          { toLocationId: { in: locationIds } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        fromLocation: { select: { id: true, name: true, type: true, company: { select: { name: true } } } },
        toLocation: { select: { id: true, name: true, type: true, company: { select: { name: true } } } },
        lines: { select: { materialId: true, qty: true, material: { select: { name: true } } } },
      },
    }),

    // Built units for this project
    prisma.builtUnit.findMany({
      where: { projectId: id, deletedAt: null },
      orderBy: { unitNumber: "asc" },
      include: { phase: { select: { name: true } } },
    }),

    // Land parcels for this project
    prisma.landParcel.findMany({
      where: { projectId: id, deletedAt: null },
      orderBy: { number: "asc" },
      include: { parentParcel: { select: { number: true } } },
    }),

    // Stock movements at this project's locations
    locationIds.length > 0
      ? prisma.stockMovement.findMany({
          where: {
            OR: [
              { fromLocationId: { in: locationIds } },
              { toLocationId: { in: locationIds } },
            ],
          },
          orderBy: { timestamp: "desc" },
          take: 30,
          include: {
            material: { select: { name: true, unit: true } },
            fromLocation: { select: { name: true } },
            toLocation: { select: { name: true } },
          },
        })
      : Promise.resolve([]),

    // Project costs
    prisma.projectCost.findMany({
      where: { projectId: id },
      orderBy: { date: "desc" },
      include: {
        project: { select: { name: true } },
        subcontractor: { select: { name: true } },
      },
    }),

    // Material issues to this project
    prisma.materialIssue.findMany({
      where: { projectId: id },
      orderBy: { issueDate: "desc" },
      take: 20,
      include: {
        fromLocation: { select: { name: true } },
        lines: { select: { qty: true, unitCost: true } },
      },
    }),

    // Equipment assigned to this project
    prisma.equipmentAssignment.findMany({
      where: { projectId: id, status: "ACTIVE" },
      include: {
        equipment: { select: { id: true, assetTag: true, name: true, category: true, status: true, currentValue: true } },
      },
    }),

    // P&L
    projectPnl(id),

    // Open requisitions for this project
    prisma.materialRequisition.count({
      where: { projectId: id, status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] } },
    }),

    // BOQ items for this project (LINE_ITEM type only — sections have no qty/rate)
    prisma.boqItem.findMany({
      where: { projectId: id, type: "LINE_ITEM" },
      orderBy: { sortOrder: "asc" },
      take: 50,
    }),

    // WBS nodes for this project
    prisma.wbsNode.findMany({
      where: { projectId: id },
      orderBy: { sortOrder: "asc" },
      take: 50,
      include: { parent: { select: { name: true } } },
    }),

    // Work orders for this project
    prisma.subcontractorWorkOrder.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        subcontractor: { select: { name: true } },
        raBills: { select: { id: true } },
      },
    }),

    // Measurement book entries for this project
    prisma.measurementBookEntry.findMany({
      where: { projectId: id },
      orderBy: { measureDate: "desc" },
      take: 20,
      include: { boqItem: { select: { unit: true } } },
    }),

    // DPRs for this project
    prisma.dailyProgressReport.findMany({
      where: { projectId: id },
      orderBy: { date: "desc" },
      take: 20,
      include: { submittedBy: { select: { name: true } } },
    }),
  ]);

  // Map POs to rows
  const poRows: PurchaseOrderRow[] = purchaseOrders.map((po) => {
    const totalOrdered = po.lines.reduce((s, l) => s + toNum(l.qtyOrdered), 0);
    const totalReceived = po.lines.reduce((s, l) => s + toNum(l.qtyReceived), 0);
    const subtotal = po.lines.reduce((s, l) => s + toNum(l.qtyOrdered) * toNum(l.unitCost), 0);
    const gstTotal = po.lines.reduce((s, l) => s + toNum(l.qtyOrdered) * toNum(l.unitCost) * toNum(l.gstRate) / 100, 0);
    return {
      id: po.id,
      poNumber: po.poNumber,
      supplierId: po.supplierId,
      supplierName: po.supplier.name,
      procurementScope: po.procurementScope as "COMPANY" | "PROJECT",
      projectId: po.projectId,
      projectName: null,
      destinationLocationId: po.destinationLocationId,
      destinationLocationName: po.destinationLocation?.name ?? "",
      destinationLocationType: po.destinationLocation?.type ?? "COMPANY_WAREHOUSE",
      status: po.status as PurchaseOrderRow["status"],
      orderDate: po.orderDate?.toISOString() ?? po.createdAt.toISOString(),
      expectedDate: po.expectedDate?.toISOString() ?? null,
      subtotal,
      gstTotal,
      total: subtotal + gstTotal,
      notes: po.notes,
      totalOrdered,
      totalReceived,
      receivedPct: totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0,
      createdAt: po.createdAt.toISOString(),
    };
  });

  // Map transfers to rows
  const transferRows: TransferRow[] = transfers.map((t) => ({
    id: t.id,
    fromLocationId: t.fromLocation.id,
    fromLocationName: t.fromLocation.name,
    fromLocationType: t.fromLocation.type,
    fromCompanyName: t.fromLocation.company?.name ?? null,
    toLocationId: t.toLocation.id,
    toLocationName: t.toLocation.name,
    toLocationType: t.toLocation.type,
    toCompanyName: t.toLocation.company?.name ?? null,
    status: t.status as TransferRow["status"],
    transferDate: t.transferDate.toISOString(),
    notes: t.notes,
    createdAt: t.createdAt.toISOString(),
    lineCount: t.lines.length,
    totalQty: t.lines.reduce((s, l) => s + toNum(l.qty), 0),
    materials: t.lines.map((l) => l.material.name),
    isInterCompany: t.isInterCompany,
    transferPriceTotal: t.transferPriceTotal ? toNum(t.transferPriceTotal) : null,
  }));

  // Map built units
  const unitRows: BuiltUnitRow[] = builtUnits.map((u) => ({
    id: u.id,
    projectId: u.projectId,
    projectName: project.name,
    phaseId: u.phaseId,
    phaseName: u.phase?.name ?? null,
    unitType: u.unitType as BuiltUnitType,
    unitNumber: u.unitNumber,
    floor: u.floor,
    wing: u.wing,
    area: toNum(u.area),
    areaUnit: u.areaUnit as AreaUnit,
    status: u.status as BuiltUnitStatus,
    productionCost: toNum(u.productionCost),
    askingPrice: u.askingPrice ? toNum(u.askingPrice) : null,
    currentValuation: toNum(u.currentValuation),
    nrvWriteDown: toNum(u.nrvWriteDown),
    saleId: u.saleId,
  }));

  // Map land parcels
  const parcelRows: LandParcelRow[] = landParcels.map((p) => ({
    id: p.id,
    landPurchaseId: p.landPurchaseId,
    parentParcelId: p.parentParcelId,
    parentParcelNumber: p.parentParcel?.number ?? null,
    number: p.number,
    area: toNum(p.area),
    areaUnit: p.areaUnit as AreaUnit,
    status: p.status as LandParcelStatus,
    acquisitionCost: toNum(p.acquisitionCost),
    askingPrice: p.askingPrice ? toNum(p.askingPrice) : null,
    currentValuation: toNum(p.currentValuation),
    isInfrastructure: p.isInfrastructure,
    marketValue: p.marketValue ? toNum(p.marketValue) : null,
    weightFactor: p.weightFactor ? toNum(p.weightFactor) : null,
    projectId: p.projectId,
    projectName: project.name,
    geometry: p.geometry,
    childCount: 0,
  }));

  // Map stock movements
  const movementRows: StockMovementRow[] = stockMovements.map((m) => ({
    id: m.id,
    materialId: m.materialId,
    materialCode: "",
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
    userName: null,
    timestamp: m.timestamp.toISOString(),
  }));

  // Map project costs
  const costRows: ProjectCostRow[] = projectCosts.map((c) => ({
    id: c.id,
    projectId: c.projectId,
    projectName: project.name,
    costType: c.costType as ProjectCostRow["costType"],
    amount: toNum(c.amount),
    date: c.date.toISOString(),
    vendor: c.vendor,
    subcontractorId: c.subcontractorId,
    subcontractorName: c.subcontractor?.name ?? null,
    notes: c.notes,
    receiptUrl: c.receiptUrl,
  }));

  // Map material issues
  const issueRows: MaterialIssueListRow[] = materialIssues.map((i) => ({
    id: i.id,
    issueNumber: i.issueNumber ?? "",
    projectId: i.projectId,
    projectName: project.name,
    departmentId: i.departmentId,
    departmentName: null,
    departmentCode: null,
    fromLocationId: i.fromLocationId,
    fromLocationName: i.fromLocation?.name ?? "—",
    issueDate: i.issueDate.toISOString(),
    notes: i.notes,
    receiverName: i.receiverName,
    receiverMobile: i.receiverMobile,
    totalCost: i.lines.reduce((s, l) => s + toNum(l.qty) * toNum(l.unitCost), 0),
    roundOff: toNum(i.roundOff),
    totalAmount: toNum(i.totalAmount),
    lineCount: i.lines.length,
  }));

  // Map equipment
  const equipmentRows = equipmentAssignments.map((a) => ({
    id: a.equipment.id,
    assetTag: a.equipment.assetTag,
    name: a.equipment.name,
    category: a.equipment.category,
    status: a.equipment.status,
    currentValue: toNum(a.equipment.currentValue),
    assignedAt: a.assignedAt.toISOString(),
  }));

  // Phases
  const phases: PhaseRow[] = project.phases.map((ph) => ({
    id: ph.id,
    name: ph.name,
    status: ph.status,
    startDate: ph.startDate?.toISOString() ?? null,
    endDate: ph.endDate?.toISOString() ?? null,
    budget: ph.budget ? toNum(ph.budget) : null,
    sortOrder: ph.sortOrder,
  }));

  // BOQ items
  const boqItemRows = boqItems.map((b) => ({
    id: b.id,
    description: b.description,
    unit: b.unit ?? "",
    qty: b.estimatedQty ? toNum(b.estimatedQty) : 0,
    rate: b.rate ? toNum(b.rate) : 0,
    amount: b.estimatedAmount ? toNum(b.estimatedAmount) : 0,
    category: null as string | null,
  }));

  // WBS nodes
  const wbsNodeRows = wbsNodes.map((n) => ({
    id: n.id,
    name: n.name,
    status: n.type, // WBS uses type, not status
    startDate: n.plannedStart?.toISOString() ?? null,
    endDate: n.plannedEnd?.toISOString() ?? null,
    progressPct: n.progressPct ? toNum(n.progressPct) : 0,
    parentNodeName: n.parent?.name ?? null,
  }));

  // Work orders
  const workOrderRows = workOrders.map((w) => ({
    id: w.id,
    woNumber: w.workOrderNumber,
    subcontractorName: w.subcontractor?.name ?? "—",
    status: w.status,
    totalValue: toNum(w.totalWorkDone),
    raBillCount: w.raBills?.length ?? 0,
    startDate: w.startDate?.toISOString() ?? null,
  }));

  // MB entries
  const mbEntryRows = mbEntries.map((m) => ({
    id: m.id,
    mbNumber: m.mbNumber,
    description: m.description,
    qty: toNum(m.measuredQty),
    unit: m.boqItem?.unit ?? "",
    status: m.status,
    date: m.measureDate.toISOString(),
  }));

  // DPRs
  const dprRows = dprs.map((d) => ({
    id: d.id,
    reportDate: d.date.toISOString(),
    workType: d.workType,
    approvalStatus: d.approvalStatus,
    labourCount: 0, // labour lines not counted in this query
    notes: d.workSummary,
    submittedByName: d.submittedBy?.name ?? null,
  }));

  // Variance data
  const materialIssuesTotal = issueRows.reduce((s, i) => s + i.totalCost, 0);
  const otherCostsTotal = costRows.reduce((s, c) => s + c.amount, 0);
  const workOrderTotal = workOrderRows.reduce((s, w) => s + w.totalValue, 0);
  const landCostTotal = parcelRows.reduce((s, p) => s + p.acquisitionCost, 0);
  const actualTotal = toNum(pnlResult.total);
  const budgetTotal = project.totalBudget ? toNum(project.totalBudget) : 0;

  // Stats
  const availableUnits = unitRows.filter((u) => u.status === "AVAILABLE").length;
  const soldUnits = unitRows.filter((u) => u.status === "SOLD").length;
  const openPOCount = poRows.filter((p) => ["DRAFT", "APPROVED", "ORDERED", "PARTIAL"].includes(p.status)).length;

  const hubData: ProjectHubData = {
    project: {
      id: project.id,
      name: project.name,
      type: project.type,
      status: project.status,
      address: project.address,
      description: project.description,
      startDate: project.startDate?.toISOString() ?? null,
      endDate: project.endDate?.toISOString() ?? null,
      totalBudget: project.totalBudget ? toNum(project.totalBudget) : null,
      totalProjectCost: project.totalProjectCost ? toNum(project.totalProjectCost) : null,
      costPerSqft: project.costPerSqft ? toNum(project.costPerSqft) : null,
      totalSellableArea: project.totalSellableArea ? toNum(project.totalSellableArea) : null,
    },
    stats: {
      builtUnitCount: unitRows.length,
      availableUnits,
      soldUnits,
      landParcelCount: parcelRows.length,
      stockLocationCount: project.stockLocations.length,
      materialIssueCount: issueRows.length,
      openPOCount,
      openRequisitionCount,
      equipmentCount: equipmentRows.length,
    },
    pnl: {
      totalCost: toNum(pnlResult.total),
      revenue: toNum(pnlResult.revenue),
      profit: toNum(pnlResult.profit),
      margin: toNum(pnlResult.margin),
    },
    purchaseOrders: poRows,
    transfers: transferRows,
    builtUnits: unitRows,
    landParcels: parcelRows,
    stockMovements: movementRows,
    projectCosts: costRows,
    materialIssues: issueRows,
    phases,
    stockLocations: project.stockLocations.map((l) => ({
      id: l.id,
      name: l.name,
      type: l.type,
      address: l.address,
    })),
    equipment: equipmentRows,
    boqItems: boqItemRows,
    wbsNodes: wbsNodeRows,
    workOrders: workOrderRows,
    mbEntries: mbEntryRows,
    dprs: dprRows,
    variance: {
      budgetTotal,
      actualTotal,
      variancePct: budgetTotal > 0 ? ((actualTotal - budgetTotal) / budgetTotal) * 100 : 0,
      materialIssuesTotal,
      labourCostTotal: 0, // labour cost not separately tracked per project yet
      workOrderTotal,
      otherCostsTotal,
      landCostTotal,
    },
  };

  const editInitial = {
    name: project.name,
    type: project.type,
    status: project.status,
    address: project.address ?? "",
    startDate: project.startDate?.toISOString().slice(0, 10) ?? "",
    endDate: project.endDate?.toISOString().slice(0, 10) ?? "",
    totalBudget: project.totalBudget ? toNum(project.totalBudget) : undefined,
    description: project.description ?? "",
  };

  return <ProjectHub data={hubData} editInitial={editInitial} />;
}
