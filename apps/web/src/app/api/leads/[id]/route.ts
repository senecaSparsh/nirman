import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@nirman/db";
import { convertLeadToCustomer, deleteLead, updateLeadStage } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

const stageSchema = z.object({
  stage: z.enum(["NEW", "CONTACTED", "SITE_VISIT", "NEGOTIATION", "LOST"]),
  lostReason: z.string().trim().max(500).optional(),
  nextFollowUpAt: z.coerce.date().optional().nullable(),
});

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.SALES_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const lead = await prisma.lead.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    include: {
      project: { select: { id: true, name: true } },
      interestedUnit: { select: { id: true, unitNumber: true, unitType: true } },
      assignedTo: { select: { id: true, name: true } },
      convertedCustomer: { select: { id: true, name: true } },
      activities: { orderBy: { occurredAt: "desc" }, include: { createdBy: { select: { id: true, name: true } } } },
    },
  });
  if (!lead) return json({ error: "Lead not found" }, { status: 404 });
  return json({
    ...lead,
    budgetMin: lead.budgetMin == null ? null : toNum(lead.budgetMin),
    budgetMax: lead.budgetMax == null ? null : toNum(lead.budgetMax),
    projectName: lead.project?.name ?? null,
    interestedUnitLabel: lead.interestedUnit ? `Unit ${lead.interestedUnit.unitNumber}` : null,
    assignedToName: lead.assignedTo?.name ?? null,
    activityCount: lead.activities.length,
    latestActivity: lead.activities[0] ? {
      type: lead.activities[0].type,
      note: lead.activities[0].note,
      outcome: lead.activities[0].outcome,
      occurredAt: lead.activities[0].occurredAt.toISOString(),
    } : null,
    nextFollowUpAt: lead.nextFollowUpAt?.toISOString() ?? null,
    lastContactAt: lead.lastContactAt?.toISOString() ?? null,
    convertedAt: lead.convertedAt?.toISOString() ?? null,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
    activities: lead.activities.map((activity) => ({
      id: activity.id,
      type: activity.type,
      note: activity.note,
      outcome: activity.outcome,
      occurredAt: activity.occurredAt.toISOString(),
      nextFollowUpAt: activity.nextFollowUpAt?.toISOString() ?? null,
      createdByName: activity.createdBy?.name ?? null,
    })),
  });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALES_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const parsed = stageSchema.safeParse(await req.json());
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const lead = await updateLeadStage({
    leadId: id,
    companyId: company.id,
    stage: parsed.data.stage,
    lostReason: parsed.data.lostReason,
    nextFollowUpAt: parsed.data.nextFollowUpAt ?? undefined,
    userId: user.id,
  });
  revalidatePath("/sales");
  return json({ id: lead.id, stage: lead.stage });
});

export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALES_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();
  if (body?.action !== "convert") return json({ error: "Invalid action. Use convert." }, { status: 400 });
  const result = await convertLeadToCustomer({ leadId: id, companyId: company.id, userId: user.id });
  revalidatePath("/sales");
  return json({ leadId: result.lead.id, customerId: result.customer.id, customerName: result.customer.name });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALES_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  await deleteLead({ leadId: id, companyId: company.id, userId: user.id });
  revalidatePath("/sales");
  return json({ id });
});
