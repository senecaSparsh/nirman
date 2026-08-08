import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { startRenovation, completeRenovation, cancelRenovation, logAction } from "@nirman/services";
import { apiHandler, getCompany, json, renovationSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const renovation = await prisma.renovationProject.findFirst({
    where: { id, companyId: company.id },
    include: {
      builtUnit: { select: { id: true, unitNumber: true, unitType: true, currentValuation: true, productionCost: true } },
      landParcel: { select: { id: true, number: true, currentValuation: true, acquisitionCost: true } },
      project: { select: { id: true, name: true } },
      costs: { orderBy: { createdAt: "desc" }, include: { createdBy: { select: { name: true } } } },
    },
  });
  if (!renovation) return json({ error: "Renovation not found" }, { status: 404 });
  return json(renovation);
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();
  const parsed = renovationSchema.partial().safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // Only allow editing the soft fields; projectId/type/asset links are set at creation.
  const allowed = {
    title: parsed.data.title,
    description: parsed.data.description,
    budget: parsed.data.budget,
    startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : undefined,
  };
  // Strip undefined keys so we don't null out fields unintentionally
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(allowed)) {
    if (v !== undefined) data[k] = v;
  }

  const existing = await prisma.renovationProject.findFirst({ where: { id, companyId: company.id } });
  if (!existing) return json({ error: "Renovation not found" }, { status: 404 });
  if (existing.status !== "PLANNED") {
    return json({ error: "Renovation can only be edited while in PLANNED status" }, { status: 400 });
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const r = await tx.renovationProject.update({ where: { id }, data });
      await logAction(tx, {
        userId: user.id,
        action: "RENOVATION_UPDATE",
        entityType: "RenovationProject",
        entityId: id,
        before: {
          title: existing.title,
          description: existing.description,
          budget: existing.budget.toString(),
          startDate: existing.startDate?.toISOString() ?? null,
        },
        after: {
          title: r.title,
          description: r.description,
          budget: r.budget.toString(),
          startDate: r.startDate?.toISOString() ?? null,
        },
      });
      return r;
    });
    return json({ ok: true, id: updated.id, title: updated.title });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update renovation";
    return json({ error: message }, { status: 400 });
  }
});

export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const { id } = await params;
  const body = await req.json();
  const action = body?.action;

  try {
    if (action === "start") {
      const r = await startRenovation(id, user.id);
      return json({ ok: true, id: r.id, status: r.status });
    } else if (action === "complete") {
      const { renovation, roi } = await completeRenovation(id, {
        newValuation: body.newValuation ?? undefined,
        userId: user.id,
      });
      return json({ ok: true, id: renovation.id, status: renovation.status, roi: roi.toFixed(2) });
    } else if (action === "cancel") {
      const r = await cancelRenovation(id, user.id);
      return json({ ok: true, id: r.id, status: r.status });
    }
    return json({ error: "Unknown action. Use 'start', 'complete', or 'cancel'." }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update renovation";
    return json({ error: message }, { status: 400 });
  }
});
