import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, getUserPermissions, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileSkeletonDetail } from "@/components/mobile/mobile-skeleton";
import { MobilePipelineStepper, type MobilePipelineStep } from "@/components/mobile/v2/primitives";
import { NextActionCardView } from "@/components/mobile/v2/guidance";
import { resolveNextAction } from "@/lib/flow-map";
import { MobileTransferDetailClient } from "./MobileTransferDetailClient";
import { RecordRecentItem } from "@/components/mobile/v2/record-recent-item";
import { PageContextProvider } from "@/components/mobile/v2/page-context";

/**
 * /m/transfers/[id] — stock transfer detail.
 * Shows the transfer header (from → to), status, line items, and
 * action buttons (complete / cancel) when the transfer is still DRAFT
 * and the user has `stock.transfer` permission.
 */
export default function MobileTransferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonDetail sections={6} />}>
      <MobileTransferDetailContent params={params} />
    </Suspense>
  );
}

async function MobileTransferDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const overrides = await getUserPermissions();
  const { id } = await params;

  if (!hasPermission(role, PERM.INVENTORY_VIEW)) {
    notFound();
  }

  const transfer = await prisma.stockTransfer.findFirst({
    where: {
      id,
      OR: [
        { fromLocation: { companyId: company.id, deletedAt: null } },
        { toLocation: { companyId: company.id, deletedAt: null } },
      ],
    },
    include: {
      fromLocation: {
        select: { id: true, name: true, type: true, address: true, companyId: true, company: { select: { name: true } } },
      },
      toLocation: {
        select: { id: true, name: true, type: true, address: true, companyId: true, lat: true, lng: true, geoRadius: true, company: { select: { name: true } } },
      },
      createdBy: { select: { id: true, name: true } },
      dispatchedBy: { select: { id: true, name: true } },
      receivedBy: { select: { id: true, name: true } },
      lines: {
        include: { material: { select: { id: true, name: true, code: true, unit: true, hsnCode: true, gstRate: true } } },
        orderBy: { material: { name: "asc" } },
      },
    },
  });

  if (!transfer) {
    notFound();
  }

  const canManage = hasPermission(role, PERM.STOCK_TRANSFER);

  // Fetch linked gate pass (if any) for the dispatch gate-pass context
  const gatePass = transfer.status === "DRAFT"
    ? await prisma.gatePass.findFirst({
        where: { refType: "StockTransfer", refId: transfer.id },
        select: { id: true, gatePassNumber: true, status: true },
      })
    : null;

  // Sender/receiver context: determine which side the current company is on
  const fromCompanyId = transfer.fromLocation.companyId;
  const toCompanyId = transfer.toLocation.companyId;
  const isSourceCompany = fromCompanyId === company.id;
  const isDestCompany = toCompanyId === company.id;

  // For inter-company: fetch the user's memberships so we can show a "switch company" prompt
  let userMemberships: { id: string; name: string; role: string }[] = [];
  if (transfer.isInterCompany && canManage) {
    const memberships = await prisma.userCompany.findMany({
      where: { userId: transfer.createdById ?? "", company: { deletedAt: null } },
      select: { role: true, company: { select: { id: true, name: true } } },
    });
    userMemberships = memberships.map((m) => ({
      id: m.company.id,
      name: m.company.name,
      role: m.role,
    }));
  }

  const totalQty = transfer.lines.reduce((s, l) => s + toNum(l.qty), 0);

  // Serialize for client component
  const serialized = {
    id: transfer.id,
    status: transfer.status,
    transferDate: transfer.transferDate.toISOString(),
    createdAt: transfer.createdAt.toISOString(),
    notes: transfer.notes,
    isInterCompany: transfer.isInterCompany,
    freight: toNum(transfer.freight),
    handlingFee: toNum(transfer.handlingFee),
    markupPct: toNum(transfer.markupPct),
    transferPriceTotal: transfer.transferPriceTotal ? toNum(transfer.transferPriceTotal) : null,
    fromLocation: {
      id: transfer.fromLocation.id,
      name: transfer.fromLocation.name,
      type: transfer.fromLocation.type,
      address: transfer.fromLocation.address,
      companyName: transfer.fromLocation.company?.name ?? null,
    },
    toLocation: {
      id: transfer.toLocation.id,
      name: transfer.toLocation.name,
      type: transfer.toLocation.type,
      address: transfer.toLocation.address,
      companyName: transfer.toLocation.company?.name ?? null,
      lat: transfer.toLocation.lat,
      lng: transfer.toLocation.lng,
      geoRadius: transfer.toLocation.geoRadius,
    },
    createdByName: transfer.createdBy?.name ?? null,
    // Dispatch info
    dispatchedAt: transfer.dispatchedAt ? transfer.dispatchedAt.toISOString() : null,
    dispatchedByName: transfer.dispatchedBy?.name ?? null,
    vehicleType: transfer.vehicleType,
    vehicleNumber: transfer.vehicleNumber,
    driverName: transfer.driverName,
    driverPhone: transfer.driverPhone,
    transporterName: transfer.transporterName,
    challanNumber: transfer.challanNumber,
    packageCount: transfer.packageCount,
    // Receive info
    receivedAt: transfer.receivedAt ? transfer.receivedAt.toISOString() : null,
    receivedByName: transfer.receivedBy?.name ?? null,
    receiverSignature: transfer.receiverSignature,
    receiverLat: transfer.receiverLat,
    receiverLng: transfer.receiverLng,
    receiverLocation: transfer.receiverLocation,
    photos: transfer.photos as { url: string; fileName?: string }[] | null,
    deliveryMode: transfer.deliveryMode,
    shortageRemarks: transfer.shortageRemarks,
    damageRemarks: transfer.damageRemarks,
    // Dispatch proof
    dispatchPhotos: transfer.dispatchPhotos as { url: string; fileName?: string }[] | null,
    dispatchSignature: transfer.dispatchSignature,
    // Supervisor + weighbridge + geo-fence
    supervisorSignature: transfer.supervisorSignature,
    weighbridgeTicketNo: transfer.weighbridgeTicketNo,
    grossWeight: transfer.grossWeight ? toNum(transfer.grossWeight) : null,
    tareWeight: transfer.tareWeight ? toNum(transfer.tareWeight) : null,
    netWeight: transfer.netWeight ? toNum(transfer.netWeight) : null,
    geoFenceOk: transfer.geoFenceOk,
    geoFenceDistance: transfer.geoFenceDistance,
    totalQty,
    lineCount: transfer.lines.length,
    // Gate pass context (for DRAFT transfers awaiting gate pass approval)
    gatePass: gatePass ? {
      id: gatePass.id,
      gatePassNumber: gatePass.gatePassNumber,
      status: gatePass.status,
    } : null,
    // Sender/receiver context
    currentCompanyId: company.id,
    fromCompanyId,
    toCompanyId,
    isSourceCompany,
    isDestCompany,
    userMemberships,
    lines: transfer.lines.map((l) => ({
      id: l.id,
      materialId: l.materialId,
      materialName: l.material.name,
      materialCode: l.material.code,
      materialUnit: l.material.unit,
      hsnCode: l.material.hsnCode,
      gstRate: toNum(l.material.gstRate),
      qty: toNum(l.qty),
      qtyReceived: toNum(l.qtyReceived),
      unitCostAtSource: l.unitCostAtSource ? toNum(l.unitCostAtSource) : null,
      unitTransferPrice: l.unitTransferPrice ? toNum(l.unitTransferPrice) : null,
      lineTransferTotal: l.lineTransferTotal ? toNum(l.lineTransferTotal) : null,
    })),
  };

  // Pipeline position: DRAFT → IN_TRANSIT → COMPLETED (or CANCELLED)
  const pipelineSteps: MobilePipelineStep[] = [
    { label: "Draft", state: "done" },
    {
      label: "Dispatch",
      state: transfer.status === "IN_TRANSIT" || transfer.status === "COMPLETED" ? "done" : transfer.status === "DRAFT" ? "current" : "pending",
    },
    {
      label: "Receive",
      state: transfer.status === "COMPLETED" ? "done" : transfer.status === "IN_TRANSIT" ? "current" : "pending",
    },
  ];
  if (transfer.status === "CANCELLED") {
    pipelineSteps[1] = { label: "Dispatch", state: "skipped" };
    pipelineSteps[2] = { label: "Receive", state: "skipped" };
  }

  const nextAction = resolveNextAction("stockTransfer", transfer.status, role, overrides);

  return (
    <PageContextProvider value={{
      entityType: "stockTransfer",
      flowId: "stockTransfer",
      status: transfer.status,
      label: `${serialized.fromLocation.name} → ${serialized.toLocation.name}`,
      recordId: serialized.id,
      canActions: canManage ? [PERM.STOCK_TRANSFER] : [],
    }}>
    <>
      <RecordRecentItem type="transfer" id={serialized.id} label={`${serialized.fromLocation.name} → ${serialized.toLocation.name}`} href={`/m/transfers/${serialized.id}`} />

      {/* ── Next action — the one thing to do, doable on this page ── */}
      {nextAction ? (
        <NextActionCardView
          label={nextAction.label}
          reason={nextAction.reason}
          tone={nextAction.tone ?? "signal"}
          hash={nextAction.action.type === "anchor" ? nextAction.action.hash : undefined}
          href={nextAction.action.type === "navigate" ? nextAction.action.href.replace("{id}", serialized.id) : undefined}
        />
      ) : null}

      <div className="mb-3 rounded-[0.5rem] border px-3 py-2" style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}>
        <MobilePipelineStepper steps={pipelineSteps} />
      </div>
      <MobileTransferDetailClient transfer={serialized} canManage={canManage} />
    </>
    </PageContextProvider>
  );
}
