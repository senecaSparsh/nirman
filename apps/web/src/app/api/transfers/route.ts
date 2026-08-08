import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { createTransfer } from "@nirman/services";
import { apiHandler, json, transferSchema, toNum, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { requirePermission } from "@/lib/server";

export const GET = apiHandler(async () => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();
  const transfers = await prisma.stockTransfer.findMany({
    // Both sides of an inter-company STO see it.
    where: {
      OR: [
        { fromLocation: { companyId: company.id } },
        { toLocation: { companyId: company.id } },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: {
      fromLocation: { select: { id: true, name: true, type: true, company: { select: { name: true } } } },
      toLocation: { select: { id: true, name: true, type: true, company: { select: { name: true } } } },
      lines: { include: { material: { select: { name: true } } } },
    },
  });
  return json(
    transfers.map((t) => ({
      id: t.id,
      fromLocationId: t.fromLocationId,
      fromLocationName: t.fromLocation.name,
      fromLocationType: t.fromLocation.type,
      fromCompanyName: t.fromLocation.company?.name ?? null,
      toLocationId: t.toLocationId,
      toLocationName: t.toLocation.name,
      toLocationType: t.toLocation.type,
      toCompanyName: t.toLocation.company?.name ?? null,
      status: t.status,
      transferDate: t.transferDate.toISOString(),
      notes: t.notes,
      createdAt: t.createdAt.toISOString(),
      lineCount: t.lines.length,
      totalQty: t.lines.reduce((s, l) => s + toNum(l.qty), 0),
      materials: t.lines.map((l) => l.material.name),
      isInterCompany: t.isInterCompany,
      transferPriceTotal: t.transferPriceTotal ? toNum(t.transferPriceTotal) : null,
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
    const transfer = await createTransfer({
      fromLocationId: parsed.data.fromLocationId,
      toLocationId: parsed.data.toLocationId,
      notes: parsed.data.notes ?? undefined,
      freight: parsed.data.freight,
      handlingFee: parsed.data.handlingFee,
      markupPct: parsed.data.markupPct,
      lines: parsed.data.lines,
    });
    return json(transfer, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to create transfer") }, { status: 400 });
  }
});
