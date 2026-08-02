import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { createBuiltUnits } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum, builtUnitSchema } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const status = searchParams.get("status");
  const unitType = searchParams.get("unitType");

  const units = await prisma.builtUnit.findMany({
    where: {
      deletedAt: null,
      project: { companyId: company.id },
      ...(projectId ? { projectId } : {}),
      ...(status ? { status: status as any } : {}),
      ...(unitType ? { unitType: unitType as any } : {}),
    },
    orderBy: [{ projectId: "asc" }, { unitNumber: "asc" }],
    include: {
      project: { select: { id: true, name: true } },
      phase: { select: { id: true, name: true } },
    },
  });

  return json(
    units.map((u) => ({
      id: u.id,
      projectId: u.projectId,
      projectName: u.project.name,
      phaseId: u.phaseId,
      phaseName: u.phase?.name ?? null,
      unitType: u.unitType,
      unitNumber: u.unitNumber,
      floor: u.floor,
      wing: u.wing,
      area: toNum(u.area),
      areaUnit: u.areaUnit,
      status: u.status,
      productionCost: toNum(u.productionCost),
      askingPrice: u.askingPrice ? toNum(u.askingPrice) : null,
      currentValuation: toNum(u.currentValuation),
      nrvWriteDown: toNum(u.nrvWriteDown),
      saleId: u.saleId,
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const body = await req.json();
  // Support both single-unit and batch creation
  const units = Array.isArray(body) ? body : [body];
  const parsed = units.map((u) => builtUnitSchema.safeParse(u));
  const failed = parsed.find((p) => !p.success);
  if (failed && !failed.success) {
    return json({ error: failed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const valid = parsed.map((p) => p!.data).filter((d) => d !== undefined);
  // All units must belong to the same project
  const projectId = valid[0]?.projectId;
  if (!projectId) {
    return json({ error: "No valid units provided" }, { status: 400 });
  }
  if (!valid.every((u) => u!.projectId === projectId)) {
    return json({ error: "All units in a batch must belong to the same project" }, { status: 400 });
  }
  try {
    const created = await createBuiltUnits({
      projectId,
      userId: user.id,
      units: valid.map((u) => ({
        unitType: u!.unitType,
        unitNumber: u!.unitNumber,
        floor: u!.floor ?? undefined,
        wing: u!.wing ?? undefined,
        area: u!.area,
        areaUnit: u!.areaUnit,
        askingPrice: u!.askingPrice ?? undefined,
        phaseId: u!.phaseId ?? null,
      })),
    });
    return json({ ok: true, count: created.length }, { status: 201 });
  } catch (err: any) {
    return json({ error: err?.message ?? "Failed to create units" }, { status: 400 });
  }
});
