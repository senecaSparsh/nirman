import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { linkEmployeeToUser, HrError } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/employees/[id]/link-account — link an existing User account to
 * this Employee. Use when a User already exists (e.g. created via Settings)
 * and needs to be connected to the Employee record.
 *
 * Body: { userId: string }
 *
 * Requires HR_MANAGE.
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  const body = await req.json();
  const { userId } = body as { userId?: string };

  if (!userId?.trim()) {
    return json({ error: "userId is required." }, { status: 400 });
  }

  // Verify the user is a member of this company
  const membership = await prisma.userCompany.findFirst({
    where: { userId, companyId: company.id },
    include: { user: { select: { id: true, name: true, active: true } } },
  });
  if (!membership) {
    return json({ error: "This user is not a member of this company." }, { status: 400 });
  }
  if (!membership.user.active) {
    return json({ error: "This user account is deactivated." }, { status: 400 });
  }

  try {
    const result = await linkEmployeeToUser({
      employeeId: id,
      companyId: company.id,
      actorUserId: session.id,
      userId,
    });

    revalidatePath(`/hr/employees/${id}`);
    revalidatePath(`/m/hr/employees/${id}`);
    revalidatePath("/hr/employees");
    revalidatePath("/m/hr/employees");

    return json({
      ok: true,
      ...result,
      message: `Linked to existing account: ${membership.user.name}.`,
    });
  } catch (err: unknown) {
    if (err instanceof HrError) {
      return json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
});
