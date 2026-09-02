import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@nirman/db";
import { completeTransfer, cancelTransfer, dispatchTransfer, returnTransferToSource, recordVehicleTrip } from "@nirman/services";
import { apiHandler, json, toNum, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { requirePermission } from "@/lib/server";

const transferActionSchema = z.object({
  action: z.enum(["dispatch", "complete", "cancel", "returnToSource"]),
  // Dispatch fields
  vehicleNumber: z.string().optional(),
  vehicleType: z.string().optional(),
  driverName: z.string().optional(),
  driverPhone: z.string().optional(),
  transporterName: z.string().optional(),
  challanNumber: z.string().optional(),
  packageCount: z.union([z.number(), z.string()]).optional().transform((v) => (v != null ? Number(v) : undefined)),
  dispatchPhotos: z.array(z.string()).optional(),
  dispatchSignature: z.string().optional(),
  // Complete (receive) fields
  receiverSignature: z.string().optional(),
  receiverLat: z.union([z.number(), z.string()]).optional().transform((v) => (v != null ? Number(v) : undefined)),
  receiverLng: z.union([z.number(), z.string()]).optional().transform((v) => (v != null ? Number(v) : undefined)),
  receiverLocation: z.string().optional(),
  photos: z.array(z.string()).optional(),
  deliveryMode: z.string().optional(),
  shortageRemarks: z.string().optional(),
  damageRemarks: z.string().optional(),
  supervisorSignature: z.string().optional(),
  supervisorId: z.string().optional(),
  weighbridgeTicketNo: z.string().optional(),
  grossWeight: z.union([z.number(), z.string()]).optional().transform((v) => (v != null ? Number(v) : undefined)),
  tareWeight: z.union([z.number(), z.string()]).optional().transform((v) => (v != null ? Number(v) : undefined)),
  netWeight: z.union([z.number(), z.string()]).optional().transform((v) => (v != null ? Number(v) : undefined)),
  lineReceipts: z.array(z.any()).optional(),
  // Return/cancel
  reason: z.string().optional(),
  notes: z.string().optional(),
});

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
    deliveryMode: transfer.deliveryMode,
    vehicleNumber: transfer.vehicleNumber,
    vehicleType: transfer.vehicleType,
    driverName: transfer.driverName,
    driverPhone: transfer.driverPhone,
    transporterName: transfer.transporterName,
    challanNumber: transfer.challanNumber,
    packageCount: transfer.packageCount,
    dispatchedAt: transfer.dispatchedAt ? transfer.dispatchedAt.toISOString() : null,
    receivedAt: transfer.receivedAt ? transfer.receivedAt.toISOString() : null,
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
  const raw = await req.json();
  const parsed = transferActionSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { action, ...body } = parsed.data;

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

      revalidatePath("/transfers");
      revalidatePath("/m/stock");
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
      revalidatePath("/transfers");
      revalidatePath("/m/stock");
      return json(t);
    }
    if (action === "returnToSource") {
      const t = await returnTransferToSource(id, user.id, body.reason);
      revalidatePath("/transfers");
      revalidatePath("/m/stock");
      return json(t);
    }
    if (action === "cancel") {
      const t = await cancelTransfer(id, user.id);
      revalidatePath("/transfers");
      revalidatePath("/m/stock");
      return json(t);
    }
    return json({ error: "Unknown action" }, { status: 400 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Action failed") }, { status: 400 });
  }
});
