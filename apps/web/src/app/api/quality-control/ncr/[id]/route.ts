import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { getNcr, updateNcr, reviewNcr, closeNcr, cancelNcr, deleteNcr } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  category: z.enum(["MATERIAL", "WORKMANSHIP", "DESIGN", "DOCUMENT", "PROCESS", "SAFETY", "OTHER"]).optional(),
  severity: z.enum(["CRITICAL", "MAJOR", "MINOR", "OBSERVATION"]).optional(),
  location: z.string().optional().nullable(),
  wbsNodeId: z.string().optional().nullable(),
  boqItemId: z.string().optional().nullable(),
  responsibleParty: z.string().optional().nullable(),
  subcontractorId: z.string().optional().nullable(),
  attachments: z.array(z.string()).optional(),
});

const actionSchema = z.object({
  action: z.enum(["review", "close", "cancel", "delete"]),
  reviewNotes: z.string().optional(),
  outcome: z.enum(["CAPA_REQUIRED", "ACCEPTED", "REJECTED"]).optional(),
  closureNotes: z.string().optional(),
});

// GET /api/quality-control/ncr/[id]
export const GET = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const { id } = await ctx.params;
  const ncr = await getNcr(id);
  if (!ncr) return json({ error: "NCR not found" }, { status: 404 });
  return json(ncr);
});

// PATCH /api/quality-control/ncr/[id]
export const PATCH = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.WO_MANAGE);
  const company = await getCompany();
  const { id } = await ctx.params;
  const body = await req.json();

  const existing = await prisma.nonConformanceReport.findUnique({ where: { id }, select: { companyId: true } });
  if (!existing) return json({ error: "NCR not found" }, { status: 404 });
  if (existing.companyId !== company.id) return json({ error: "NCR does not belong to your company" }, { status: 403 });

  // Workflow action
  if (body.action && typeof body.action === "string") {
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid action" }, { status: 400 });
    try {
      switch (parsed.data.action) {
        case "review":
          if (!parsed.data.outcome || !parsed.data.reviewNotes) return json({ error: "outcome and reviewNotes required" }, { status: 400 });
          return json(await reviewNcr(id, { outcome: parsed.data.outcome, reviewNotes: parsed.data.reviewNotes, userId: user.id }));
        case "close":
          if (!parsed.data.closureNotes) return json({ error: "closureNotes required" }, { status: 400 });
          return json(await closeNcr(id, user.id, parsed.data.closureNotes));
        case "cancel":
          return json(await cancelNcr(id, user.id));
        case "delete":
          await deleteNcr(id, user.id);
          return json({ ok: true });
      }
    } catch (err: unknown) {
      return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
    }
  }

  // Regular update
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  try {
    return json(await updateNcr(id, {
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      severity: parsed.data.severity,
      location: parsed.data.location,
      wbsNodeId: parsed.data.wbsNodeId,
      boqItemId: parsed.data.boqItemId,
      responsibleParty: parsed.data.responsibleParty,
      subcontractorId: parsed.data.subcontractorId,
      attachments: parsed.data.attachments,
    }));
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});

// DELETE /api/quality-control/ncr/[id]
export const DELETE = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.WO_MANAGE);
  const company = await getCompany();
  const { id } = await ctx.params;
  const existing = await prisma.nonConformanceReport.findUnique({ where: { id }, select: { companyId: true } });
  if (!existing) return json({ error: "NCR not found" }, { status: 404 });
  if (existing.companyId !== company.id) return json({ error: "NCR does not belong to your company" }, { status: 403 });
  try {
    await deleteNcr(id, user.id);
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
