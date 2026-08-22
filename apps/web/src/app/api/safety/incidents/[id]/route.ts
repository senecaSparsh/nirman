import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { getIncident, updateIncident, investigateIncident, closeIncident, cancelIncident, deleteIncident } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  type: z.enum(["ACCIDENT", "NEAR_MISS", "INJURY", "FATALITY", "PROPERTY_DAMAGE", "ENVIRONMENTAL", "FIRE", "STRUCTURAL", "OTHER"]).optional(),
  severity: z.enum(["FIRST_AID", "LOST_TIME", "SERIOUS", "FATAL", "PROPERTY_ONLY"]).optional(),
  incidentDate: z.string().optional(),
  incidentTime: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  wbsNodeId: z.string().optional().nullable(),
  peopleInvolved: z.string().optional().nullable(),
  injuredCount: z.coerce.number().optional(),
  fatalities: z.coerce.number().optional(),
  propertyDamageEstimate: z.coerce.number().optional().nullable(),
  attachments: z.array(z.string()).optional(),
});

const actionSchema = z.object({
  action: z.enum(["investigate", "close", "cancel", "delete"]),
  rootCause: z.string().optional(),
  correctiveActions: z.string().optional(),
  closureNotes: z.string().optional(),
});

export const GET = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const { id } = await ctx.params;
  const incident = await getIncident(id);
  if (!incident) return json({ error: "Incident not found" }, { status: 404 });
  return json(incident);
});

export const PATCH = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.WO_MANAGE);
  const company = await getCompany();
  const { id } = await ctx.params;
  const body = await req.json();

  const existing = await prisma.safetyIncident.findUnique({ where: { id }, select: { companyId: true } });
  if (!existing) return json({ error: "Incident not found" }, { status: 404 });
  if (existing.companyId !== company.id) return json({ error: "Incident does not belong to your company" }, { status: 403 });

  if (body.action && typeof body.action === "string") {
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid action" }, { status: 400 });
    try {
      switch (parsed.data.action) {
        case "investigate":
          if (!parsed.data.rootCause || !parsed.data.correctiveActions) return json({ error: "rootCause and correctiveActions required" }, { status: 400 });
          return json(await investigateIncident(id, { rootCause: parsed.data.rootCause, correctiveActions: parsed.data.correctiveActions, userId: user.id }));
        case "close":
          if (!parsed.data.closureNotes) return json({ error: "closureNotes required" }, { status: 400 });
          return json(await closeIncident(id, user.id, parsed.data.closureNotes));
        case "cancel":
          return json(await cancelIncident(id, user.id));
        case "delete":
          await deleteIncident(id, user.id);
          return json({ ok: true });
      }
    } catch (err: unknown) {
      return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
    }
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  try {
    return json(await updateIncident(id, {
      ...parsed.data,
      incidentDate: parsed.data.incidentDate ? new Date(parsed.data.incidentDate) : undefined,
    }));
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});

export const DELETE = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.WO_MANAGE);
  const company = await getCompany();
  const { id } = await ctx.params;
  const existing = await prisma.safetyIncident.findUnique({ where: { id }, select: { companyId: true } });
  if (!existing) return json({ error: "Incident not found" }, { status: 404 });
  if (existing.companyId !== company.id) return json({ error: "Incident does not belong to your company" }, { status: 403 });
  try {
    await deleteIncident(id, user.id);
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
