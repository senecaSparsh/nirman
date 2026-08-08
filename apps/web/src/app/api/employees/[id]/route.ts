import { NextRequest } from "next/server";
import { updateEmployee, softDelete } from "@nirman/services";
import { apiHandler, getCompany, json, employeeSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();
  const parsed = employeeSchema.partial().safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const updated = await updateEmployee({
    employeeId: id,
    companyId: company.id,
    name: parsed.data.name,
    trade: parsed.data.trade,
    phone: parsed.data.phone,
    email: parsed.data.email,
    dailyRate: parsed.data.dailyRate ?? undefined,
    wageType: parsed.data.wageType,
    monthlySalary: parsed.data.monthlySalary ?? null,
    designation: parsed.data.designation,
    joinDate: parsed.data.joinDate !== undefined ? (parsed.data.joinDate ? new Date(parsed.data.joinDate) : null) : undefined,
    crewId: parsed.data.crewId,
    activeProjectId: parsed.data.activeProjectId,
    active: parsed.data.active,
    userId: user.id,
  });
  return json({ ok: true, id: updated.id });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.HR_MANAGE);
  const { id } = await params;
  try {
    await softDelete("Employee", id);
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to delete employee") }, { status: 400 });
  }
});
