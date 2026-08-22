import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { createEmployee } from "@nirman/services";
import { apiHandler, getCompany, json, employeeSchema, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.HR_VIEW);
  const company = await getCompany();
  const url = new URL(req.url);
  const crewId = url.searchParams.get("crewId");
  const activeOnly = url.searchParams.get("active") === "true";

  const employees = await prisma.employee.findMany({
    take: 200,
    where: {
      companyId: company.id,
      deletedAt: null,
      ...(activeOnly ? { active: true } : {}),
      ...(crewId ? { crewId } : {}),
    },
    orderBy: { name: "asc" },
    include: {
      crew: { select: { id: true, name: true } },
      activeProject: { select: { id: true, name: true } },
      _count: { select: { attendances: true, payrollLines: true } },
    },
  });
  return json(
    employees.map((e) => ({
      id: e.id,
      name: e.name,
      trade: e.trade,
      phone: e.phone,
      email: e.email,
      dailyRate: toNum(e.dailyRate),
      wageType: e.wageType,
      monthlySalary: e.monthlySalary ? toNum(e.monthlySalary) : null,
      designation: e.designation,
      joinDate: e.joinDate,
      crewId: e.crewId,
      crewName: e.crew?.name ?? null,
      activeProjectId: e.activeProjectId,
      activeProjectName: e.activeProject?.name ?? null,
      active: e.active,
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = employeeSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const created = await createEmployee({
    companyId: company.id,
    name: parsed.data.name,
    trade: parsed.data.trade ?? undefined,
    phone: parsed.data.phone ?? undefined,
    email: parsed.data.email ?? undefined,
    dailyRate: parsed.data.dailyRate ?? 0,
    wageType: parsed.data.wageType ?? "DAILY",
    monthlySalary: parsed.data.monthlySalary ?? null,
    designation: parsed.data.designation ?? undefined,
    joinDate: parsed.data.joinDate ? new Date(parsed.data.joinDate) : undefined,
    crewId: parsed.data.crewId || undefined,
    activeProjectId: parsed.data.activeProjectId || undefined,
    active: parsed.data.active ?? true,
    userId: user.id,
  });
  return json({ ok: true, id: created.id, name: created.name, trade: created.trade }, { status: 201 });
});
