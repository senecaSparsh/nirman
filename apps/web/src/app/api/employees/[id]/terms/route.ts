import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, assertCanManageEmployee, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { logAction, autoCompleteOnboarding } from "@nirman/services";

/**
 * PATCH /api/employees/[id]/terms — HR edits custom terms & conditions
 * for the offer letter or employment agreement.
 *
 * Body: { type: "offer" | "agreement", terms: string }
 *
 * - If terms is empty/null, the custom T&Cs are cleared and the default
 *   template will be used.
 * - Requires HR_MANAGE permission.
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  try {
    await assertCanManageEmployee(id, company.id);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Hierarchy violation" }, { status: 403 });
  }

  const body = await req.json();
  const type = body.type as "offer" | "agreement";
  const terms = body.terms as string | null;

  if (!type || !["offer", "agreement"].includes(type)) {
    return json({ error: "type must be 'offer' or 'agreement'" }, { status: 400 });
  }

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: company.id, deletedAt: null, ...await scopeWhere("Employee") },
    select: { id: true },
  });
  if (!employee) return json({ error: "Employee not found" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    const updateData =
      type === "offer"
        ? { offerLetterTerms: terms?.trim() || null }
        : { contractTerms: terms?.trim() || null };

    await tx.employee.update({
      where: { id },
      data: updateData,
    });

    await logAction(tx, {
      userId: session.id,
      companyId: company.id,
      action: type === "offer" ? "OFFER_TERMS_UPDATED" : "AGREEMENT_TERMS_UPDATED",
      entityType: "Employee",
      entityId: id,
      after: { termsLength: terms?.length ?? 0 } as Record<string, unknown>,
    });
  });

  // Terms changes don't directly complete an onboarding step, but revalidate
  // all onboarding views so the UI stays in sync.
  await autoCompleteOnboarding(id, company.id).catch(() => {});
  revalidatePath(`/m/hr/employees/${id}`);
  revalidatePath(`/hr/employees/${id}`);
  revalidatePath(`/m/hr/onboarding/${id}`);
  revalidatePath(`/m/hr/onboarding`);

  return json({ ok: true });
});
