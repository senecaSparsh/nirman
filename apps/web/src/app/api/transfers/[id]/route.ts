import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { completeTransfer, cancelTransfer } from "@nirman/services";
import { apiHandler, json, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { requirePermission } from "@/lib/server";

export const GET = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const { id } = await ctx.params;
  const transfer = await prisma.stockTransfer.findUnique({
    where: { id },
    include: {
      fromLocation: { select: { id: true, name: true } },
      toLocation: { select: { id: true, name: true } },
      lines: {
        include: { material: { select: { id: true, code: true, name: true, unit: true } } },
      },
    },
  });
  if (!transfer) return json({ error: "Transfer not found" }, { status: 404 });
  return json({
    id: transfer.id,
    fromLocationId: transfer.fromLocationId,
    fromLocationName: transfer.fromLocation.name,
    toLocationId: transfer.toLocationId,
    toLocationName: transfer.toLocation.name,
    status: transfer.status,
    transferDate: transfer.transferDate.toISOString(),
    notes: transfer.notes,
    lines: transfer.lines.map((l) => ({
      id: l.id,
      materialId: l.materialId,
      materialName: l.material.name,
      materialCode: l.material.code,
      unit: l.material.unit,
      qty: toNum(l.qty),
    })),
  });
});

export const PATCH = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const body = await req.json();
  const action = body?.action as string;
  try {
    if (action === "complete") {
      const t = await completeTransfer(id);
      return json(t);
    }
    if (action === "cancel") {
      const t = await cancelTransfer(id);
      return json(t);
    }
    return json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return json({ error: err?.message ?? "Action failed" }, { status: 400 });
  }
});
