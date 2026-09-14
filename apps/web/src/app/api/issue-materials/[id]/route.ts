import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { cancelMaterialIssue, executeMaterialIssue, recordVehicleTrip, ServiceError } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, scopeWhere, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

/** GET /api/issue-materials/[id] — fetch a single material issue by ID */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const issue = await prisma.materialIssue.findFirst({
    where: {
      id,
      OR: [
        { project: { companyId: company.id, deletedAt: null } },
        { department: { companyId: company.id, deletedAt: null } },
      ],
      ...await scopeWhere("MaterialIssue"),
    },
    include: {
      project: { select: { id: true, name: true } },
      department: { select: { id: true, name: true, code: true } },
      fromLocation: { select: { id: true, name: true } },
      subcontractor: { select: { id: true, name: true } },
      issuedBy: { select: { id: true, name: true } },
      lines: {
        include: { material: { select: { id: true, code: true, name: true, unit: true } } },
      },
    },
  });
  if (!issue) return json({ error: "Material issue not found" }, { status: 404 });
  // Surface the gate pass linked to this issue (GatePass.refType/refId points
  // back at the MaterialIssue) so callers can trace "my issue" → "the gate
  // pass awaiting approval/exit" without a second list lookup.
  const gatePass = await prisma.gatePass.findFirst({
    where: { refType: "MaterialIssue", refId: id, companyId: company.id },
    select: { id: true, gatePassNumber: true, status: true, category: true },
    orderBy: { createdAt: "desc" },
  });
  return json({ ...issue, gatePassId: gatePass?.id ?? null, gatePass: gatePass ?? null });
});

/**
 * PATCH /api/issue-materials/[id] — cancel a material issue.
 * Reverses stock (ADJUSTMENT_IN), GL entries, and project cost reallocation.
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.STOCK_ISSUE);
  const company = await getCompany();
  const { id } = await params;
  const existing = await prisma.materialIssue.findFirst({
    where: {
      id,
      OR: [
        { project: { companyId: company.id, deletedAt: null } },
        { department: { companyId: company.id, deletedAt: null } },
      ],
      ...await scopeWhere("MaterialIssue"),
    },
    select: { id: true, status: true },
  });
  if (!existing) return json({ error: "Material issue not found" }, { status: 404 });
  const body = await req.json();
  const action = body?.action as string;

  if (action === "cancel") {
    try {
      const result = await cancelMaterialIssue(id, user.id);
      revalidatePath("/stock");
      revalidatePath("/m/stock");
      revalidatePath("/projects");
      revalidatePath("/m/projects");
    revalidatePath("/m/real-estate?tab=projects");
      revalidatePath("/gate-passes");
      revalidatePath("/gl");
      return json({ id: result.id, status: result.status });
    } catch (err: unknown) {
      return json({ error: err instanceof ServiceError ? err.message : "Failed to cancel issue" }, { status: err instanceof ServiceError ? err.status : 400 });
    }
  }

  if (action === "execute") {
    try {
      if (existing.status !== "PENDING") {
        return json({ error: `Cannot execute issue in status ${existing.status}` }, { status: 400 });
      }
      const result = await executeMaterialIssue(id, user.id);

      // Log the vehicle trip if vehicle details exist
      const fullIssue = await prisma.materialIssue.findUnique({
        where: { id },
        select: { vehicleNumber: true, vehicleType: true, vehiclePhotoUrl: true, driverName: true, driverPhone: true, fromLocationId: true },
      });
      if (fullIssue?.vehicleNumber) {
        await recordVehicleTrip({
          vehicleNumber: fullIssue.vehicleNumber,
          vehicleType: fullIssue.vehicleType ?? "OTHER",
          photoUrl: fullIssue.vehiclePhotoUrl ?? undefined,
          driverName: fullIssue.driverName ?? undefined,
          driverPhone: fullIssue.driverPhone ?? undefined,
          movementType: "MATERIAL_ISSUE",
          refType: "MaterialIssue",
          refId: id,
          fromLocationId: fullIssue.fromLocationId,
          companyId: company.id,
        }).catch(() => { /* best-effort */ });
      }

      revalidatePath("/m/stock");
      revalidatePath("/gate-passes");
      revalidatePath("/projects");
      revalidatePath("/m/projects");
      revalidatePath("/m/real-estate?tab=projects");
      revalidatePath("/stock");
      return json({ ok: true, totalCost: toNum(result.totalCost) });
    } catch (err: unknown) {
      if (err instanceof ServiceError) {
        return json({ error: err.message }, { status: err.status ?? 400 });
      }
      return json({ error: "Failed to execute issue" }, { status: 400 });
    }
  }

  return json({ error: "Unknown action" }, { status: 400 });
});
