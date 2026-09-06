import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import type { EquipmentStatus } from "@nirman/db";
import { createEquipment, ServiceError } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum, equipmentSchema } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { parseCursorParams, cursorToWhere, buildCursorResponse } from "@/lib/cursor-pagination";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const category = searchParams.get("category");

  // Cursor pagination — backward compatible. If `cursor` param is present,
  // return { items, nextCursor, hasMore }. Otherwise return flat array.
  const { take, cursor, skip } = parseCursorParams(req);
  const usePagination = searchParams.has("cursor") || searchParams.has("take");

  const equipment = await prisma.equipment.findMany({
    take: usePagination ? take + 1 : 200,
    skip: usePagination ? skip : undefined,
    where: {
      companyId: company.id,
      deletedAt: null,
      ...(status ? { status: status as EquipmentStatus } : {}),
      ...(category ? { category } : {}),
      ...(usePagination ? (cursorToWhere(cursor) ?? {}) : {}),
    },
    orderBy: usePagination ? { createdAt: "desc" } : [{ status: "asc" }, { name: "asc" }],
    include: {
      assignments: {
        where: { status: "ACTIVE" },
        take: 1,
        include: {
          location: { select: { name: true } },
          project: { select: { name: true } },
        },
      },
    },
  });

  const mapped = equipment.map((e) => {
      const activeAssignment = e.assignments[0] ?? null;
      return {
        id: e.id,
        assetTag: e.assetTag,
        name: e.name,
        model: e.model,
        serialNumber: e.serialNumber,
        category: e.category,
        status: e.status,
        acquisitionCost: toNum(e.acquisitionCost),
        currentValue: toNum(e.currentValue),
        purchaseDate: e.purchaseDate?.toISOString() ?? null,
        createdAt: e.createdAt.toISOString(),
        notes: e.notes,
        activeAssignment: activeAssignment
          ? {
              id: activeAssignment.id,
              locationId: activeAssignment.locationId,
              locationName: activeAssignment.location.name,
              projectId: activeAssignment.projectId,
              projectName: activeAssignment.project?.name ?? null,
              assignedAt: activeAssignment.assignedAt.toISOString(),
            }
          : null,
      };
    });

  if (usePagination) {
    const { items, nextCursor, hasMore } = buildCursorResponse(mapped, take, (r) => ({
      createdAt: r.createdAt,
      id: r.id,
    }));
    return NextResponse.json({ items, nextCursor, hasMore });
  }
  return json(mapped);
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = equipmentSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const eq = await createEquipment({
      assetTag: parsed.data.assetTag,
      name: parsed.data.name,
      model: parsed.data.model ?? undefined,
      serialNumber: parsed.data.serialNumber ?? undefined,
      category: parsed.data.category ?? undefined,
      companyId: company.id,
      acquisitionCost: parsed.data.acquisitionCost,
      purchaseDate: parsed.data.purchaseDate ? new Date(parsed.data.purchaseDate) : undefined,
      notes: parsed.data.notes ?? undefined,
      userId: user.id,
    });
    revalidatePath("/equipment");
    revalidatePath("/m/equipment");
    return json({ ok: true, id: eq.id }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof ServiceError) {
      return json({ error: err.message }, { status: err.status ?? 400 });
    }
    return json({ error: "Failed to create equipment" }, { status: 500 });
  }
});
