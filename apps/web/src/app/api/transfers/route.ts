import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { createTransfer } from "@nirman/services";
import { apiHandler, json, transferSchema, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { requirePermission } from "@/lib/server";

export const GET = apiHandler(async () => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const transfers = await prisma.stockTransfer.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      fromLocation: { select: { id: true, name: true, type: true } },
      toLocation: { select: { id: true, name: true, type: true } },
      lines: { include: { material: { select: { name: true } } } },
    },
  });
  return json(
    transfers.map((t) => ({
      id: t.id,
      fromLocationId: t.fromLocationId,
      fromLocationName: t.fromLocation.name,
      fromLocationType: t.fromLocation.type,
      toLocationId: t.toLocationId,
      toLocationName: t.toLocation.name,
      toLocationType: t.toLocation.type,
      status: t.status,
      transferDate: t.transferDate.toISOString(),
      notes: t.notes,
      createdAt: t.createdAt.toISOString(),
      lineCount: t.lines.length,
      totalQty: t.lines.reduce((s, l) => s + toNum(l.qty), 0),
      materials: t.lines.map((l) => l.material.name),
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.STOCK_TRANSFER);
  const body = await req.json();
  const parsed = transferSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const transfer = await createTransfer({ ...parsed.data, notes: parsed.data.notes ?? undefined });
    return json(transfer, { status: 201 });
  } catch (err: any) {
    return json({ error: err?.message ?? "Failed to create transfer" }, { status: 400 });
  }
});
