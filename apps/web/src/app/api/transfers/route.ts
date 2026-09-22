import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { createTransfer, ServiceError } from "@nirman/services";
import { apiHandler, json, transferSchema, toNum, getAssignedProjectIds, getCompany, getCompanyGroupIds, getUserScope, requirePermission, assertScopeAllows } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * Scope filter for transfers — StockTransfer has no project/department of its
 * own, so visibility flows through its endpoint locations: a transfer is in
 * scope when AT LEAST ONE endpoint location belongs to the viewer's projects
 * (or departments). Same rule as POST's per-location assertScopeAllows:
 * shared warehouse locations are reachable by everyone.
 */
async function transferScopeWhere(): Promise<Record<string, unknown>> {
  const scope = await getUserScope();
  if (scope.scopeType === "COMPANY") return {};
  if (scope.scopeType === "DEPARTMENT") {
    if (scope.departmentIds.length === 0) return { id: { in: [] } };
    return {
      OR: [
        { fromLocation: { departmentId: { in: scope.departmentIds } } },
        { toLocation: { departmentId: { in: scope.departmentIds } } },
      ],
    };
  }
  const effective = await getAssignedProjectIds();
  if (!effective || effective.length === 0) return { id: { in: [] } };
  return {
    OR: [
      { fromLocation: { projectId: { in: effective } } },
      { toLocation: { projectId: { in: effective } } },
    ],
  };
}

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
      AND: [await transferScopeWhere()],
    },
    orderBy: { createdAt: "desc" },
    take: 500,
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
      // Vehicle / dispatch
      vehicleNumber: t.vehicleNumber,
      vehicleType: t.vehicleType,
      driverName: t.driverName,
      driverPhone: t.driverPhone,
      transporterName: t.transporterName,
      challanNumber: t.challanNumber,
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.STOCK_TRANSFER);
  const body = await req.json();
  const parsed = transferSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const groupIds = await getCompanyGroupIds();

    // Scope check on both ends — a scoped user may only move stock through
    // locations inside their scope (shared warehouse/dept locations stay
    // reachable since they carry no projectId).
    const locs = await prisma.stockLocation.findMany({
      where: { id: { in: [parsed.data.fromLocationId, parsed.data.toLocationId] } },
      select: { id: true, projectId: true, departmentId: true },
    });
    for (const loc of locs) {
      try {
        await assertScopeAllows({ projectId: loc.projectId ?? null, departmentId: loc.departmentId ?? null });
      } catch (err) {
        return json({ error: err instanceof Error ? err.message : "Scope violation" }, { status: 403 });
      }
    }

    const transfer = await createTransfer({
      fromLocationId: parsed.data.fromLocationId,
      toLocationId: parsed.data.toLocationId,
      notes: parsed.data.notes ?? undefined,
      companyGroupIds: groupIds,
      freight: parsed.data.freight,
      handlingFee: parsed.data.handlingFee,
      markupPct: parsed.data.markupPct,
      vehicleType: parsed.data.vehicleType,
      vehicleNumber: parsed.data.vehicleNumber,
      driverName: parsed.data.driverName,
      driverPhone: parsed.data.driverPhone,
      transporterName: parsed.data.transporterName,
      referenceNo: parsed.data.referenceNo ?? undefined,
      ewayBillNo: parsed.data.ewayBillNo ?? undefined,
      lines: parsed.data.lines,
      userId: user.id,
    });
    revalidatePath("/transfers");
    revalidatePath("/m/stock");
    return json(transfer, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof ServiceError) {
      return json({ error: err.message }, { status: err.status ?? 400 });
    }
    return json({ error: "Failed to create transfer" }, { status: 500 });
  }
});
