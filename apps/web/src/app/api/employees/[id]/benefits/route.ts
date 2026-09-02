import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { createEmployeeBenefit } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/** GET /api/employees/[id]/benefits — list all benefits for an employee */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.HR_VIEW);
  const company = await getCompany();
  const { id } = await params;

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    select: { id: true },
  });
  if (!employee) return json({ error: "Employee not found" }, { status: 404 });

  const benefits = await prisma.employeeBenefit.findMany({
    where: { employeeId: id },
    orderBy: { createdAt: "desc" },
  });
  return json(benefits);
});

/** POST /api/employees/[id]/benefits — add a benefit to an employee */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    select: { id: true },
  });
  if (!employee) return json({ error: "Employee not found" }, { status: 404 });

  if (!body?.type) {
    return json({ error: "type is required" }, { status: 400 });
  }

  const benefit = await createEmployeeBenefit(
    {
      employeeId: id,
      type: body.type,
      amount: body.amount ?? null,
      frequency: body.frequency ?? "MONTHLY",
      startDate: body.startDate ?? null,
      endDate: body.endDate ?? null,
      notes: body.notes ?? null,
    },
    company.id,
    user.id,
  );

  revalidatePath(`/hr/employees/${id}`);
  revalidatePath(`/m/hr/employees/${id}`);
  return json(benefit, { status: 201 });
});
