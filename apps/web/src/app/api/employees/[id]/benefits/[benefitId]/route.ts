import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { updateEmployeeBenefit, deleteEmployeeBenefit } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/** PATCH /api/employees/[id]/benefits/[benefitId] — update a benefit */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string; benefitId: string }> }) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id, benefitId } = await params;
  const body = await req.json();

  // Verify the benefit belongs to an employee in this company
  const benefit = await prisma.employeeBenefit.findFirst({
    where: { id: benefitId, employee: { companyId: company.id, id } },
  });
  if (!benefit) return json({ error: "Benefit not found" }, { status: 404 });

  const updated = await updateEmployeeBenefit(benefitId, company.id, user.id, {
    type: body.type,
    amount: body.amount,
    frequency: body.frequency,
    startDate: body.startDate,
    endDate: body.endDate,
    notes: body.notes,
    active: body.active,
  });

  revalidatePath(`/hr/employees/${id}`);
  revalidatePath(`/m/hr/employees/${id}`);
  return json(updated);
});

/** DELETE /api/employees/[id]/benefits/[benefitId] — remove a benefit */
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string; benefitId: string }> }) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id, benefitId } = await params;

  const benefit = await prisma.employeeBenefit.findFirst({
    where: { id: benefitId, employee: { companyId: company.id, id } },
  });
  if (!benefit) return json({ error: "Benefit not found" }, { status: 404 });

  await deleteEmployeeBenefit(benefitId, company.id, user.id);

  revalidatePath(`/hr/employees/${id}`);
  revalidatePath(`/m/hr/employees/${id}`);
  return json({ ok: true });
});
