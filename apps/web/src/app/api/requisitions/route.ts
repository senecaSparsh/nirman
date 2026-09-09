import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import type { RequisitionStatus } from "@nirman/db";
import { createRequisition, submitRequisition, ServiceError } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, json, requirePermission, requisitionSchema, toNum, scopeWhere, assertScopeAllows } from "@/lib/server";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.PROCUREMENT_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status");
  const statusFilter = statusParam ? { status: { in: statusParam.split(",") as RequisitionStatus[] } } : {};

  const reqs = await prisma.materialRequisition.findMany({
    where: { project: { companyId: company.id, deletedAt: null }, ...statusFilter, ...await scopeWhere("MaterialRequisition") },
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
  const { phaseId, neededByDate, autoSubmit, ...rest } = parsed.data;
  const company = await getCompany();
  try {
    await assertScopeAllows({ projectId: parsed.data.projectId ?? null, departmentId: null });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Scope violation" }, { status: 403 });
  }
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

    // Auto-submit by default — eliminates the useless manual "Submit for
    // Approval" step. The indent goes straight to the approval queue.
    let submitted = false;
    if (autoSubmit !== false) {
      try {
        await submitRequisition(req.id, user.id);
        submitted = true;
      } catch (err) {
        // If auto-submit fails (e.g. transition not allowed), still return
        // success — the indent was created as DRAFT and can be submitted
        // manually. Log the error for debugging.
        console.error("[requisitions] Auto-submit failed for", req.id, err);
      }
    }

    revalidatePath("/requisitions");
    revalidatePath("/m/procurement");
    return json({ ok: true, id: req.id, reqNumber: req.reqNumber, submitted }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof ServiceError) {
      return json({ error: err.message }, { status: err.status ?? 400 });
    }
    return json({ error: "Failed to create indent" }, { status: 500 });
  }
});
