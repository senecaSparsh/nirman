import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { autoCompleteOnboarding } from "@nirman/services";
import { apiHandler, json, assertCanManageEmployee } from "@/lib/server";

/**
 * POST /api/employees/[id]/accept-agreement — public endpoint for employee
 * to accept their employment agreement via a shareable link.
 *
 * Body: { token: string }
 *
 * - Looks up the employee by id + contractToken.
 * - If the token matches and the agreement is ISSUED, marks it CONFIRMED
 *   and records the confirmation timestamp.
 * - No auth required — the token IS the auth.
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await req.json();
  const token = body.token as string;

  if (!token) return json({ error: "Token is required" }, { status: 400 });

  const employee = await prisma.employee.findFirst({
    where: { id, deletedAt: null, contractToken: token },
    select: { id: true, contractStatus: true, name: true, companyId: true },
  });

  if (!employee) return json({ error: "Invalid or expired link" }, { status: 404 });

  if (employee.contractStatus === "CONFIRMED") {
    return json({ ok: true, message: "Agreement already accepted", alreadyAccepted: true });
  }

  if (!employee.contractStatus || employee.contractStatus === "DRAFT") {
    return json({ error: "Agreement has not been issued yet" }, { status: 400 });
  }

  try {
    await assertCanManageEmployee(id, employee.companyId);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Hierarchy violation" }, { status: 403 });
  }

  await prisma.employee.update({
    where: { id },
    data: {
      contractStatus: "CONFIRMED",
      contractConfirmedAt: new Date(),
    },
  });

  // Auto-complete onboarding if all steps are now done
  await autoCompleteOnboarding(id, employee.companyId).catch(() => {});

  revalidatePath(`/m/hr/employees/${id}`);
  revalidatePath(`/hr/employees/${id}`);
    revalidatePath(`/m/hr/onboarding/${id}`);
    revalidatePath("/m/hr/onboarding");

  return json({ ok: true, message: "Agreement accepted successfully" });
});
