import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { issueMaterialsToProject, issueMaterialsToDepartment, createMaterialIssueRequest, executeMaterialIssue, recordVehicleTrip } from "@nirman/services";
import { apiHandler, getCompany, json, issueMaterialsSchema, toNum, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.STOCK_ISSUE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = issueMaterialsSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const location = await prisma.stockLocation.findFirst({
    where: { id: parsed.data.fromLocationId, companyId: company.id, deletedAt: null },
  });
  if (!location) return json({ error: "Source location not found in your company" }, { status: 404 });

  // Gate pass mode: if requireGatePass=true, create a PENDING issue + gate pass (no stock movements)
  const requireGatePass = body?.requireGatePass === true;

  try {
    const common = {
      fromLocationId: parsed.data.fromLocationId,
      issuedById: user.id,
      notes: parsed.data.notes ?? undefined,
      receiverName: parsed.data.receiverName ?? undefined,
      receiverMobile: parsed.data.receiverMobile ?? undefined,
      vehicleNumber: parsed.data.vehicleNumber ?? undefined,
      vehicleType: parsed.data.vehicleType ?? undefined,
      vehiclePhotoUrl: parsed.data.vehiclePhotoUrl ?? undefined,
      driverName: parsed.data.driverName ?? undefined,
      driverPhone: parsed.data.driverPhone ?? undefined,
      roundOff: parsed.data.roundOff ?? undefined,
      lines: parsed.data.lines.map((l) => ({ materialId: l.materialId, qty: l.qty, lotNumber: l.lotNumber ?? null })),
    };

    if (requireGatePass && !parsed.data.departmentId) {
      // Gate-pass-gated flow: create PENDING issue + gate pass, no stock movements
      const result = await createMaterialIssueRequest({
        ...common,
        projectId: parsed.data.projectId!,
        builtUnitId: parsed.data.builtUnitId ?? undefined,
      });
      revalidatePath("/m/stock");
      revalidatePath("/gate-passes");
      return json(
        { ok: true, materialIssueId: result.materialIssue.id, issueNumber: result.materialIssue.issueNumber, pending: true, message: "Gate pass created — awaiting approval before items can leave." },
        { status: 201 },
      );
    }

    // Standard flow: execute immediately
    const result = parsed.data.departmentId
      ? await issueMaterialsToDepartment({ ...common, departmentId: parsed.data.departmentId })
      : await issueMaterialsToProject({ ...common, projectId: parsed.data.projectId!, builtUnitId: parsed.data.builtUnitId ?? undefined });

    // Log the vehicle trip
    if (parsed.data.vehicleNumber) {
      await recordVehicleTrip({
        vehicleNumber: parsed.data.vehicleNumber,
        vehicleType: parsed.data.vehicleType ?? "OTHER",
        photoUrl: parsed.data.vehiclePhotoUrl,
        driverName: parsed.data.driverName,
        driverPhone: parsed.data.driverPhone,
        movementType: "MATERIAL_ISSUE",
        refType: "MaterialIssue",
        refId: result.materialIssue.id,
        fromLocationId: parsed.data.fromLocationId,
        companyId: company.id,
      }).catch(() => { /* best-effort */ });
    }

    revalidatePath("/m/stock");
    revalidatePath("/m/materials");
    return json(
      { ok: true, materialIssueId: result.materialIssue.id, issueNumber: result.materialIssue.issueNumber, totalCost: toNum(result.totalCost), totalAmount: toNum(result.totalCost) },
      { status: 201 },
    );
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to issue materials") }, { status: 400 });
  }
});

/**
 * PATCH /api/issue-materials — execute a PENDING material issue after gate pass approval.
 * Body: { action: "execute", issueId: "xxx" }
 */
export const PATCH = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.STOCK_ISSUE);
  const company = await getCompany();
  const body = await req.json();

  if (body?.action === "execute" && body?.issueId) {
    try {
      // Verify the issue belongs to this company
      const issue = await prisma.materialIssue.findFirst({
        where: { id: body.issueId, project: { companyId: company.id } },
        select: { id: true, status: true },
      });
      if (!issue) return json({ error: "Material issue not found" }, { status: 404 });
      if (issue.status !== "PENDING") return json({ error: `Cannot execute issue in status ${issue.status}` }, { status: 400 });

      const result = await executeMaterialIssue(body.issueId, user.id);

      // Log the vehicle trip if vehicle details exist
      const fullIssue = await prisma.materialIssue.findUnique({
        where: { id: body.issueId },
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
          refId: body.issueId,
          fromLocationId: fullIssue.fromLocationId,
          companyId: company.id,
        }).catch(() => { /* best-effort */ });
      }

      revalidatePath("/m/stock");
      revalidatePath("/gate-passes");
      return json({ ok: true, totalCost: toNum(result.totalCost) });
    } catch (err: unknown) {
      return json({ error: (err instanceof Error ? err.message : "Failed to execute issue") }, { status: 400 });
    }
  }

  return json({ error: "Unknown action" }, { status: 400 });
});
