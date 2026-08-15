import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import type { RequisitionStatus } from "@nirman/db";
import { createRequisition } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, json, requirePermission, requisitionSchema, toNum } from "@/lib/server";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.PROCUREMENT_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status");
  const statusFilter = statusParam ? { status: { in: statusParam.split(",") as RequisitionStatus[] } } : {};

  const reqs = await prisma.materialRequisition.findMany({
    where: { project: { companyId: company.id }, ...statusFilter },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      project: { select: { id: true, name: true } },
      phase: { select: { id: true, name: true } },
      lines: { select: { qtyRequested: true } },
    },
  });

  return json(
    reqs.map((r) => {
      const totalQty = r.lines.reduce((s, l) => s + toNum(l.qtyRequested), 0);
      return {
        id: r.id,
        reqNumber: r.reqNumber,
        projectId: r.projectId,
        projectName: r.project?.name ?? null,
        phaseId: r.phaseId,
        phaseName: r.phase?.name ?? null,
        status: r.status,
        requestDate: r.requestDate.toISOString(),
        neededByDate: r.neededByDate?.toISOString() ?? null,
        notes: r.notes,
        convertedPoId: r.convertedPoId,
        lineCount: r.lines.length,
        totalQty,
        createdAt: r.createdAt.toISOString(),
      };
    }),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
  const body = await req.json();
  const parsed = requisitionSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { phaseId, neededByDate, ...rest } = parsed.data;
  const company = await getCompany();
  try {
    const req = await createRequisition({
      ...rest,
      companyId: company.id,
      phaseId: phaseId ?? undefined,
      neededByDate: neededByDate ? new Date(neededByDate) : undefined,
      notes: rest.notes ?? undefined,
      requestedById: user.id,
      lines: rest.lines.map((l) => ({
        materialId: l.materialId,
        qtyRequested: l.qtyRequested,
        notes: l.notes ?? undefined,
        preferredSupplierId: l.preferredSupplierId ?? undefined,
      })),
    });
    return json({ ok: true, id: req.id, reqNumber: req.reqNumber }, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to create requisition") }, { status: 400 });
  }
});
