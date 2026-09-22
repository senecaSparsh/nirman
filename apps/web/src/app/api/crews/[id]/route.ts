import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { updateCrew, deleteCrew, ServiceError } from "@nirman/services";
import { apiHandler, getCompany, json, crewSchema, requirePermission, toNum, scopeWhere, assertScopeAllows, getEmployeeAccessScope } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.HR_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const crew = await prisma.crew.findFirst({
    where: { id, companyId: company.id, ...await scopeWhere("Crew") },
    include: {
      project: { select: { id: true, name: true } },
      supervisor: { select: { id: true, name: true } },
      members: {
        where: { deletedAt: null },
        select: { id: true, name: true, trade: true, dailyRate: true, wageType: true, active: true },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!crew) return json({ error: "Crew not found" }, { status: 404 });
  // Member rates are comp data — roster-tier viewers get crew + names
  // without wages (payroll.manage|hr.manage only).
  const { canSeePayroll } = await getEmployeeAccessScope();
  return json({
    ...crew,
    members: crew.members.map((m) => ({ ...m, dailyRate: canSeePayroll ? toNum(m.dailyRate) : null })),
  });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();
  const parsed = crewSchema.partial().safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // Scoped viewers may only touch crews inside their scope — the NEW
  // projectId is checked below, the EXISTING crew's placement here.
  const inScope = await prisma.crew.findFirst({
    where: { id, companyId: company.id, ...await scopeWhere("Crew") },
    select: { id: true },
  });
  if (!inScope) return json({ error: "Crew not found" }, { status: 404 });
  try {
    await assertScopeAllows({ projectId: parsed.data.projectId ?? null, departmentId: null });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Scope violation" }, { status: 403 });
  }
  // Members must be employees the viewer can see — otherwise a scoped
  // manager could pull out-of-scope workers into their crew.
  if (parsed.data.memberIds?.length) {
    const visible = await prisma.employee.count({
      where: { id: { in: parsed.data.memberIds }, companyId: company.id, deletedAt: null, ...await scopeWhere("Employee") },
    });
    if (visible !== parsed.data.memberIds.length) {
      return json({ error: "One or more employees are not found or out of scope" }, { status: 400 });
    }
  }
  const crew = await updateCrew({
    crewId: id,
    companyId: company.id,
    name: parsed.data.name,
    projectId: parsed.data.projectId,
    supervisorId: parsed.data.supervisorId,
    memberIds: parsed.data.memberIds,
    active: parsed.data.active,
    userId: user.id,
  });
  revalidatePath("/hr/employees");
  revalidatePath("/m/hr/employees");
    revalidatePath("/m/hr/employees");
  return json({ ok: true, id: crew.id });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  // Same scope wall as PATCH — an out-of-scope crew is invisible.
  const inScope = await prisma.crew.findFirst({
    where: { id, companyId: company.id, ...await scopeWhere("Crew") },
    select: { id: true },
  });
  if (!inScope) return json({ error: "Crew not found" }, { status: 404 });
  try {
    await deleteCrew(id, company.id, user.id);
    revalidatePath("/hr/employees");
    revalidatePath("/m/hr/employees");
    revalidatePath("/m/hr/employees");
    return json({ ok: true });
  } catch (err: unknown) {
    revalidatePath("/hr/employees");
    revalidatePath("/m/hr/employees");
    revalidatePath("/m/hr/employees");
    return json({ error: (err instanceof ServiceError ? err.message : "Failed to delete crew") }, { status: err instanceof ServiceError ? err.status : 400 });
  }
});
