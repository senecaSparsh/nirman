import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { softDelete, updateUnitStatus, updateUnitValuation, updateBuiltUnit } from "@nirman/services";
import { apiHandler, json, requirePermission, toNum, builtUnitStatusSchema, builtUnitValuationSchema, builtUnitEditSchema } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_VIEW);
  const { id } = await params;
  const unit = await prisma.builtUnit.findFirst({
    where: { id, project: { companyId: user.companyId ?? undefined }, deletedAt: null },
    include: {
      project: { select: { id: true, name: true } },
      phase: { select: { id: true, name: true } },
    },
  });
  if (!unit) return json({ error: "Unit not found" }, { status: 404 });
  return json({
    id: unit.id,
    projectId: unit.projectId,
    projectName: unit.project.name,
    phaseId: unit.phaseId,
    phaseName: unit.phase?.name ?? null,
    unitType: unit.unitType,
    unitNumber: unit.unitNumber,
    floor: unit.floor,
    wing: unit.wing,
    area: toNum(unit.area),
    areaUnit: unit.areaUnit,
    status: unit.status,
    productionCost: toNum(unit.productionCost),
    askingPrice: unit.askingPrice ? toNum(unit.askingPrice) : null,
    currentValuation: toNum(unit.currentValuation),
    nrvWriteDown: toNum(unit.nrvWriteDown),
    saleId: unit.saleId,
  });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const { id } = await params;
  const body = await req.json();
  const action = body?.action as string | undefined;

  if (action === "status") {
    const statusParsed = builtUnitStatusSchema.safeParse(body?.status);
    if (!statusParsed.success) {
      return json({ error: "Invalid status" }, { status: 400 });
    }
    try {
      await updateUnitStatus(id, statusParsed.data, user.id);
      return json({ ok: true });
    } catch (err: unknown) {
      return json({ error: (err instanceof Error ? err.message : "Status change failed") }, { status: 400 });
    }
  }

  if (action === "valuation") {
    const parsed = builtUnitValuationSchema.safeParse({
      askingPrice: body?.askingPrice,
      currentValuation: body?.currentValuation,
    });
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    try {
      await updateUnitValuation(
        id,
        {
          currentValuation: parsed.data.currentValuation,
          askingPrice: parsed.data.askingPrice ?? undefined,
        },
        user.id,
      );
      return json({ ok: true });
    } catch (err: unknown) {
      return json({ error: (err instanceof Error ? err.message : "Valuation update failed") }, { status: 400 });
    }
  }

  if (action === "edit") {
    const parsed = builtUnitEditSchema.safeParse({
      unitType: body?.unitType,
      unitNumber: body?.unitNumber,
      floor: body?.floor,
      wing: body?.wing,
      area: body?.area,
      areaUnit: body?.areaUnit,
      askingPrice: body?.askingPrice,
    });
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    try {
      await updateBuiltUnit(id, {
        unitType: parsed.data.unitType,
        unitNumber: parsed.data.unitNumber,
        floor: parsed.data.floor ?? null,
        wing: parsed.data.wing ?? null,
        area: parsed.data.area,
        areaUnit: parsed.data.areaUnit,
        askingPrice: parsed.data.askingPrice ?? null,
        userId: user.id,
      });
      return json({ ok: true });
    } catch (err: unknown) {
      return json({ error: (err instanceof Error ? err.message : "Edit failed") }, { status: 400 });
    }
  }

  return json({ error: "Invalid action. Use status, valuation, or edit." }, { status: 400 });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.ASSETS_MANAGE);
  const { id } = await params;
  await softDelete("BuiltUnit", id);
  return json({ ok: true });
});
