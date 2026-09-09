import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, assertCanManageEmployee } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const returnSchema = z.object({
  conditionAtReturn: z.enum(["NEW", "GOOD", "FAIR", "DAMAGED", "LOST"]).optional().nullable(),
  depositRefunded: z.boolean().optional().default(false),
  notes: z.string().optional().nullable(),
});

/**
 * POST /api/employees/[id]/resources/[resourceId]/return — mark a resource as returned.
 * Requires HR_MANAGE + hierarchy check.
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string; resourceId: string }> }) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id, resourceId } = await params;

  // Hierarchy check
  try {
    await assertCanManageEmployee(id, company.id);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Hierarchy violation" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = returnSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const resource = await prisma.employeeResource.findFirst({
    where: { id: resourceId, employeeId: id, companyId: company.id, returnedAt: null },
  });
  if (!resource) return json({ error: "Resource not found or already returned" }, { status: 404 });

  const updated = await prisma.employeeResource.update({
    where: { id: resourceId },
    data: {
      returnedAt: new Date(),
      conditionAtReturn: parsed.data.conditionAtReturn || null,
      depositRefunded: parsed.data.depositRefunded,
      returnedTo: user.id,
      notes: parsed.data.notes ? `${resource.notes ?? ""}\n[Return] ${parsed.data.notes}`.trim() : resource.notes,
    },
    include: {
      issuedByUser: { select: { id: true, name: true } },
      returnedToUser: { select: { id: true, name: true } },
    },
  });

  revalidatePath(`/hr/employees/${id}`);
  revalidatePath(`/m/hr/employees/${id}`);

  return json(updated);
});
