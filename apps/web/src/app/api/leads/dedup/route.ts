import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { withSerializableTransaction } from "@nirman/services";

/**
 * GET /api/leads/dedup — find duplicate leads (same name + phone) in the
 * current company. Returns groups of duplicates so the UI can show them
 * for review before merging.
 *
 * The owner's ask: "जो नाम नंबर दोनों डुप्लीकेट है वो हटा दे" — remove leads
 * where both name AND phone are duplicate.
 */
export const GET = apiHandler(async () => {
  await requirePermission(PERM.SALES_VIEW);
  const company = await getCompany();

  // Find all non-deleted leads, group by (name, phone)
  const leads = await prisma.lead.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: {
      id: true,
      name: true,
      phone: true,
      stage: true,
      priority: true,
      source: true,
      createdAt: true,
      lastContactAt: true,
      nextFollowUpAt: true,
      assignedTo: { select: { name: true } },
      _count: { select: { activities: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Group by normalized (name + phone)
  const groups = new Map<string, typeof leads>();
  for (const lead of leads) {
    const key = `${lead.name.trim().toLowerCase()}|${lead.phone.trim()}`;
    const arr = groups.get(key) ?? [];
    arr.push(lead);
    groups.set(key, arr);
  }

  // Only return groups with > 1 lead (duplicates)
  const duplicates = Array.from(groups.entries())
    .filter(([, arr]) => arr.length > 1)
    .map(([key, arr]) => ({
      key,
      leads: arr.map((l) => ({
        id: l.id,
        name: l.name,
        phone: l.phone,
        stage: l.stage,
        priority: l.priority,
        source: l.source,
        createdAt: l.createdAt.toISOString(),
        lastContactAt: l.lastContactAt?.toISOString() ?? null,
        nextFollowUpAt: l.nextFollowUpAt?.toISOString() ?? null,
        assignedToName: l.assignedTo?.name ?? null,
        activityCount: l._count.activities,
      })),
    }));

  return json({ duplicates, totalDuplicateLeads: duplicates.reduce((sum, g) => sum + g.leads.length, 0) });
});

/**
 * POST /api/leads/dedup — merge a group of duplicate leads into one.
 * Keeps the oldest lead (most activity), soft-deletes the rest, and
 * moves all activities from the deleted leads to the kept lead.
 *
 * Body: { keepId: string, deleteIds: string[] }
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const _user = await requirePermission(PERM.SALES_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const keepId: string = body.keepId;
  const deleteIds: string[] = body.deleteIds ?? [];

  if (!keepId || deleteIds.length === 0) {
    return json({ error: "keepId and deleteIds are required" }, { status: 400 });
  }

  // Verify all leads belong to this company
  const allIds = [keepId, ...deleteIds];
  const leads = await prisma.lead.findMany({
    where: { id: { in: allIds }, companyId: company.id, deletedAt: null },
    select: { id: true, activities: { select: { id: true } } },
  });

  if (leads.length !== allIds.length) {
    return json({ error: "Some leads not found" }, { status: 404 });
  }

  const keepLead = leads.find((l) => l.id === keepId);
  if (!keepLead) return json({ error: "Lead to keep not found" }, { status: 404 });

  await withSerializableTransaction(async (tx) => {
    // Move all activities from duplicate leads to the kept lead
    for (const deleteId of deleteIds) {
      const dupLead = leads.find((l) => l.id === deleteId);
      if (!dupLead) continue;

      // Re-parent activities to the kept lead
      await tx.leadActivity.updateMany({
        where: { leadId: deleteId },
        data: { leadId: keepId },
      });

      // Soft-delete the duplicate
      await tx.lead.update({
        where: { id: deleteId },
        data: { deletedAt: new Date() },
      });
    }
  });

  revalidatePath("/sales");
  revalidatePath("/m/customers");
  return json({ keptId: keepId, deletedCount: deleteIds.length });
});
