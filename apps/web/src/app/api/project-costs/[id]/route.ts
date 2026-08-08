import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { deleteProjectCost, reverseJournalEntry, postProjectCost, reallocateProjectCosts, logAction } from "@nirman/services";
import { apiHandler, getCompany, json, toNum, projectCostSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const cost = await prisma.projectCost.findFirst({
    where: { id, project: { companyId: company.id } },
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
    date: cost.date.toISOString(),
    vendor: cost.vendor,
    subcontractorId: cost.subcontractorId,
    subcontractorName: cost.subcontractor?.name ?? null,
    notes: cost.notes,
    receiptUrl: cost.receiptUrl,
  });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();
  const parsed = projectCostSchema.partial().safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.projectCost.findFirst({
      where: { id, project: { companyId: company.id } },
    });
    if (!existing) throw new Error("Project cost not found in this company");

    const data: Record<string, unknown> = {};
    if (parsed.data.projectId !== undefined) data.projectId = parsed.data.projectId;
    if (parsed.data.costType !== undefined) data.costType = parsed.data.costType;
    if (parsed.data.amount !== undefined) data.amount = parsed.data.amount;
    if (parsed.data.date !== undefined) data.date = parsed.data.date ? new Date(parsed.data.date) : null;
    if (parsed.data.vendor !== undefined) data.vendor = parsed.data.vendor;
    if (parsed.data.subcontractorId !== undefined) data.subcontractorId = parsed.data.subcontractorId || null;
    if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;
    if (parsed.data.receiptUrl !== undefined) data.receiptUrl = parsed.data.receiptUrl;

    // If the amount changed, reverse the old GL entry and post a new one
    if (parsed.data.amount !== undefined && parsed.data.amount !== toNum(existing.amount)) {
      const glEntry = await tx.journalEntry.findFirst({
        where: { sourceType: "PROJECT_COST", sourceId: id },
      });
      if (glEntry) {
        await reverseJournalEntry(tx, glEntry.id, {
          postedById: user.id,
          memo: "Reversal: project cost amount updated",
        });
      }
      await postProjectCost(tx, {
        companyId: company.id,
        projectCostId: id,
        projectId: existing.projectId,
        amount: parsed.data.amount,
        postedById: user.id,
      });
    }

    const cost = await tx.projectCost.update({ where: { id }, data });

    // Reallocate project costs since the amount may have changed
    if (parsed.data.amount !== undefined) {
      await reallocateProjectCosts(tx, existing.projectId);
    }

    await logAction(tx, {
      userId: user.id,
      action: "PROJECT_COST_UPDATE",
      entityType: "ProjectCost",
      entityId: id,
      before: { amount: toNum(existing.amount), costType: existing.costType },
      after: { amount: toNum(cost.amount), costType: cost.costType },
    });
    return cost;
  });
  return json({ ok: true, id: updated.id });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.FINANCE_MANAGE);
  const { id } = await params;
  try {
    await deleteProjectCost(id, user.id);
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to delete cost") }, { status: 400 });
  }
});
