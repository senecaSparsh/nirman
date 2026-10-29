import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { generateEmploymentAgreement, autoCompleteOnboarding, sendEmployeeDocLink, HrError } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, assertCanManageEmployee } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/employees/[id]/generate-agreement — generate (or regenerate)
 * the employment agreement for this employee. Sets contractStatus = ISSUED
 * and creates an EntityAttachment linking the print page to the profile.
 *
 * The agreement is a print-friendly document at:
 *   /print/employment-agreement/[id]
 *
 * Requires HR_MANAGE.
 */
export const POST = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  try {
    await assertCanManageEmployee(id, company.id);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Hierarchy violation" }, { status: 403 });
  }

  try {
    const result = await generateEmploymentAgreement(id, company.id, session.id);

    // Auto-complete onboarding if all steps are now done
    await autoCompleteOnboarding(id, company.id).catch(() => {});

    // Send the private accept link — same delivery as offer letters:
    // email when real, SMS for phone-first workers. Best-effort.
    let docSent = false;
    if (result.contractToken) {
      const emp = await prisma.employee.findFirst({
        where: { id, companyId: company.id },
        select: { name: true, email: true, phone: true },
      });
      if (emp) {
        docSent = await sendEmployeeDocLink({
          companyId: company.id,
          companyName: company.name,
          employee: emp,
          token: result.contractToken,
          kind: "agreement",
          appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        });
      }
    }

    revalidatePath(`/hr/employees/${id}`);
    revalidatePath(`/m/hr/employees/${id}`);
    revalidatePath(`/m/hr/onboarding/${id}`);
    revalidatePath("/m/hr/onboarding");

    return json({
      ok: true,
      ...result,
      docSent,
      message: docSent
        ? "Employment agreement generated and sent to the employee."
        : "Employment agreement generated. Open it to review and print.",
    });
  } catch (err: unknown) {
    if (err instanceof HrError) {
      return json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
});
