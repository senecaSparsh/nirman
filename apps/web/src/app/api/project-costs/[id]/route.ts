import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { deleteProjectCost } from "@nirman/services";
import { apiHandler, json, toNum, projectCostSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const { id } = await params;
  const cost = await prisma.projectCost.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true } },
      subcontractor: { select: { id: true, name: true } },
    },
  });
  if (!cost) return json({ error: "Project cost not found" }, { status: 404 });
  return json({
    id: cost.id,
    projectId: cost.projectId,
    projectName: cost.project.name,
    costType: cost.costType,
    amount: toNum(cost.amount),
    date: cost.date,
    vendor: cost.vendor,
    subcontractorId: cost.subcontractorId,
    subcontractorName: cost.subcontractor?.name ?? null,
    notes: cost.notes,
    receiptUrl: cost.receiptUrl,
  });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.FINANCE_MANAGE);
  const { id } = await params;
  const body = await req.json();
  const parsed = projectCostSchema.partial().safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const data: Record<string, unknown> = {};
  if (parsed.data.projectId !== undefined) data.projectId = parsed.data.projectId;
  if (parsed.data.costType !== undefined) data.costType = parsed.data.costType;
  if (parsed.data.amount !== undefined) data.amount = parsed.data.amount;
  if (parsed.data.date !== undefined) data.date = parsed.data.date ? new Date(parsed.data.date) : null;
  if (parsed.data.vendor !== undefined) data.vendor = parsed.data.vendor;
  if (parsed.data.subcontractorId !== undefined) data.subcontractorId = parsed.data.subcontractorId || null;
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;
  if (parsed.data.receiptUrl !== undefined) data.receiptUrl = parsed.data.receiptUrl;
  // Validate project exists if changing
  if (data.projectId) {
    const project = await prisma.project.findFirst({ where: { id: data.projectId as string, deletedAt: null } });
    if (!project) return json({ error: "Project not found or deleted" }, { status: 400 });
  }
  const updated = await prisma.projectCost.update({ where: { id }, data });
  return json({ ok: true, id: updated.id });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.FINANCE_MANAGE);
  const { id } = await params;
  try {
    await deleteProjectCost(id);
    return json({ ok: true });
  } catch (err: any) {
    return json({ error: err?.message ?? "Failed to delete cost" }, { status: 400 });
  }
});
