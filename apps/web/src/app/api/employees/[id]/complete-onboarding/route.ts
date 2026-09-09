import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/employees/[id]/complete-onboarding
 *
 * Marks the employee's onboarding as complete. Requires HR_MANAGE.
 * Also sets documentsSubmitted=true and backgroundVerified=true if
 * they are null (the manager is confirming these are done).
 */
export const POST = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    select: { id: true, name: true, documentsSubmitted: true, backgroundVerified: true },
  });

  if (!employee) {
    return json({ error: "Employee not found" }, { status: 404 });
  }

  const updated = await prisma.employee.update({
    where: { id },
    data: {
      onboardingComplete: true,
      // Mark dossier flags as complete if not already set
      documentsSubmitted: employee.documentsSubmitted ?? true,
      backgroundVerified: employee.backgroundVerified ?? true,
    },
    select: { id: true, onboardingComplete: true },
  });

  await logAction(prisma, {
    userId: session.id,
    companyId: company.id,
    action: "EMPLOYEE_ONBOARDING_COMPLETE",
    entityType: "Employee",
    entityId: id,
    after: { onboardingComplete: true },
  });

  revalidatePath(`/m/hr/employees/${id}`);
  revalidatePath(`/m/hr/employees`);
  revalidatePath(`/m/hr/onboarding/${id}`);
  revalidatePath(`/hr/employees`);
  revalidatePath(`/hr/employees/${id}`);

  return json({ ok: true, message: `Onboarding complete for ${employee.name}`, employee: updated });
});
