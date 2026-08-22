import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { completeTransfer, cancelTransfer, dispatchTransfer, returnTransferToSource, recordVehicleTrip } from "@nirman/services";
import { apiHandler, json, toNum, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { requirePermission } from "@/lib/server";

export const GET = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();
  const { id } = await ctx.params;
  const transfer = await prisma.stockTransfer.findUnique({
    where: { id },
    include: {
      fromLocation: { select: { id: true, name: true, companyId: true, company: { select: { name: true } } } },
      toLocation: { select: { id: true, name: true, companyId: true, company: { select: { name: true } } } },
      lines: {
        include: { material: { select: { id: true, code: true, name: true, unit: true } } },
      },
    },
  });
  // Visible to either the originating or receiving company (inter-company STO).
  if (
    !transfer ||
    (transfer.fromLocation.companyId !== company.id && transfer.toLocation.companyId !== company.id)
  ) {
    return json({ error: "Transfer not found" }, { status: 404 });
  }
  return json({
    id: transfer.id,
    fromLocationId: transfer.fromLocationId,
    fromLocationName: transfer.fromLocation.name,
    fromCompanyName: transfer.fromLocation.company?.name ?? null,
    toLocationId: transfer.toLocationId,
    toLocationName: transfer.toLocation.name,
    toCompanyName: transfer.toLocation.company?.name ?? null,
    status: transfer.status,
    transferDate: transfer.transferDate.toISOString(),
    notes: transfer.notes,
    isInterCompany: transfer.isInterCompany,
    freight: toNum(transfer.freight),
    handlingFee: toNum(transfer.handlingFee),
    markupPct: toNum(transfer.markupPct),
    transferPriceTotal: transfer.transferPriceTotal ? toNum(transfer.transferPriceTotal) : null,
    lines: transfer.lines.map((l) => ({
      id: l.id,
      materialId: l.materialId,
      materialName: l.material.name,
      materialCode: l.material.code,
      unit: l.material.unit,
      qty: toNum(l.qty),
      unitCostAtSource: l.unitCostAtSource ? toNum(l.unitCostAtSource) : null,
      unitTransferPrice: l.unitTransferPrice ? toNum(l.unitTransferPrice) : null,
      lineTransferTotal: l.lineTransferTotal ? toNum(l.lineTransferTotal) : null,
    })),
  });
});

export const PATCH = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.STOCK_TRANSFER);
  const company = await getCompany();
  const { id } = await ctx.params;
  const body = await req.json();
  const action = body?.action as string;

  // Fetch the transfer to check company context
  const transfer = await prisma.stockTransfer.findUnique({
    where: { id },
    select: {
      status: true,
      fromLocation: { select: { companyId: true } },
      toLocation: { select: { companyId: true } },
    },
  });
  if (!transfer) {
    return json({ error: "Transfer not found" }, { status: 404 });
  }

  // Sender/receiver separation: dispatch from source company, receive at dest company
  if (action === "dispatch") {
    if (transfer.fromLocation.companyId !== company.id) {
      return json({ error: "Only the source company can dispatch this transfer. Switch to the sending company." }, { status: 403 });
    }
  }
  if (action === "complete") {
    if (transfer.toLocation.companyId !== company.id) {
      return json({ error: "Only the destination company can receive this transfer. Switch to the receiving company." }, { status: 403 });
    }
  }
  if (action === "returnToSource") {
    if (transfer.toLocation.companyId !== company.id) {
      return json({ error: "Only the destination company can return this transfer." }, { status: 403 });
    }
  }
  if (action === "cancel") {
    if (transfer.fromLocation.companyId !== company.id) {
      return json({ error: "Only the source company can cancel this transfer." }, { status: 403 });
    }
  }

  try {
    if (action === "dispatch") {
      const t = await dispatchTransfer(id, user.id, {
        vehicleType: body.vehicleType,
        vehicleNumber: body.vehicleNumber,
        driverName: body.driverName,
        driverPhone: body.driverPhone,
        transporterName: body.transporterName,
        challanNumber: body.challanNumber,
        packageCount: body.packageCount,
        dispatchPhotos: body.dispatchPhotos,
        dispatchSignature: body.dispatchSignature,
      });

      // Log the vehicle trip
      if (body.vehicleNumber) {
        const tripTransfer = await prisma.stockTransfer.findUnique({ where: { id }, select: { fromLocationId: true, toLocationId: true } });
        await recordVehicleTrip({
          vehicleNumber: body.vehicleNumber,
          vehicleType: body.vehicleType ?? "OTHER",
          driverName: body.driverName,
          driverPhone: body.driverPhone,
          transporterName: body.transporterName,
          movementType: "STOCK_TRANSFER",
          refType: "StockTransfer",
          refId: id,
          fromLocationId: tripTransfer?.fromLocationId,
          toLocationId: tripTransfer?.toLocationId,
          photos: body.dispatchPhotos,
          companyId: company.id,
        }).catch(() => { /* best-effort */ });
      }

      return json(t);
    }
    if (action === "complete") {
      const t = await completeTransfer(id, user.id, {
        receivedById: user.id,
        receiverSignature: body.receiverSignature,
        receiverLat: body.receiverLat,
        receiverLng: body.receiverLng,
        receiverLocation: body.receiverLocation,
        photos: body.photos,
        deliveryMode: body.deliveryMode,
        shortageRemarks: body.shortageRemarks,
        damageRemarks: body.damageRemarks,
        supervisorSignature: body.supervisorSignature,
        supervisorId: body.supervisorId,
        weighbridgeTicketNo: body.weighbridgeTicketNo,
        grossWeight: body.grossWeight,
        tareWeight: body.tareWeight,
        netWeight: body.netWeight,
        lineReceipts: body.lineReceipts,
      });
      return json(t);
    }
    if (action === "returnToSource") {
      const t = await returnTransferToSource(id, user.id, body.reason);
      return json(t);
    }
    if (action === "cancel") {
      const t = await cancelTransfer(id, user.id);
      return json(t);
    }
    return json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Action failed") }, { status: 400 });
  }
});
