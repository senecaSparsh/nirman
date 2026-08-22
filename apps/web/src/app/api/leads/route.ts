import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@nirman/db";
import { createLead } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

const createLeadSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(20),
  email: z.string().trim().email().optional().or(z.literal("")),
  source: z.enum(["PORTAL", "WALK_IN", "REFERRAL", "BROKER", "DIGITAL_AD", "OTHER"]),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "HOT"]).default("MEDIUM"),
  projectId: z.string().optional().nullable(),
  interestedUnitId: z.string().optional().nullable(),
  interestedUnitType: z.string().trim().max(80).optional().nullable(),
  budgetMin: z.coerce.number().nonnegative().optional().nullable(),
  budgetMax: z.coerce.number().nonnegative().optional().nullable(),
  assignedToId: z.string().optional().nullable(),
  nextFollowUpAt: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
}).refine((value) => value.budgetMin == null || value.budgetMax == null || value.budgetMax >= value.budgetMin, {
  message: "Maximum budget must be greater than or equal to minimum budget",
  path: ["budgetMax"],
});

export const GET = apiHandler(async () => {
  await requirePermission(PERM.SALES_VIEW);
  const company = await getCompany();
  const leads = await prisma.lead.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: [{ nextFollowUpAt: "asc" }, { createdAt: "desc" }],
    include: {
      project: { select: { id: true, name: true } },
      interestedUnit: { select: { id: true, unitNumber: true } },
      assignedTo: { select: { id: true, name: true } },
      activities: { orderBy: { occurredAt: "desc" }, take: 1 },
      _count: { select: { activities: true } },
    },
  });
  return json(leads.map((lead) => ({
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    source: lead.source,
    stage: lead.stage,
    priority: lead.priority,
    score: lead.score,
    budgetMin: lead.budgetMin == null ? null : toNum(lead.budgetMin),
    budgetMax: lead.budgetMax == null ? null : toNum(lead.budgetMax),
    interestedUnitType: lead.interestedUnitType,
    notes: lead.notes,
    projectId: lead.projectId,
    projectName: lead.project?.name ?? null,
    interestedUnitId: lead.interestedUnitId,
    interestedUnitLabel: lead.interestedUnit ? `Unit ${lead.interestedUnit.unitNumber}` : null,
    assignedToId: lead.assignedToId,
    assignedToName: lead.assignedTo?.name ?? null,
    convertedCustomerId: lead.convertedCustomerId,
    nextFollowUpAt: lead.nextFollowUpAt?.toISOString() ?? null,
    lastContactAt: lead.lastContactAt?.toISOString() ?? null,
    lostReason: lead.lostReason,
    convertedAt: lead.convertedAt?.toISOString() ?? null,
    createdAt: lead.createdAt.toISOString(),
    activityCount: lead._count.activities,
    latestActivity: lead.activities[0] ? {
      type: lead.activities[0].type,
      note: lead.activities[0].note,
      outcome: lead.activities[0].outcome,
      occurredAt: lead.activities[0].occurredAt.toISOString(),
    } : null,
  })));
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.SALES_MANAGE);
  const company = await getCompany();
  const parsed = createLeadSchema.safeParse(await req.json());
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const lead = await createLead({
    companyId: company.id,
    name: parsed.data.name,
    phone: parsed.data.phone,
    email: parsed.data.email || undefined,
    source: parsed.data.source,
    priority: parsed.data.priority,
    projectId: parsed.data.projectId || undefined,
    interestedUnitId: parsed.data.interestedUnitId || undefined,
    interestedUnitType: parsed.data.interestedUnitType || undefined,
    budgetMin: parsed.data.budgetMin ?? undefined,
    budgetMax: parsed.data.budgetMax ?? undefined,
    assignedToId: parsed.data.assignedToId || undefined,
    nextFollowUpAt: parsed.data.nextFollowUpAt ?? undefined,
    notes: parsed.data.notes || undefined,
    userId: user.id,
  });
  revalidatePath("/sales");
  return json({ id: lead.id }, { status: 201 });
});
