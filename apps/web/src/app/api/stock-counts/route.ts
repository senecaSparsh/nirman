import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { createStockCount } from "@nirman/services";
import { apiHandler, json, stockCountSchema, toNum, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { requirePermission } from "@/lib/server";

export const GET = apiHandler(async () => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();
  const counts = await prisma.stockCount.findMany({
    where: { location: { companyId: company.id, deletedAt: null } },
    orderBy: { createdAt: "desc" },
    include: {
      location: { select: { id: true, name: true, type: true } },
      lines: { include: { material: { select: { code: true, name: true, unit: true } } } },
    },
  });
  return json(
    counts.map((c) => ({
      id: c.id,
      locationId: c.locationId,
      locationName: c.location.name,
      locationType: c.location.type,
      status: c.status,
      countDate: c.countDate.toISOString(),
      notes: c.notes,
      createdAt: c.createdAt.toISOString(),
      lineCount: c.lines.length,
      totalVariance: c.lines.reduce(
        (s, l) => s + toNum(l.variance),
        0,
      ),
      lines: c.lines.map((l) => ({
        id: l.id,
        materialId: l.materialId,
        materialCode: l.material.code,
        materialName: l.material.name,
        unit: l.material.unit,
        countedQty: toNum(l.countedQty),
        systemQty: toNum(l.systemQty),
        variance: toNum(l.variance),
      })),
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.INVENTORY_MANAGE);
  const body = await req.json();
  const parsed = stockCountSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const count = await createStockCount({
      locationId: parsed.data.locationId,
      notes: parsed.data.notes ?? undefined,
      userId: user.id,
      lines: parsed.data.lines,
    });
    return json({ ok: true, id: count.id }, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to create stock count") }, { status: 400 });
  }
});
