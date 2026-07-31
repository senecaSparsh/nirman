import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { addProjectCost, deleteProjectCost } from "@nirman/services";
import { apiHandler, getCompany, json, toNum, projectCostSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const costType = searchParams.get("costType");

  const costs = await prisma.projectCost.findMany({
    where: {
      project: { companyId: company.id },
      ...(projectId ? { projectId } : {}),
      ...(costType ? { costType: costType as any } : {}),
    },
    orderBy: { date: "desc" },
    include: {
      project: { select: { id: true, name: true } },
      subcontractor: { select: { id: true, name: true } },
    },
  });

  return json(
    costs.map((c) => ({
      id: c.id,
      projectId: c.projectId,
      projectName: c.project.name,
      costType: c.costType,
      amount: toNum(c.amount),
      date: c.date,
      vendor: c.vendor,
      subcontractorId: c.subcontractorId,
      subcontractorName: c.subcontractor?.name ?? null,
      notes: c.notes,
      receiptUrl: c.receiptUrl,
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_MANAGE);
  const body = await req.json();
  const parsed = projectCostSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const cost = await addProjectCost({
      projectId: parsed.data.projectId,
      costType: parsed.data.costType,
      amount: parsed.data.amount,
      date: parsed.data.date ? new Date(parsed.data.date) : undefined,
      vendor: parsed.data.vendor ?? undefined,
      notes: parsed.data.notes ?? undefined,
      receiptUrl: parsed.data.receiptUrl ?? undefined,
      ...(body?.subcontractorId ? { subcontractorId: body.subcontractorId } : {}),
    } as any);
    return json({ ok: true, id: cost.id }, { status: 201 });
  } catch (err: any) {
    return json({ error: err?.message ?? "Failed to add cost" }, { status: 400 });
  }
});

export const DELETE = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_MANAGE);
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return json({ error: "id query param is required" }, { status: 400 });
  try {
    await deleteProjectCost(id);
    return json({ ok: true });
  } catch (err: any) {
    return json({ error: err?.message ?? "Failed to delete cost" }, { status: 400 });
  }
});
