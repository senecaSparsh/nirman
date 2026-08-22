import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { getInspection, updateInspection, startInspection, completeInspection, cancelInspection, deleteInspection } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  scheduledDate: z.string().optional(),
  inspectorName: z.string().optional().nullable(),
  findings: z.string().optional(),
  complianceNotes: z.string().optional(),
  followUpActions: z.string().optional(),
  attachments: z.array(z.string()).optional(),
});

const actionSchema = z.object({
  action: z.enum(["start", "complete", "cancel", "delete"]),
  result: z.enum(["PASSED", "PASSED_WITH_NOTES", "FAILED", "STOP_WORK"]).optional(),
  findings: z.string().optional(),
  complianceNotes: z.string().optional(),
  followUpActions: z.string().optional(),
});

export const GET = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const { id } = await ctx.params;
  const insp = await getInspection(id);
  if (!insp) return json({ error: "Inspection not found" }, { status: 404 });
  return json(insp);
});

export const PATCH = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.WO_MANAGE);
  const company = await getCompany();
  const { id } = await ctx.params;
  const body = await req.json();

  const existing = await prisma.safetyInspection.findUnique({ where: { id }, select: { companyId: true } });
  if (!existing) return json({ error: "Inspection not found" }, { status: 404 });
  if (existing.companyId !== company.id) return json({ error: "Inspection does not belong to your company" }, { status: 403 });

  if (body.action && typeof body.action === "string") {
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid action" }, { status: 400 });
    try {
      switch (parsed.data.action) {
        case "start":
          return json(await startInspection(id, user.id));
        case "complete":
          if (!parsed.data.result || !parsed.data.findings) return json({ error: "result and findings required" }, { status: 400 });
          return json(await completeInspection(id, user.id, parsed.data.result, parsed.data.findings, parsed.data.complianceNotes, parsed.data.followUpActions));
        case "cancel":
          return json(await cancelInspection(id, user.id));
        case "delete":
          await deleteInspection(id, user.id);
          return json({ ok: true });
      }
    } catch (err: unknown) {
      return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
    }
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  try {
    return json(await updateInspection(id, {
      ...parsed.data,
      scheduledDate: parsed.data.scheduledDate ? new Date(parsed.data.scheduledDate) : undefined,
    }));
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});

export const DELETE = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.WO_MANAGE);
  const company = await getCompany();
  const { id } = await ctx.params;
  const existing = await prisma.safetyInspection.findUnique({ where: { id }, select: { companyId: true } });
  if (!existing) return json({ error: "Inspection not found" }, { status: 404 });
  if (existing.companyId !== company.id) return json({ error: "Inspection does not belong to your company" }, { status: 403 });
  try {
    await deleteInspection(id, user.id);
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
